import { describe, expect, it, vi } from "vitest";
import { servedFromEdge } from "../workers/edge-cache";

// The storefront's edge cache (Platform STEP 4 §1.4): what a route marks as public is
// kept by URL, whoever asked for it first. The Workers Cache setting is not used: its
// key leaves out the host, and creators' hosts share one Worker.

const PUBLIC_HEADERS = {
  "cache-control": "public, s-maxage=300, stale-while-revalidate=60",
  "cache-tag": "route:1",
};
const PAGE_URL = "https://maria.learningroutes.com/guitarra";

function fakeCache() {
  const stored = new Map<string, Response>();
  return {
    stored,
    match: vi.fn(async (key: Request) => stored.get(key.url)?.clone()),
    put: vi.fn(async (key: Request, response: Response) => void stored.set(key.url, response)),
  };
}

function fakeCtx() {
  const pending: Promise<unknown>[] = [];
  return { pending, waitUntil: (promise: Promise<unknown>) => void pending.push(promise) };
}

const page = (headers: Record<string, string> = PUBLIC_HEADERS, status = 200) =>
  vi.fn(async (_request: Request) => new Response("<html>", { status, headers }));

describe("the storefront's edge cache", () => {
  it("renders once, then serves the same page from the cache", async () => {
    const cache = fakeCache();
    const ctx = fakeCtx();
    const render = page();
    const first = await servedFromEdge(new Request(PAGE_URL), ctx, cache, render);
    await Promise.all(ctx.pending);
    const second = await servedFromEdge(new Request(PAGE_URL), ctx, cache, render);
    expect(render).toHaveBeenCalledTimes(1);
    expect(await second.text()).toBe(await first.text());
  });

  it("keeps the page by its bare URL, so no cookie or header can split or poison it", async () => {
    const cache = fakeCache();
    const ctx = fakeCtx();
    await servedFromEdge(
      new Request(PAGE_URL, { headers: { cookie: "a=1", "accept-language": "fr" } }),
      ctx,
      cache,
      page(),
    );
    await Promise.all(ctx.pending);
    const key = cache.put.mock.calls[0]?.[0] as Request;
    expect(key.headers.get("cookie")).toBeNull();
    expect(key.headers.get("accept-language")).toBeNull();
  });

  it("keeps each host's page apart", async () => {
    const cache = fakeCache();
    const ctx = fakeCtx();
    const render = page();
    await servedFromEdge(new Request(PAGE_URL), ctx, cache, render);
    await Promise.all(ctx.pending);
    await servedFromEdge(
      new Request("https://ana.learningroutes.com/guitarra"),
      ctx,
      cache,
      render,
    );
    expect(render).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["a page with no public mark", page({})],
    ["a private page", page({ "cache-control": "private, no-store" })],
    ["a page setting a cookie", page({ ...PUBLIC_HEADERS, "set-cookie": "a=1" })],
    ["a missing page", page(PUBLIC_HEADERS, 404)],
  ])("never keeps %s", async (_, render) => {
    const cache = fakeCache();
    const ctx = fakeCtx();
    await servedFromEdge(new Request(PAGE_URL), ctx, cache, render);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("does not touch the cache for anything but a GET", async () => {
    const cache = fakeCache();
    const render = page();
    await servedFromEdge(new Request(PAGE_URL, { method: "POST" }), fakeCtx(), cache, render);
    expect(cache.match).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("still answers when the cache fails", async () => {
    const cache = fakeCache();
    cache.match.mockRejectedValue(new Error("cache down"));
    const response = await servedFromEdge(new Request(PAGE_URL), fakeCtx(), cache, page());
    expect(response.status).toBe(200);
  });
});
