#!/usr/bin/env node
// Worker size budgets (STEP 46 §2.5): bigger Workers start slower and cost more to
// ship. Reads wrangler's own gzip figure from a dry-run deploy; build apps/web first.
// The API Worker's budget is 300 KiB, the owner's decision recorded in ADR 0004.
// Cloudflare's own limits are 64 MiB uncompressed and 1 s of startup, so the API
// Worker's startup, as wrangler profiles it locally, is printed too (not a gate).
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The MCP Worker holds the OAuth provider and the MCP SDK (ADR 0009).
const WORKERS = [
  { name: "apps/web", cwd: "apps/web", budget: 250 },
  { name: "apps/api", cwd: "apps/api", budget: 300 },
  { name: "learning-routes-mcp", cwd: "apps/api", budget: 500, config: "wrangler.mcp.jsonc" },
];
const STARTUP_PROFILED = new Set(["apps/api"]);
const STARTUP = /Active: ([\d.]+) ms/;
const GZIP = /Total Upload: [\d.]+ KiB \/ gzip: ([\d.]+) KiB/;

let failed = false;
for (const { name: app, cwd, budget, config } of WORKERS) {
  const outdir = mkdtempSync(join(tmpdir(), "worker-size-"));
  try {
    const output = execFileSync(
      "pnpm",
      [
        "exec",
        "wrangler",
        "deploy",
        "--dry-run",
        "--outdir",
        outdir,
        ...(config ? ["--config", config] : []),
      ],
      {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const match = GZIP.exec(output);
    if (!match) {
      throw new Error(`${app}: wrangler printed no gzip size`);
    }
    const size = Number(match[1]);
    const over = size > budget;
    failed ||= over;
    console[over ? "error" : "log"](
      `${app}: ${size} KiB gzip (budget ${budget} KiB)${over ? ", over" : ""}`,
    );
    if (STARTUP_PROFILED.has(app)) {
      const profile = execFileSync(
        "pnpm",
        ["exec", "wrangler", "check", "startup", "--outfile", join(outdir, "startup.cpuprofile")],
        { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      const active = STARTUP.exec(profile)?.[1] ?? "unknown";
      console.log(`${app}: startup ${active} ms active, profiled locally (limit 1000 ms)`);
    }
  } finally {
    rmSync(outdir, { recursive: true, force: true });
  }
}
if (failed) {
  process.exit(1);
}
