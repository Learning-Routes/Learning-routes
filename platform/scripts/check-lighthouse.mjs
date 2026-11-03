#!/usr/bin/env node
// The storefront's performance targets (ADR 0008), measured with Lighthouse
// on the built preview, mobile profile. Three runs, the median of each number, since
// one run is noisy. Prints the numbers; fails over a target. The preview serves files
// uncompressed and Cloudflare never does, so a small proxy gzips them, as production
// would: otherwise this measures bytes no visitor downloads.
import { execFile, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";

const PORT = 4175;
const PROXY_PORT = 4176;
const ORIGIN = `http://localhost:${PORT}`;
const PAGES = {
  landing: `http://localhost:${PROXY_PORT}/es`,
  catalog: `http://localhost:${PROXY_PORT}/es/explorar`,
  "route page": `http://mariana-ortega.localhost:${PROXY_PORT}/portugues-para-viajar`,
};
const TEXT = /^(text\/|application\/(javascript|json)|image\/svg)/;
const RUNS = 3;
// ADR 0008: three.js may block a little on the landing, and nothing may elsewhere, so
// TBT there must round to 0: "under 1 ms".
const targetsFor = (name) => ({
  "largest-contentful-paint": { name: "LCP", limit: 1800, unit: " ms" },
  "cumulative-layout-shift": { name: "CLS", limit: 0.05, unit: "" },
  "total-blocking-time": { name: "TBT", limit: name === "landing" ? 150 : 1, unit: " ms" },
});

const preview = spawn(
  "pnpm",
  ["--filter", "@learning-routes/web", "preview", "--port", String(PORT), "--strictPort"],
  {
    stdio: "ignore",
    detached: true,
    // A creator's host is [slug].localhost here, reached through the proxy below.
    env: {
      ...process.env,
      CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
      CREATOR_DOMAIN: `localhost:${PORT}`,
    },
  },
);

const proxy = createServer((request, response) => {
  // By hand, not fetch: it could not send a creator's Host on to the preview.
  const host = (request.headers.host ?? "").replace(String(PROXY_PORT), String(PORT));
  const upstream = httpRequest(
    { host: "localhost", port: PORT, path: request.url, headers: { host } },
    (answer) => {
      const chunks = [];
      answer.on("data", (chunk) => chunks.push(chunk));
      answer.on("end", () => {
        const type = answer.headers["content-type"] ?? "";
        const {
          "content-encoding": _encoding,
          "content-length": _length,
          "transfer-encoding": _transfer,
          ...headers
        } = answer.headers;
        const body = Buffer.concat(chunks);
        if (TEXT.test(type)) {
          response.writeHead(answer.statusCode, { ...headers, "content-encoding": "gzip" });
          response.end(gzipSync(body));
        } else {
          response.writeHead(answer.statusCode, headers);
          response.end(body);
        }
      });
    },
  );
  upstream.on("error", () => {
    response.writeHead(502);
    response.end();
  });
  upstream.end();
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

/** What a page sends, by kind, as Lighthouse counted it: bytes on the wire. */
function weightOf(audits) {
  const kinds = {};
  for (const { resourceType, transferSize } of audits["network-requests"].details.items) {
    kinds[resourceType] = (kinds[resourceType] ?? 0) + (transferSize ?? 0);
  }
  const kb = (bytes) => `${((bytes ?? 0) / 1024).toFixed(1)} KB`;
  return `HTML ${kb(kinds.Document)}, CSS ${kb(kinds.Stylesheet)}, JavaScript ${kb(kinds.Script)}`;
}

async function measure(name, page) {
  const runs = [];
  for (let run = 0; run < RUNS; run++) {
    const output = join(dir, `run-${run}.json`);
    await promisify(execFile)("pnpm", [
      "exec",
      "lighthouse",
      page,
      "--only-categories=performance",
      "--form-factor=mobile",
      "--output=json",
      `--output-path=${output}`,
      "--quiet",
      "--chrome-flags=--headless=new --no-sandbox",
    ]);
    runs.push(JSON.parse(readFileSync(output, "utf8")).audits);
  }
  console.log(`\n${name}: ${weightOf(runs[0])}`);
  let isOver = false;
  for (const [id, { name: metric, limit, unit }] of Object.entries(targetsFor(name))) {
    const value = median(runs.map((audits) => audits[id].numericValue));
    // A run with no measurement must fail: NaN compares false against any limit.
    const over = !Number.isFinite(value) || value >= limit;
    isOver ||= over;
    const shown = unit ? Math.round(value) : value.toFixed(3);
    console.log(`${metric}: ${shown}${unit} (target under ${limit}${unit})${over ? ", over" : ""}`);
  }
  return isOver;
}

let failed = false;
const dir = mkdtempSync(join(tmpdir(), "lighthouse-"));
try {
  await waitForPreview();
  await new Promise((done) => proxy.listen(PROXY_PORT, done));
  for (const [name, page] of Object.entries(PAGES)) {
    failed = (await measure(name, page)) || failed;
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
  proxy.close();
  process.kill(-preview.pid);
}
process.exit(failed ? 1 : 0);
