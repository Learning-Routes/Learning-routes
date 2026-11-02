import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dark, light } from "../tokens";

const css = readFileSync(new URL("../tokens.css", import.meta.url), "utf8");

const MOTION_TOKEN = /^--(motion|ease)-/;

// Custom properties declared in every block that opens with `selector {`.
function declarations(selector: string) {
  const values: Record<string, string> = {};
  const blocks = css.split(`\n${selector} {`).slice(1);
  for (const block of blocks) {
    const body = block.slice(0, block.indexOf("\n}"));
    for (const [, name, value] of body.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) {
      values[name as string] = value as string;
    }
  }
  return values;
}

describe("tokens", () => {
  it("tokens.ts carries exactly the values of tokens.css, light and dark", () => {
    expect(light).toEqual(declarations(":root"));
    expect(dark).toEqual(declarations('html[data-theme="dark"]'));
  });

  it("gives a page with no data-theme the dark values, under the system's preference", () => {
    expect(declarations("  html:not([data-theme])")).toEqual(dark);
  });

  it("collapses every motion token under reduced motion", () => {
    const reduced = css.slice(css.indexOf("prefers-reduced-motion"));
    const names = Object.keys(light).filter((name) => MOTION_TOKEN.test(name));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(reduced).toMatch(new RegExp(`${name}: (0ms|linear);`));
    }
  });

  it("keeps the Ciruela names and values", () => {
    expect(light["--color-accent"]).toBe("#6A2EA0");
    expect(dark["--color-bg"]).toBe("#150E1C");
    expect(light["--font-sans"]).toContain('"Archivo"');
  });

  it("names the route map in the glossary's words; v1's stylesheet keeps --journey-*", () => {
    for (const tokens of [light, dark]) {
      expect(Object.keys(tokens).filter((name) => name.startsWith("--journey-"))).toEqual([]);
      expect(tokens).toHaveProperty(["--route-map-contrast-rgb"]);
    }
  });

  it("only overrides in dark what light declares", () => {
    for (const name of Object.keys(dark)) {
      expect(light).toHaveProperty([name]);
    }
  });
});
