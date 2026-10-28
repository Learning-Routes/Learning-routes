import { defineConfig } from "vitest/config";

// Kept apart from vite.config.ts: unit tests render components in Node and do not
// need the React Router or Cloudflare plugins. e2e/ is Playwright's.
export default defineConfig({ test: { include: ["test/**/*.test.{ts,tsx}"] } });
