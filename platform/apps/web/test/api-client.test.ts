import { describe, expect, it, vi } from "vitest";
import { apiClient } from "../workers/api-client";

const REQUEST = () =>
  new Request("https://app.example.test/api/a/x?y=1", {
    method: "POST",
    headers: { origin: "https://app.example.test" },
    body: "{}",
  });

describe("the way to the API", () => {
  it("is the service binding, in production, whatever else is set", async () => {
    const binding = vi.fn(async () => new Response("bound"));
    const fetcher = vi.fn(async () => new Response("http"));
    const client = apiClient(
      {
        API: { fetch: binding },
        ENVIRONMENT: "production",
        API_DEV_ORIGIN: "http://localhost:1",
      } as never,
      fetcher as typeof fetch,
    );
    expect(await (await client(REQUEST())).text()).toBe("bound");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("is HTTP in a local run, with the path, query and headers it came with", async () => {
    const binding = vi.fn(async () => new Response("bound"));
    const fetcher = vi.fn(async (_request: Request) => new Response("http"));
    const client = apiClient(
      {
        API: { fetch: binding },
        ENVIRONMENT: "development",
        API_DEV_ORIGIN: "http://localhost:1",
      } as never,
      fetcher as unknown as typeof fetch,
    );
    await client(REQUEST());
    const sent = fetcher.mock.calls[0]?.[0] as Request;
    expect(sent.url).toBe("http://localhost:1/api/a/x?y=1");
    expect(sent.method).toBe("POST");
    expect(sent.headers.get("origin")).toBe("https://app.example.test");
    expect(binding).not.toHaveBeenCalled();
  });
});
