#!/usr/bin/env node
// How long the signed-in app's pages take (Platform STEP 15): each page five times, then the median
// time to the first byte and the median of each Server-Timing phase. The session cookie comes from
// LR_SESSION_COOKIE ("__Host-lr_session=..." or the name=value the browser sends), never from a file.
//
//   LR_SESSION_COOKIE=... node scripts/measure-app.mjs http://localhost:4174 <enrollment-id> [topic]

const RUNS = 5;
const [base, enrollment, topic = "1"] = process.argv.slice(2);
const cookie = process.env.LR_SESSION_COOKIE;

export const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** "api-lesson.play;dur=12.3, page;dur=40" → { "api-lesson.play": 12.3, page: 40 } */
export function phasesOf(header) {
  const phases = {};
  for (const entry of (header ?? "").split(",")) {
    const [name, ...params] = entry.trim().split(";");
    const duration = params.map((param) => param.trim()).find((param) => param.startsWith("dur="));
    if (name && duration) {
      phases[name] = (phases[name] ?? 0) + Number(duration.slice("dur=".length));
    }
  }
  return phases;
}

async function once(path) {
  const started = performance.now();
  const response = await fetch(new URL(path, base), { headers: { cookie }, redirect: "manual" });
  const ttfb = performance.now() - started;
  await response.arrayBuffer();
  return { status: response.status, ttfb, phases: phasesOf(response.headers.get("server-timing")) };
}

async function measure(path) {
  const runs = [];
  for (let n = 0; n < RUNS; n++) {
    runs.push(await once(path));
  }
  const names = [...new Set(runs.flatMap((run) => Object.keys(run.phases)))];
  return {
    path,
    status: runs.map((run) => run.status).join(","),
    ttfb: median(runs.map((run) => run.ttfb)),
    phases: Object.fromEntries(
      names.map((name) => [name, median(runs.map((run) => run.phases[name] ?? 0))]),
    ),
  };
}

const ms = (value) => `${value.toFixed(1)} ms`;

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!(base && enrollment && cookie)) {
    console.error(
      "usage: LR_SESSION_COOKIE=<cookie> node scripts/measure-app.mjs <origin> <enrollment-id> [topic]",
    );
    process.exit(2);
  }
  const PAGES = [
    "/mis-rutas",
    `/mis-rutas/${enrollment}`,
    `/mis-rutas/${enrollment}/tema/${topic}`,
    "/creador",
    "/es/explorar",
  ];
  const results = [];
  for (const path of PAGES) {
    results.push(await measure(path));
  }
  for (const { path, status, ttfb, phases } of results) {
    console.log(
      `\n${path.replace(enrollment, ":id")}  (status ${status})  median TTFB ${ms(ttfb)}`,
    );
    for (const [name, value] of Object.entries(phases).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${name.padEnd(44)} ${ms(value)}`);
    }
  }
  const slowest = results
    .flatMap(({ path, phases }) =>
      Object.entries(phases)
        .filter(([name]) => name !== "page")
        .map(([name, value]) => ({ page: path.replace(enrollment, ":id"), name, value })),
    )
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  console.log('\nThe five slowest phases ("page" left out: it holds the others):');
  for (const { page, name, value } of slowest) {
    console.log(`  ${ms(value).padStart(10)}  ${name}  on ${page}`);
  }
}
