import { afterEach, describe, expect, it } from "vitest";
import { APP, harness, json, randomEmail } from "./harness";

// The app's origin only (Platform STEP 2 §5.5). Creator storefronts on subdomains
// are the same site as the app, so SameSite=Lax alone does not stop a form on one
// of them. Every non-GET to /api/* or /mcp must carry an Origin exactly equal to
// the app's, and neither exists on any other host.

const api = harness();
afterEach(() => api.settle());

const STOREFRONT = "https://ana.app.example.test";
const USERCONTENT = "https://usercontent.app.example.test";

describe("requests from anywhere but the app", () => {
  it.each([
    ["another site", "https://evil.example"],
    ["a storefront on a subdomain", STOREFRONT],
    ["no origin at all", null],
    ["the null origin", "null"],
  ])("are refused from %s", async (_, origin) => {
    for (const path of ["/api/auth/sign-in/magic-link", "/api/a/review.submit", "/mcp"]) {
      const response = await api.call(path, { ...json({ email: randomEmail() }), origin });
      expect([path, response.status]).toEqual([path, 403]);
    }
    expect(api.sent).toEqual([]);
  });

  it("let a GET through without an Origin, and the app's own POST", async () => {
    expect((await api.call("/api/auth/ok")).status).toBe(200);
    expect(
      (
        await api.call("/api/auth/sign-in/magic-link", {
          ...json({ email: randomEmail() }),
          origin: APP,
        })
      ).status,
    ).toBe(200);
  });

  it.each([STOREFRONT, USERCONTENT])("do not reach /api or /mcp on %s", async (host) => {
    for (const path of ["/api/auth/ok", "/api/a/review.submit", "/mcp"]) {
      const response = await api.call(`${host}${path}`, { ...json({}), origin: host });
      expect([path, response.status]).toEqual([path, 404]);
    }
  });
});
