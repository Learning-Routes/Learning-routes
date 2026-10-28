// The architecture as rules (STEP 46 §2.3): the build fails when one breaks.
// Browser code is everything under apps/web/app except the server entry.
const BROWSER = "^apps/web/app/(?!entry\\.server\\.tsx$)";
// The only parts of core browser code may load at runtime: no zod, no server code.
const CORE_FOR_BROWSERS = "^packages/core/src/(locales|actions/names)\\.ts$";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "core-depends-on-no-platform",
      comment:
        "packages/core holds the rules and runs anywhere: no Cloudflare, Hono, React, Drizzle or node: module (ADR 0002; Biome checks part of this too).",
      severity: "error",
      from: { path: "^packages/core/src" },
      to: {
        // Resolved through node_modules, or left unresolved when core does not depend on it.
        path: [
          "^(@cloudflare/|hono$|hono/|react$|react/|react-dom|react-router|drizzle-orm|cloudflare:)",
          "node_modules/(@cloudflare/|hono/|react/|react-dom/|react-router/|drizzle-orm/)",
        ],
      },
    },
    {
      name: "core-uses-no-node-builtins",
      severity: "error",
      from: { path: "^packages/core/src" },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "browser-imports-core-only-through-browser-subpaths",
      comment:
        "Browser code loads core only through @learning-routes/core/browser and /locales; everything else pulls zod or server code (the prototype's 2 KB to 93 KB jump). Types are free.",
      severity: "error",
      from: { path: BROWSER },
      to: {
        path: "^packages/core/src/",
        pathNot: CORE_FOR_BROWSERS,
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "browser-subpaths-pull-no-zod",
      severity: "error",
      from: { path: CORE_FOR_BROWSERS },
      to: {
        path: "(^|/)node_modules/zod/|^packages/core/src/(?!locales|actions/names)",
        reachable: true,
      },
    },
    {
      name: "storefront-routes-load-no-client-code",
      comment:
        "The storefront ships no React runtime (§3.2), so its routes import nothing meant to run in the browser.",
      severity: "error",
      from: { path: "^apps/web/app/routes/storefront/" },
      to: {
        path: "(^|/)node_modules/react-dom/client|\\.client\\.tsx?$|^apps/web/app/(api|ids)\\.ts$",
      },
    },
    {
      name: "web-and-api-stay-apart",
      severity: "error",
      from: { path: "^apps/(web|api)/" },
      to: { path: "^apps/(web|api)/", pathNot: "^apps/$1/" },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(build|dist|\\.react-router|\\.wrangler)/" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types", "default"],
      extensions: [".ts", ".tsx", ".js", ".mjs"],
    },
  },
};
