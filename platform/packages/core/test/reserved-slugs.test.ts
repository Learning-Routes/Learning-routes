import { describe, expect, it } from "vitest";
import { isReservedSlug, RESERVED_SLUGS } from "../src/reserved-slugs";

describe("the addresses the platform keeps", () => {
  it("hold what the review listed, and the hosts in use", () => {
    for (const slug of [
      "docs",
      "status",
      "blog",
      "help",
      "support",
      "cdn",
      "assets",
      "auth",
      "login",
      "email",
      "billing",
      "pay",
      "app",
      "new",
      "www",
      "api",
      "send",
    ]) {
      expect(isReservedSlug(slug), slug).toBe(true);
    }
  });

  it("are the same whatever the letter case, and name nobody's slug", () => {
    expect(isReservedSlug("APP")).toBe(true);
    expect(isReservedSlug("mariana-ortega")).toBe(false);
    expect(isReservedSlug("application")).toBe(false);
  });

  it("are listed once each", () => {
    expect(new Set(RESERVED_SLUGS).size).toBe(RESERVED_SLUGS.length);
  });
});
