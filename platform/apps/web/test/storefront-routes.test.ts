import { describe, expect, it } from "vitest";
import { storefront } from "../app/surface";

// dependency-cruiser keeps client-only code out of app/routes/storefront/; this
// keeps every route there served as a storefront (no hydration).
const routes = import.meta.glob<unknown>("../app/routes/storefront/*.tsx", {
  import: "handle",
  eager: true,
});

describe("storefront routes", () => {
  it("are all served as plain HTML", () => {
    expect(Object.keys(routes).length).toBeGreaterThan(0);
    for (const [file, handle] of Object.entries(routes)) expect(handle, file).toBe(storefront);
  });
});
