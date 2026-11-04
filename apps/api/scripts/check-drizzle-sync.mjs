#!/usr/bin/env node
// The migrations match the Drizzle schema (Platform STEP 2 review, item 15):
// drizzle-kit generate must find nothing to write. A file it writes means a schema
// change has no migration; the file is removed again and the check fails. RLS,
// grants, functions and triggers live in hand-written SQL migrations, which
// drizzle-kit does not compare.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const OUT = new URL("../drizzle/", import.meta.url);
const META = new URL("meta/", OUT);
const list = () => [
  ...readdirSync(OUT).map((name) => new URL(name, OUT)),
  ...readdirSync(META).map((name) => new URL(name, META)),
];

const before = new Set(list().map(String));
const journal = new URL("_journal.json", META);
const journalBefore = readFileSync(journal, "utf8");
const { status } = spawnSync("drizzle-kit", ["generate"], { stdio: "inherit" });
const added = list().filter((url) => !before.has(String(url)));
for (const url of added) {
  rmSync(url);
}
writeFileSync(journal, journalBefore);
if (status !== 0 || added.length > 0) {
  console.error(
    `The schema and the migrations disagree: drizzle-kit generate wrote ${added.length} file(s). Run pnpm db:generate and fold the change into a migration.`,
  );
  process.exit(1);
}
