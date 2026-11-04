#!/usr/bin/env node
// A file is named for what it holds, never for its type alone (FOUNDATIONS.md
// §4b): no utils, helpers, misc or common, in any folder or extension.
import { execFileSync } from "node:child_process";

const VAGUE = /(^|\/)(utils?|helpers?|misc|common)(\.[^/]+)?$/i;

const offenders = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
  encoding: "utf8",
})
  .split("\n")
  .filter((file) => file && !file.includes("node_modules/") && VAGUE.test(file));

for (const file of offenders) {
  console.error(`${file}: name it for what it holds`);
}
if (offenders.length > 0) {
  process.exit(1);
}
console.log("no file is named utils, helpers, misc or common");
