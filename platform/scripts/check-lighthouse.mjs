#!/usr/bin/env node
// The storefront's performance targets (Platform STEP 3 §4), measured with Lighthouse
// on the built preview, mobile profile. Three runs, the median of each number, since
// one run is noisy. Prints the numbers; fails over a target. The preview serves files
// uncompressed and Cloudflare never does, so a small proxy gzips them, as production
// would: otherwise this measures bytes no visitor downloads.
import { execFile, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";

const PORT = 4175;
const PROXY_PORT = 4176;
const ORIGIN = `http://localhost:${PORT}`;
const PAGE = `http://localhost:${PROXY_PORT}/es`;
const TEXT = /^(text\/|application\/(javascript|json)|image\/svg)/;
const RUNS = 3;
const TARGETS = {
  "largest-contentful-paint": { name: "LCP", limit: 1800, unit: " ms" },
  "cumulative-layout-shift": { name: "CLS", limit: 0.05, unit: "" },
  "total-blocking-time": { name: "TBT", limit: 50, unit: " ms" },
};

const preview = spawn(
  "pnpm",
  ["--filter", "@learning-routes/web", "preview", "--port", String(PORT), "--strictPort"],
  { stdio: "ignore", detached: true },
);

const proxy = createServer(async (request, response) => {
  const upstream = await fetch(`${ORIGIN}${request.url}`);
  const type = upstream.headers.get("content-type") ?? "";
  const {
    "content-encoding": _encoding,
    "content-length": _length,
    "transfer-encoding": _transfer,
    ...headers
  } = Object.fromEntries(upstream.headers);
  const body = Buffer.from(await upstream.arrayBuffer());
  if (TEXT.test(type)) {
    response.writeHead(upstream.status, { ...headers, "content-encoding": "gzip" });
    response.end(gzipSync(body));
  } else {
    response.writeHead(upstream.status, headers);
    response.end(body);
  }
});

async function waitForPreview() {
  for (let attempt = 0; attempt < 60; attempt++) {
    const up = await fetch(`${ORIGIN}/es`).then(
      (response) => response.ok,
      () => false,
    );
    if (up) {
      return;
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error("the preview did not start");
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

let failed = false;
const dir = mkdtempSync(join(tmpdir(), "lighthouse-"));
try {
  await waitForPreview();
  await new Promise((done) => proxy.listen(PROXY_PORT, done));
  const runs = [];
  for (let run = 0; run < RUNS; run++) {
    const output = join(dir, `run-${run}.json`);
    await promisify(execFile)("pnpm", [
      "exec",
      "lighthouse",
      PAGE,
      "--only-categories=performance",
      "--form-factor=mobile",
      "--output=json",
      `--output-path=${output}`,
      "--quiet",
      "--chrome-flags=--headless=new --no-sandbox",
    ]);
    runs.push(JSON.parse(readFileSync(output, "utf8")).audits);
  }
  for (const [id, { name, limit, unit }] of Object.entries(TARGETS)) {
    const value = median(runs.map((audits) => audits[id].numericValue));
    // A run with no measurement must fail: NaN compares false against any limit.
    const over = !Number.isFinite(value) || value >= limit;
    failed ||= over;
    const shown = unit ? Math.round(value) : value.toFixed(3);
    console.log(`${name}: ${shown}${unit} (target under ${limit}${unit})${over ? ", over" : ""}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
  proxy.close();
  process.kill(-preview.pid);
}
process.exit(failed ? 1 : 0);
