import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The owner's scripts import the app's TypeScript, which plain node cannot load, and
// vitest resolves what they would not. Importing runs no main: nothing connects.
const { scripts } = JSON.parse(readFileSync("package.json", "utf8"));

describe.each(["seed", "erase-user"])("db:%s", (name) => {
  it("loads under the runner its command names", { timeout: 30_000 }, () => {
    expect(scripts[`db:${name}`]).toBe(`tsx scripts/${name}.ts`);
    const loaded = execFileSync(
      "node_modules/.bin/tsx",
      ["--eval", `import("./scripts/${name}.ts").then(() => console.log("loaded"))`],
      { encoding: "utf8" },
    );
    expect(loaded.trim()).toBe("loaded");
  });
});
