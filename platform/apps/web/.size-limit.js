// JavaScript budgets on the built client (STEP 46 §2.4), gzip. Run after the build.
import { readdirSync, readFileSync } from "node:fs";

const CLIENT = "build/client";
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
    // No hydration (§3.2): the storefront loads theme.js and nothing else (e2e/storefront.spec.ts).
    name: "storefront route",
    path: [`${CLIENT}/theme.js`],
    limit: "1 KB",
    gzip: true,
  },
  {
    name: "app entry + studio route",
    path: pageScripts(["root", "routes/studio"]),
    // Measured 111.82 kB gzip on 28 October 2026; the budget is about 10% above.
    limit: "123 KB",
    gzip: true,
  },
];
