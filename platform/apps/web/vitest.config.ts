import { defineConfig } from "vitest/config";

// Kept apart from vite.config.ts: unit tests render components in Node and do not
// need the React Router or Cloudflare plugins.
export default defineConfig({});
