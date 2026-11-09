// The architecture as rules (STEP 46 §2.3): the build fails when one breaks.
// Browser code is everything under apps/web/app except the server entry.
const BROWSER = "^apps/web/app/(?!entry\\.server\\.tsx$)";
// The only parts of core browser code may load at runtime: no zod, no server code. studio/session
// is the assistant's protocol (Platform STEP 10): pure types and a reducer, with no imports.
const CORE_FOR_BROWSERS =
  "^packages/core/src/(locales|copy/[a-z-]+|actions/names|studio/session)\\.ts$";

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
        path: "(^|/)node_modules/zod/|^packages/core/src/(?!locales|copy/|actions/names|studio/session)",
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
      name: "ai-sdks-only-in-the-adapter",
      comment:
        "Every model call goes through core's AI gate (ai/gate.ts) and its one platform adapter; nothing else imports an AI SDK. A test in apps/api keeps the OpenRouter endpoint in the adapter too.",
      severity: "error",
      from: { pathNot: "^apps/api/src/ai/openrouter\\.ts$" },
      to: {
        path: [
          "^(openai|@anthropic-ai/|@openrouter/|@ai-sdk/|ai$|ai/)",
          "node_modules/(openai|@anthropic-ai|@openrouter|@ai-sdk|ai)/",
        ],
      },
    },
    {
      name: "only-the-db-module-reaches-the-database",
      comment:
        "Drizzle, drizzle-kit and the Postgres drivers belong to apps/api/src/db/ (FOUNDATIONS.md §4, Platform STEP 2 §1.8). Its tooling may use them too: the migration script, drizzle.config.ts and the database tests.",
      severity: "error",
      from: {
        pathNot: [
          "^apps/api/src/db/",
          "^apps/api/scripts/",
          "^apps/api/drizzle\\.config\\.ts$",
          "^apps/api/test/db/",
          // The storefront's reads, with no Drizzle and only lr_public (Platform STEP 4 §1).
          "^packages/public-read/src/",
        ],
      },
      to: {
        path: [
          "^(drizzle-orm|drizzle-kit|pg|postgres|@planetscale/|@neondatabase/)($|/)",
          "node_modules/(drizzle-orm|drizzle-kit|pg|postgres|@planetscale|@neondatabase)/",
        ],
      },
    },
    {
      name: "public-reads-only-in-the-storefront",
      comment:
        "lr_public's repository serves the storefront alone: app code and the API use DB, with a session and row-level security (Platform STEP 4 §1.3). A public page can read nothing else.",
      severity: "error",
      from: {
        path: "^apps/",
        pathNot: ["^apps/web/app/(routes/)?storefront/", "^apps/api/test/db/"],
      },
      to: {
        path: ["^packages/public-read/", "^@learning-routes/public-read"],
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "storefront-loaders-read-only-the-public-repository",
      comment:
        "A storefront page is served to strangers and cached for all of them: it never reaches the session's database through the API (Platform STEP 4 §1.3).",
      severity: "error",
      from: { path: "^apps/web/app/(routes/)?storefront/" },
      to: { path: ["^packages/core/src/repos/", "^apps/api/"] },
    },
    {
      name: "only-auth-touches-better-auth-tables",
      comment:
        "Better Auth's tables (user, session, account, verification) are read and written only by Better Auth (Platform STEP 2 §1.8).",
      severity: "error",
      from: {
        pathNot: [
          "^apps/api/src/auth/",
          // The OAuth provider is Better Auth too, in the MCP Worker (Platform STEP 5 §2).
          "^apps/api/src/mcp/auth\\.ts$",
          // The assistant's Worker reads the sessions the API makes (Platform STEP 10).
          "^apps/api/src/agent/auth\\.ts$",
          "^apps/api/src/db/schema/",
          "^apps/api/drizzle\\.config\\.ts$",
        ],
      },
      to: { path: "^apps/api/src/db/schema/auth\\.ts$" },
    },
    {
      name: "mcp-tools-go-through-core",
      comment:
        "Every MCP tool is a core action: tools.ts and server.ts reach the database only through runAction's repositories (Platform STEP 5 §3).",
      severity: "error",
      from: { path: "^apps/api/src/mcp/(tools|server)\\.ts$" },
      to: { path: ["^apps/api/src/db/schema/", "(^|/)node_modules/drizzle-orm/"] },
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
