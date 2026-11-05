import { describe, expect, it } from "vitest";
import { withSecurityHeaders } from "../workers/security-headers";

describe("withSecurityHeaders", () => {
  it("adds HSTS for a day, without preload, and the other headers", () => {
    const { headers } = withSecurityHeaders(new Response("ok"));
    expect(headers.get("strict-transport-security")).toBe("max-age=86400");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("permissions-policy")).toContain("camera=()");
  });

  it("keeps a header the page set, its body and its status", async () => {
    const page = new Response("hola", {
      status: 404,
      headers: { "Referrer-Policy": "same-origin" },
    });
    const secured = withSecurityHeaders(page);
    expect(secured.headers.get("referrer-policy")).toBe("same-origin");
    expect(secured.status).toBe(404);
    expect(await secured.text()).toBe("hola");
  });

  it("works on an answer whose headers cannot change, as a fetch's cannot", async () => {
    const frozen = Response.redirect("https://example.com/", 302);
    expect(withSecurityHeaders(frozen).headers.get("x-content-type-options")).toBe("nosniff");
  });
});
