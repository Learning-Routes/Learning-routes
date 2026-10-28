import type { KnipConfig } from "knip";

// Unused files, exports and dependencies fail CI (STEP 46 §2.2): unused code is
// bundle bytes and upgrade work.
const CSS_IMPORT = /@import\s+"([^"]+)"/g;

export default {
  workspaces: {
    ".": {
      // Run by CI and package scripts.
      entry: ["scripts/*.mjs"],
    },
    "apps/web": {
      // Loaded by the HTML, not imported.
      entry: ["public/*.js"],
    },
  },
  // CSS @import names packages too (app.css imports the design tokens).
  compilers: {
    css: (text: string) =>
      [...text.matchAll(CSS_IMPORT)].map(([, path]) => `import "${path}";`).join("\n"),
  },
} satisfies KnipConfig;
