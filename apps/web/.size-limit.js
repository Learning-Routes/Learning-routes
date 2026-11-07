// JavaScript budgets on the built client (STEP 46 §2.4), gzip. Run after the build.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const CLIENT = "build/client";
const ENHANCE = `${CLIENT}/enhance`;
const MANIFEST_PREFIX = /^window\.__reactRouterManifest=/;

const manifestFile = readdirSync(`${CLIENT}/assets`).find((file) => file.startsWith("manifest-"));
if (!manifestFile) {
  throw new Error("no React Router manifest: build apps/web first");
}
const manifest = JSON.parse(
  readFileSync(`${CLIENT}/assets/${manifestFile}`, "utf8")
    .replace(MANIFEST_PREFIX, "")
    .replace(/;\s*$/, ""),
);

// A script and everything it imports, as the browser would fetch it.
const IMPORTED = /(?:from\s*|import\s*\(?\s*)["'`](\.[^"'`]+)["'`]/g;
function withImports(file, seen = new Set()) {
  if (!seen.has(file)) {
    seen.add(file);
    for (const [, path] of readFileSync(file, "utf8").matchAll(IMPORTED)) {
      withImports(join(dirname(file), path), seen);
    }
  }
  return [...seen];
}

// What a page of these routes loads: the manifest, the entry, and each route's module and imports.
function pageScripts(routeIds) {
  const paths = [`/assets/${manifestFile}`, manifest.entry.module, ...manifest.entry.imports];
  for (const id of routeIds) {
    paths.push(manifest.routes[id].module, ...manifest.routes[id].imports);
  }
  return [...new Set(paths)].map((path) => `${CLIENT}${path}`);
}

export default [
  {
    // Static CSS, one file for every surface (Platform STEP 3 §2.2). No storefront
    // script may block the first paint: e2e/storefront.spec.ts checks that.
    name: "storefront CSS",
    path: [`${CLIENT}/assets/*.css`, `!${CLIENT}/assets/lesson-*.css`],
    limit: "20 KB",
    gzip: true,
  },
  {
    // A lesson's own stylesheet, loaded only by a topic and a draft's preview. Measured 2.2 kB
    // gzip on 6 November 2026, with the creation block; the budget is about 10% above that.
    name: "lesson CSS",
    path: [`${CLIENT}/assets/lesson-*.css`],
    limit: "2.5 KB",
    gzip: true,
  },
  // Enhancement JavaScript, loaded after the first paint (ADR 0008). three.js only here.
  {
    name: "landing enhancement, three.js included",
    path: withImports(`${ENHANCE}/landing.js`),
    limit: "190 KB",
    gzip: true,
  },
  // Any other page's script, each on its own.
  ...readdirSync(ENHANCE)
    .filter((file) => file.endsWith(".js") && file !== "landing.js")
    .map((file) => ({
      name: `storefront enhancement: ${file}`,
      path: withImports(`${ENHANCE}/${file}`),
      limit: "15 KB",
      gzip: true,
    })),
  {
    name: "app entry + creator hub",
    path: pageScripts(["root", "routes/creador"]),
    // Measured 128.87 kB gzip on 5 November 2026, when the hub replaced a placeholder; the budget
    // is about 10% above that.
    limit: "142 KB",
    gzip: true,
  },
];
