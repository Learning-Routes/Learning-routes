import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dark, light } from "../tokens";

const css = readFileSync(new URL("../tokens.css", import.meta.url), "utf8");

// Custom properties declared in every block that opens with `selector {`.
function declarations(selector: string) {
  const values: Record<string, string> = {};
  const blocks = css.split(`${selector} {`).slice(1);
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
