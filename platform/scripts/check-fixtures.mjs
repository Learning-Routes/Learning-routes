#!/usr/bin/env node
// No personal data in test data (Platform STEP 1 §2.12): fails on an email
// address, a phone number or a long numeric id in tests, fixtures, seeds and JSON
// fixtures. example.com and example.org addresses are fine.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const SCOPE = /(^|\/)(test|tests|fixtures|seeds?)\/|(^|\/)seeds?\.[jt]s$/;
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g;
const ALLOWED_EMAIL = /@example\.(com|org)$/i;
const PHONE = /(?<![\w-])\+?\d{1,3}[ .-]?\(?\d{2,4}\)?[ .-]\d{3,4}[ .-]\d{3,4}(?![\w-])/g;
const LONG_ID = /(?<![\w.-])\d{11,}(?![\w.-])/g;
// UUIDs and hashes are generated, not personal: removed before the search.
const GENERATED = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32,}/gi;

// Matches that look like personal data and are not: { file, match }, each with a
// comment saying why. Empty today: UUIDs, hashes and example.com need no entry.
const ALLOWLIST = [];

const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  // A tracked file deleted in the working tree is still listed; there is nothing to read.
  .filter((file) => SCOPE.test(file) && !file.includes("node_modules/") && existsSync(file));

const problems = [];
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((raw, index) => {
    const line = raw.replace(GENERATED, "");
    const found = [
      ...[...line.matchAll(EMAIL)].map(([m]) => m).filter((m) => !ALLOWED_EMAIL.test(m)),
      ...[...line.matchAll(PHONE)].map(([m]) => m),
      ...[...line.matchAll(LONG_ID)].map(([m]) => m),
    ].filter((m) => !ALLOWLIST.some((allowed) => allowed.file === file && allowed.match === m));
    for (const match of found) problems.push(`${file}:${index + 1}: ${match}`);
  });
}

for (const problem of problems) console.error(problem);
if (problems.length > 0) process.exit(1);
console.log(`${files.length} test, fixture and seed files: no personal data found`);
