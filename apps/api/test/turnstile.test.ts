import { describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "../src/security/turnstile";

// Turnstile, verified on the server with Siteverify (Platform STEP 4 §6.3). It fails
// closed: anything but a clear yes is a no.

const env = (over: object = {}) =>
  ({
    ENVIRONMENT: "production",
    TURNSTILE_SECRET: "test-secret",
    TURNSTILE_HOSTNAMES: "app.example.test, other.example.test",
    ...over,
  }) as unknown as Env;
const yes = (over: object = {}) =>
  new Response(
    JSON.stringify({ success: true, action: "apply", hostname: "app.example.test", ...over }),
  );
const verify = (fetcher: typeof fetch, token = "a-token", on = env()) =>
  verifyTurnstile(on, token, "2001:db8::1", "apply", fetcher);

describe("verifying a Turnstile token", () => {
  it("posts the secret, the token and the client's address, and takes a clear yes", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => yes());
    expect(await verify(fetcher as typeof fetch)).toBe(true);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(init.method).toBe("POST");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("secret")).toBe("test-secret");
    expect(body.get("response")).toBe("a-token");
    expect(body.get("remoteip")).toBe("2001:db8::1");
  });

  it.each([
    ["a no", { success: false, "error-codes": ["timeout-or-duplicate"] }],
    ["another form's token", { action: "signup" }],
    ["another host's token", { hostname: "evil.example" }],
  ])("refuses %s", async (_, over) => {
    expect(await verify((async () => yes(over)) as typeof fetch)).toBe(false);
  });

  it("refuses a token that is empty or too long, without asking", async () => {
    const fetcher = vi.fn(async () => yes());
    expect(await verify(fetcher as typeof fetch, "")).toBe(false);
    expect(await verify(fetcher as typeof fetch, "x".repeat(2049))).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed when Siteverify cannot answer", async () => {
    const down = (async () => {
      throw new Error("network");
    }) as typeof fetch;
    expect(await verify(down)).toBe(false);
    expect(await verify((async () => new Response("no", { status: 500 })) as typeof fetch)).toBe(
      false,
    );
    expect(await verify((async () => new Response("not json")) as typeof fetch)).toBe(false);
  });

  it("takes Cloudflare's test keys in a local run, and never in production", async () => {
    const testing = (async () =>
      new Response(
        JSON.stringify({
          success: true,
          hostname: "example.com",
          metadata: { result_with_testing_key: true },
        }),
      )) as typeof fetch;
    expect(await verify(testing, "t", env({ ENVIRONMENT: "development" }))).toBe(true);
    expect(await verify(testing)).toBe(false);
  });

  it("refuses everything with no allowed host set", async () => {
    expect(
      await verify((async () => yes()) as typeof fetch, "t", env({ TURNSTILE_HOSTNAMES: "" })),
    ).toBe(false);
  });
});
