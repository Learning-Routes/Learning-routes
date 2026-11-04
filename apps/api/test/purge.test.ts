import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_TAGS_PER_PURGE, purgeBatch, queuePurge } from "../src/cache/purge";

// Purging the edge cache by tag (Platform STEP 4 §1.4): queued after the commit, sent
// through Cloudflare's API by the queue's consumer, and a no-op in a local run.

const liveEnv = {
  ENVIRONMENT: "production",
  CLOUDFLARE_ZONE_ID: "zone-1",
  CLOUDFLARE_PURGE_TOKEN: "test-purge-token",
} as unknown as Env;

function batchOf(...tagLists: string[][]) {
  const retried: unknown[] = [];
  const acked: number[] = [];
  return {
    batch: {
      messages: tagLists.map((tags) => ({ body: { tags } })),
      ackAll: () => void acked.push(1),
      retryAll: (options: unknown) => void retried.push(options),
    } as unknown as MessageBatch<{ tags: string[] }>,
    retried,
    acked,
  };
}

const accepted = () => new Response(JSON.stringify({ success: true, errors: [] }), { status: 200 });

afterEach(() => vi.restoreAllMocks());

describe("queueing a purge", () => {
  it("sends the tags, delayed past Hyperdrive's cache so the new page reads new rows", async () => {
    const send = vi.fn(async () => undefined);
    await queuePurge({ PURGE_QUEUE: { send } } as unknown as Env, ["route:1"]);
    expect(send).toHaveBeenCalledWith({ tags: ["route:1"] }, { delaySeconds: 75 });
  });

  it("queues nothing when there is nothing to purge", async () => {
    const send = vi.fn(async () => undefined);
    await queuePurge({ PURGE_QUEUE: { send } } as unknown as Env, []);
    expect(send).not.toHaveBeenCalled();
  });

  it("never fails the request that already committed: the page expires on its own", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const send = vi.fn(async () => {
      throw new Error("queue down");
    });
    await expect(
      queuePurge({ PURGE_QUEUE: { send } } as unknown as Env, ["route:1"]),
    ).resolves.toBeUndefined();
  });
});

describe("the queue's consumer", () => {
  it("purges every tag once, with the token, on the zone's endpoint", async () => {
    const fetcher = vi.fn(async (_url: string, _init: RequestInit) => accepted());
    const { batch, acked } = batchOf(["route:1", "space:1"], ["route:1", "catalog"]);
    await purgeBatch(batch, liveEnv, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.cloudflare.com/client/v4/zones/zone-1/purge_cache");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-purge-token");
    expect(JSON.parse(init.body as string)).toEqual({ tags: ["route:1", "space:1", "catalog"] });
    expect(acked).toHaveLength(1);
  });

  it("splits a large batch at the API's limit of tags per request", async () => {
    const fetcher = vi.fn(async (_url: string, _init: RequestInit) => accepted());
    const tags = Array.from({ length: MAX_TAGS_PER_PURGE + 1 }, (_, index) => `route:${index}`);
    await purgeBatch(batchOf(tags).batch, liveEnv, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("is a no-op in a local run, and says so in the log", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetcher = vi.fn(async () => accepted());
    const { batch, acked } = batchOf(["route:1"]);
    await purgeBatch(batch, { ENVIRONMENT: "development" } as unknown as Env, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect(acked).toHaveLength(1);
    expect(log.mock.calls.flat().join(" ")).toContain("route:1");
  });

  it.each([
    ["rate limited", new Response("{}", { status: 429 })],
    [
      "refused in the body",
      new Response(JSON.stringify({ success: false, errors: [{ code: 1134 }] }), { status: 200 }),
    ],
  ])("retries later when %s", async (_, response) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { batch, retried, acked } = batchOf(["route:1"]);
    await purgeBatch(batch, liveEnv, async () => response);
    expect(retried).toEqual([{ delaySeconds: 60 }]);
    expect(acked).toEqual([]);
  });

  it("never writes the token to the log", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await purgeBatch(batchOf(["route:1"]).batch, liveEnv, async () => {
      throw new Error("network");
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain("test-purge-token");
  });
});
