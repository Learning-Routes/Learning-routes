import { describe, expect, it } from "vitest";
import { TRAVEL_STYLE, TRAVEL_STYLE_HASH } from "../app/travel";

describe("the page-travel opt-in", () => {
  it("is the one inline style the policy allows, by its hash", async () => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(TRAVEL_STYLE));
    const hash = btoa(String.fromCharCode(...new Uint8Array(digest)));
    expect(TRAVEL_STYLE_HASH).toBe(`'sha256-${hash}'`);
  });
});
