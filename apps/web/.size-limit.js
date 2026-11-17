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

// The player's simulators, by the file each is built into (app/player/sims).
const SIMULATORS = [
  "piano",
  "guitar",
  "camera",
  "interest",
  "flex",
  "pie",
  "ohm",
  "equation",
  "chess",
  "wheel",
  "roleplay",
  "rhythm",
  "sequencer",
];

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
    path: [
      `${CLIENT}/assets/*.css`,
      `!${CLIENT}/assets/lesson-*.css`,
      `!${CLIENT}/assets/asistente-*.css`,
      `!${CLIENT}/assets/tema-*.css`,
      `!${CLIENT}/assets/mis-rutas-*.css`,
    ],
    limit: "20 KB",
    gzip: true,
  },
  {
    // Mis rutas has its own sheet, loaded on that page only (Platform STEP 21): the covers, the
    // shelf and their motion. It has its own budget instead of weighing on every surface.
    name: "Mis rutas CSS",
    path: `${CLIENT}/assets/mis-rutas-*.css`,
    limit: "2 KB",
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
  {
    // The creator's assistant's own stylesheet (Platform STEP 10), loaded only by that page.
    name: "assistant CSS",
    path: [`${CLIENT}/assets/asistente-*.css`],
    limit: "4 KB",
    gzip: true,
  },
  {
    // The lesson player's stylesheet (Platform STEP 12), its simulators included, loaded only by
    // the player.
    name: "player CSS",
    path: [`${CLIENT}/assets/tema-*.css`],
    limit: "10 KB",
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
    // The assistant's page without its map: the conversation works before the map loads.
    name: "app entry + assistant",
    path: pageScripts(["root", "routes/asistente"]),
    limit: "142 KB",
    gzip: true,
  },
  {
    // The assistant's map, three.js included, fetched after the page works (Platform STEP 10).
    name: "assistant map, three.js included",
    path: readdirSync(`${CLIENT}/assets`)
      .filter((file) => file.startsWith("studio-map-") && file.endsWith(".js"))
      .flatMap((file) => withImports(`${CLIENT}/assets/${file}`)),
    limit: "170 KB",
    gzip: true,
  },
  {
    name: "app entry + creator hub",
    path: pageScripts(["root", "routes/creador"]),
    // Measured 128.87 kB gzip on 5 November 2026, when the hub replaced a placeholder; the budget
    // is about 10% above that.
    limit: "142 KB",
    gzip: true,
  },
  {
    // The lesson player without its simulators (Platform STEP 12).
    name: "app entry + player",
    path: pageScripts(["root", "routes/tema"]),
    limit: "150 KB",
    gzip: true,
  },
  // Each simulator is its own chunk, fetched when a topic reaches it (Platform STEP 12).
  ...SIMULATORS.map((name) => ({
    name: `simulator: ${name}`,
    path: readdirSync(`${CLIENT}/assets`)
      .filter((file) => file.startsWith(`${name}-`) && file.endsWith(".js"))
      .map((file) => `${CLIENT}/assets/${file}`),
    limit: "15 KB",
    gzip: true,
  })),
];
