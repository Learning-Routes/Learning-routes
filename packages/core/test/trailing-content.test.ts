import { describe, expect, it } from "vitest";
import { linesOutsideFences, splitJsonObject } from "../src/content/trailing-content";

describe("trailing content", () => {
  it("skips fenced code, and the fence lines themselves", () => {
    expect([...linesOutsideFences(["a\n", "```\n", "b\n", "```\n", "c\n"])]).toEqual([
      ["a", 0],
      ["c", 4],
    ]);
  });

  it("finds the balanced object, ignoring braces and escaped quotes inside strings", () => {
    const body = '{"a": "x}\\"y", "b": {"c": 1}} after';
    expect(splitJsonObject(body)).toEqual(['{"a": "x}\\"y", "b": {"c": 1}}', " after"]);
  });

  it("finds no object when it never closes", () => {
    expect(splitJsonObject('{"a": "unclosed')).toEqual([null, '{"a": "unclosed']);
  });
});
