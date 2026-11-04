import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The MCP calls no model (Platform STEP 5): the assistant on the other end is the person's own,
// and they pay for it. Everything the Worker's entry can reach, read from its imports.

const ENTRY = new URL("../../src/mcp/index.ts", import.meta.url).pathname;
const RELATIVE_IMPORT = /from "(\.[^"]+)"/g;

function reachable(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) {
    return seen;
  }
  seen.add(file);
  for (const [, path] of readFileSync(file, "utf8").matchAll(RELATIVE_IMPORT)) {
    if (path?.endsWith(".json")) {
      continue;
    }
    reachable(`${resolve(dirname(file), path ?? "")}.ts`.replace(".ts.ts", ".ts"), seen);
  }
  return seen;
}

describe("the MCP Worker's code", () => {
  const files = [...reachable(ENTRY)];

  it("is what this test thinks it is", () => {
    expect(files.some((file) => file.endsWith("src/mcp/tools.ts"))).toBe(true);
    expect(files.some((file) => file.endsWith("src/db/repos/index.ts"))).toBe(true);
  });

  it("never imports the OpenRouter adapter, nor names its endpoint", () => {
    expect(files.filter((file) => file.includes("/src/ai/"))).toEqual([]);
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toContain("openrouter");
    }
  });
});
