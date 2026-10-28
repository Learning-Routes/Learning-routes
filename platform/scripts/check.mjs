#!/usr/bin/env node
// pnpm check: every check CI runs, in the same order, so a contributor and CI can
// never disagree (Platform STEP 1 §4.6). Each check runs even when one before it
// failed, and the summary lists every failure.
import { spawnSync } from "node:child_process";

const CHECKS = [
  ["types", "pnpm", ["turbo", "run", "typecheck", "--continue"]],
  ["lint and format (Biome)", "pnpm", ["lint"]],
  ["boundaries (dependency-cruiser)", "pnpm", ["deps"]],
  ["unused code and dependencies (knip)", "pnpm", ["knip"]],
  ["file sizes", "pnpm", ["sizes"]],
  ["shortcuts name their STEP", "pnpm", ["shortcuts"]],
  ["file names", "pnpm", ["names"]],
  ["no personal data in fixtures", "pnpm", ["fixtures"]],
  ["versions: exact, at least 14 days old", "node", ["scripts/check-versions.mjs"]],
  ["migrations (squawk)", "pnpm", ["--filter", "@learning-routes/api", "db:lint"]],
  ["tests, with coverage floors", "pnpm", ["turbo", "run", "test", "--continue"]],
  ["builds", "pnpm", ["turbo", "run", "build"]],
  [
    "JavaScript budgets (size-limit)",
    "pnpm",
    ["--filter", "@learning-routes/web", "size"],
    "builds",
  ],
  ["Worker size budgets", "pnpm", ["worker-size"], "builds"],
  ["browser tests", "pnpm", ["--filter", "@learning-routes/web", "e2e"], "builds"],
];

const failed = [];
for (const [name, command, args, needs] of CHECKS) {
  if (needs && failed.includes(needs)) {
    console.log(`\n── ${name}: skipped, it needs ${needs}`);
    failed.push(name);
    continue;
  }
  console.log(`\n── ${name}`);
  const { status } = spawnSync(command, args, { stdio: "inherit" });
  if (status !== 0) {
    failed.push(name);
  }
}

console.log(`\n${CHECKS.length - failed.length} of ${CHECKS.length} checks passed.`);
for (const name of failed) {
  console.error(`  failed: ${name}`);
}
process.exit(failed.length > 0 ? 1 : 0);
