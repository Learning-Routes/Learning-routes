import type { KnipConfig } from "knip";

// Unused files, exports and dependencies fail CI (STEP 46 §2.2): unused code is
// bundle bytes and upgrade work.
const CSS_IMPORT = /@import\s+"([^"]+)"/g;

export default {
  workspaces: {
    ".": {
      // Run by CI and package scripts.
      entry: ["scripts/*.mjs"],
      // check-worker-size.mjs runs each app's own wrangler, from that app's folder.
      ignoreBinaries: ["wrangler"],
      // Run by scripts/check-lighthouse.mjs through pnpm exec, not imported.
      ignoreDependencies: ["lighthouse"],
    },
    "apps/web": {
      // Each is built on its own by vite.config.ts, and a page names it by its address.
      entry: ["app/enhance/landing.ts"],
    },
    "apps/api": {
      // Read by Better Auth's CLI through pnpm db:auth-schema.
      entry: ["src/auth/schema.config.ts"],
    },
  },
  // CSS @import names packages too (app.css imports the design tokens).
  compilers: {
    css: (text: string) =>
      [...text.matchAll(CSS_IMPORT)].map(([, path]) => `import "${path}";`).join("\n"),
  },
} satisfies KnipConfig;
