#!/usr/bin/env node
// The version rule (STEP 46 §2.6): every dependency in every package.json is an
// exact version, published at least minimumReleaseAge minutes ago (the same
// number pnpm-workspace.yaml gives pnpm). pnpm applies that setting only when it
// resolves, not to an existing lockfile, so this checks the pins themselves.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const EXACT = /^\d+\.\d+\.\d+$/;
const MINUTES = /^minimumReleaseAge:\s*(\d+)\s*$/m;
const SECTIONS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];

const minutes = Number(MINUTES.exec(readFileSync("pnpm-workspace.yaml", "utf8"))?.[1]);
if (!minutes) {
  throw new Error("pnpm-workspace.yaml sets no minimumReleaseAge");
}
const cutoff = Date.now() - minutes * 60_000;

const files = execFileSync("git", ["ls-files", "package.json", "**/package.json"], {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);

const pins = files.flatMap((file) => {
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  return SECTIONS.flatMap((section) =>
    Object.entries(manifest[section] ?? {}).map(([name, spec]) => ({ file, name, spec })),
  );
});

const problems = [];
for (const { file, name, spec } of pins) {
  if (spec.startsWith("workspace:")) {
    continue;
  }
  if (!EXACT.test(spec)) {
    problems.push(`${file}: ${name} is "${spec}", not an exact version`);
    continue;
  }
  const response = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}`);
  if (!response.ok) {
    throw new Error(`the registry answered ${response.status} for ${name}`);
  }
  const published = Date.parse((await response.json()).time?.[spec]);
  if (!(published <= cutoff)) {
    const days = ((Date.now() - published) / 86_400_000).toFixed(1);
    problems.push(`${file}: ${name}@${spec} was published ${days} days ago`);
  }
}

for (const problem of problems) {
  console.error(problem);
}
if (problems.length > 0) {
  process.exit(1);
}
console.log(`${pins.length} pins: all exact, all at least ${minutes / 1440} days old`);
