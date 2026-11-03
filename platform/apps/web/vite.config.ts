import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type Plugin } from "vite";

// persistState: false, so the local edge cache starts empty with every run, and a new
// build never serves a page the last one cached.
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
      }
    },
  };
}

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" }, persistState: false }),
    reactRouter(),
    enhancementScripts(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
