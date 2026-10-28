#!/usr/bin/env node
// Worker size budgets (STEP 46 §2.5): bigger Workers start slower and cost more to
// ship. Reads wrangler's own gzip figure from a dry-run deploy; build apps/web first.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BUDGETS_KIB = { "apps/web": 250, "apps/api": 150 };
const GZIP = /Total Upload: [\d.]+ KiB \/ gzip: ([\d.]+) KiB/;

let failed = false;
for (const [app, budget] of Object.entries(BUDGETS_KIB)) {
  const outdir = mkdtempSync(join(tmpdir(), "worker-size-"));
  try {
    const output = execFileSync(
      "pnpm",
      ["exec", "wrangler", "deploy", "--dry-run", "--outdir", outdir],
      {
        cwd: app,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const match = GZIP.exec(output);
    if (!match) throw new Error(`${app}: wrangler printed no gzip size`);
    const size = Number(match[1]);
    const over = size > budget;
    failed ||= over;
    console[over ? "error" : "log"](
      `${app}: ${size} KiB gzip (budget ${budget} KiB)${over ? ", over" : ""}`,
    );
  } finally {
    rmSync(outdir, { recursive: true, force: true });
  }
}
if (failed) process.exit(1);
