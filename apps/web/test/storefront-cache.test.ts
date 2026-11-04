import { describe, expect, it } from "vitest";
import { storefrontHeaders } from "../app/storefront/cache";

describe("a storefront page's cache headers", () => {
  it("are public for five minutes at the edge, and name the page's tags", () => {
    const headers = storefrontHeaders(["space:1", "route:2"]);
    expect(headers["Cache-Control"]).toBe("public, s-maxage=300, stale-while-revalidate=60");
    expect(headers["Cache-Tag"]).toBe("space:1,route:2");
  });
});
