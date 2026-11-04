import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type Plugin } from "vite";

// react-dom/server.edge also carries a whole second renderer, the legacy one, which tree-shaking
// can't drop from CommonJS. entry.server.tsx uses only this file's renderToReadableStream.
const REACT_SERVER = /^react-dom\/server$/;
const edgeRenderer = join(
  dirname(createRequire(import.meta.url).resolve("react-dom/package.json")),
  "cjs/react-dom-server.edge.production.js",
);

/** The storefront's enhancement scripts (ADR 0008), at fixed addresses cached pages can name. */
function enhancementScripts(): Plugin {
  return {
    name: "enhancement-scripts",
    applyToEnvironment: (environment) => environment.name === "client",
    buildStart() {
      if (this.environment.mode === "build") {
        this.emitFile({
          type: "chunk",
          id: "app/enhance/landing.ts",
          fileName: "enhance/landing.js",
        });
        this.emitFile({
          type: "chunk",
          id: "app/enhance/stage.ts",
          fileName: "enhance/stage.js",
        });
      }
    },
  };
}

// persistState: false, so the local edge cache starts empty with every run, and a new
// build never serves a page the last one cached.
export default defineConfig(({ command }) => ({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" }, persistState: false }),
    reactRouter(),
    enhancementScripts(),
  ],
  resolve: {
    tsconfigPaths: true,
    // Only in the build: this file is React's production one, and `vite dev` runs development React.
    alias: command === "build" ? [{ find: REACT_SERVER, replacement: edgeRenderer }] : [],
  },
}));
