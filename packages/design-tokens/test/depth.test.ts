import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { depthCss } from "../depth";

const stepsIn = (rule: string) => (rule.match(/color-mix/g) ?? []).length;
const rule = (css: string, selector: string) =>
  css.slice(css.indexOf(`${selector} {`)).split("}")[0] ?? "";

describe("titles with depth", () => {
  it("depth.css is what depth.ts makes", () => {
    const file = readFileSync(new URL("../depth.css", import.meta.url), "utf8");
    expect(file).toBe(depthCss());
  });

  it("keeps to the professional depth: 7 and 3 steps, and about 30% fewer on the desk", () => {
    const css = depthCss();
    expect(stepsIn(rule(css, ".depth-1"))).toBe(7);
    expect(stepsIn(rule(css, ".depth-2"))).toBe(3);
    expect(stepsIn(rule(css, ".desk .depth-1"))).toBe(5);
    expect(stepsIn(rule(css, ".desk .depth-2"))).toBe(2);
  });
});
