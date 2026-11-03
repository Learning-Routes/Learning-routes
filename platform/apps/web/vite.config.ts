import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

// persistState: false, so the local edge cache starts empty with every run, and a new
// build never serves a page the last one cached.
export default defineConfig({
  plugins: [cloudflare({ viteEnvironment: { name: "ssr" }, persistState: false }), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
});
