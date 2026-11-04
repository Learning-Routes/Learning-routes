import { describe, expect, it } from "vitest";
import { newBlockId } from "../src/ids";

const FROZEN_ID = /^01a17814-ee00-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const sources = import.meta.glob("../src/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

// core is pure: time, randomness and stored state come in as arguments.
const IMPURE = [
  /\bDate\.now\b/,
  /\bnew Date\b/,
  /\bMath\.random\b/,
  /\bgetRandomValues\b/,
  /\bperformance\.now\b/,
  /\bfetch\(/,
  /\bset(?:Timeout|Interval)\b/,
];

describe("core purity", () => {
  it("reads no clock, no randomness and no network", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    const found = Object.entries(sources).flatMap(([file, text]) =>
      IMPURE.filter((pattern) => pattern.test(text)).map((pattern) => `${file}: ${pattern}`),
    );
    expect(found).toEqual([]);
  });

  it("makes a block id from the time and the random bytes it is given", () => {
    const random = new Uint8Array(10).fill(0xab);
    const id = newBlockId(Date.parse("2026-10-26T12:00:00Z"), random);
    expect(id).toBe(newBlockId(Date.parse("2026-10-26T12:00:00Z"), random));
    expect(id).toMatch(FROZEN_ID);
    expect(() => newBlockId(0, new Uint8Array(4))).toThrow(RangeError);
  });
});
