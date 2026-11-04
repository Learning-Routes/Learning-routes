#!/usr/bin/env node
// Shortcuts are tracked (Platform STEP 1 §4.5): a `shortcut` comment names the
// STEP that removes it, as `shortcut(Platform STEP 2): …`. Prints every shortcut,
// so CI shows what is owed, and fails on one without a STEP.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CODE = /\.(ts|tsx|js|mjs|cjs|json|ya?ml|css)$/;
const SHORTCUT = /\bshortcut\b\s*(\([^)]*\))?\s*:/gi;
const TRACKED = /^\(Platform STEP \d+\)$/;

const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  // Docs and this script describe the syntax; they hold no shortcut.
  .filter(
    (file) =>
      CODE.test(file) &&
      !file.startsWith("docs/") &&
      !file.includes("node_modules/") &&
      file !== "scripts/check-shortcuts.mjs",
  );

let untracked = 0;
for (const file of files) {
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      for (const match of line.matchAll(SHORTCUT)) {
        const ok = TRACKED.test(match[1] ?? "");
        untracked += ok ? 0 : 1;
        const where = `${file}:${index + 1}: ${line.trim()}`;
        if (ok) {
          console.log(where);
        } else {
          console.error(`${where}\n  names no STEP: write shortcut(Platform STEP <n>): …`);
        }
      }
    });
}
if (untracked > 0) {
  process.exit(1);
}
