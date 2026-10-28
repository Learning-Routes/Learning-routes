import { describe, expect, it } from "vitest";
import { parseJsonc } from "./jsonc";

describe("parseJsonc, how the tests read wrangler.jsonc", () => {
  it("accepts what wrangler accepts: comments anywhere and trailing commas", () => {
    const text = `{
      // a whole-line comment
      "url": "postgres://a:b@localhost/db", // a trailing comment
      "list": [1, 2,],
      /* a block comment */
    }`;
    expect(parseJsonc(text)).toEqual({ url: "postgres://a:b@localhost/db", list: [1, 2] });
  });

  it("throws on text that is not JSONC", () => {
    expect(() => parseJsonc("{ url: }")).toThrow();
  });
});
