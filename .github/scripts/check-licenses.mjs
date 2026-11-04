#!/usr/bin/env node
// Every source package declares the repository's license (LICENSE.md, FSL-1.1-ALv2): each
// package.json tracked by git must say "license": "SEE LICENSE IN LICENSE.md". Run on every pull
// request.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const EXPECTED = "SEE LICENSE IN LICENSE.md";

const files = execFileSync("git", ["ls-files", "--", "*package.json"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
if (files.length === 0) {
  console.error("no package.json found: is this the repository root?");
  process.exit(1);
}
const missing = files.filter((file) => JSON.parse(readFileSync(file, "utf8")).license !== EXPECTED);
if (missing.length === 0) {
  console.log(`${files.length} packages declare ${EXPECTED}`);
} else {
  for (const file of missing) {
    console.log(`${file}: "license" must be "${EXPECTED}"`);
  }
  process.exit(1);
}
