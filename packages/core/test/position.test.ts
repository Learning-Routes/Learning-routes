import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { keyBetween } from "../src/content/position";

// Postgres compares positions with collate "C", byte by byte, as JavaScript's < does
// for ASCII strings.

describe("keyBetween, fractional positions (Platform STEP 2 §2.7)", () => {
  it("makes a first key, and keys before and after any key", () => {
    const first = keyBetween(null, null);
    expect(keyBetween(null, first) < first).toBe(true);
    expect(keyBetween(first, null) > first).toBe(true);
  });

  it("always makes a key that sorts between its two neighbours, however many inserts", () => {
    fc.assert(
      fc.property(fc.array(fc.nat(), { minLength: 1, maxLength: 200 }), (choices) => {
        const keys = [keyBetween(null, null)];
        for (const choice of choices) {
          const at = choice % (keys.length + 1);
          const key = keyBetween(keys[at - 1] ?? null, keys[at] ?? null);
          keys.splice(at, 0, key);
        }
        for (let i = 1; i < keys.length; i++) {
          expect((keys[i - 1] as string) < (keys[i] as string)).toBe(true);
        }
      }),
    );
  });

  it("never renumbers: every key ever made stays as it was", () => {
    const a = keyBetween(null, null);
    const b = keyBetween(a, null);
    const between = keyBetween(a, b);
    expect([a, between, b]).toEqual([b, a, between].sort());
  });

  it("takes a shorter key when the next one has room after its first digit", () => {
    expect(keyBetween("1", "2V")).toBe("2");
  });

  it("refuses neighbours out of order, equal, or not made by keyBetween", () => {
    const a = keyBetween(null, null);
    const b = keyBetween(a, null);
    expect(() => keyBetween(b, a)).toThrow(RangeError);
    expect(() => keyBetween(a, a)).toThrow(RangeError);
    expect(() => keyBetween("a0", null)).toThrow(RangeError);
    expect(() => keyBetween("", null)).toThrow(RangeError);
    expect(() => keyBetween("é", null)).toThrow(RangeError);
  });
});
