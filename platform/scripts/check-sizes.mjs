#!/usr/bin/env node
// Small files (Platform STEP 1 §4.3): a source file in packages/*/src or
// apps/*/src (apps/web's is app/) holds at most 300 lines. Tests, generated
// files and migrations are exempt. Function length is Biome's job
// (noExcessiveLinesPerFunction, 60 lines).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MAX_LINES = 300;
const SOURCE = /^(packages\/[^/]+\/src|apps\/[^/]+\/(src|app))\/.+\.(ts|tsx|js|mjs)$/;
const EXEMPT =
  /(^|\/)(test|tests|e2e|drizzle|migrations)\/|\.(test|spec)\.[jt]sx?$|\.d\.ts$|\/\+types\//;

const tooLong = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  .filter((file) => SOURCE.test(file) && !EXEMPT.test(file))
  .map((file) => ({ file, lines: readFileSync(file, "utf8").trimEnd().split("\n").length }))
  .filter(({ lines }) => lines > MAX_LINES);

for (const { file, lines } of tooLong) {
  console.error(`${file}: ${lines} lines, over ${MAX_LINES}`);
}
if (tooLong.length > 0) {
  process.exit(1);
}
console.log(`every source file is at most ${MAX_LINES} lines`);
