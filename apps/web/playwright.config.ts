import { defineConfig } from "@playwright/test";

// The built Worker, served by workerd through `vite preview`. The browser is the
// installed Chrome (GitHub's Ubuntu runners have it), so nothing is downloaded, except
// for the visual project, which needs one fixed build so its baselines stay stable.
// Each server's readiness check is a page the edge never keeps: it runs before the
// fixtures are seeded, and a cached landing would stay empty for the whole run.
// Port 4173 runs as production. Port 4174 is the same build with ENVIRONMENT set to
// development, for the components page, on an app origin that keeps the theme cookie.
const LOCAL = {
  API_DEV_ORIGIN: "http://localhost:8788",
  MCP_DEV_ORIGIN: "http://localhost:8789",
  AGENT_DEV_ORIGIN: "http://localhost:8790",
  CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
  APP_ORIGIN: "http://localhost:4174",
  ENVIRONMENT: "development",
  PLATFORM_ORIGIN: "http://localhost:4174",
  CREATOR_DOMAIN: "localhost:4174",
  TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
};
const VISUAL = "visual.spec.ts";
const CHANGES_DATA = [
  "connect.spec.ts",
  "mcp-whole-path.spec.ts",
  "admin.spec.ts",
  "teach.spec.ts",
  "my-routes.spec.ts",
  "whole-path.spec.ts",
  "lesson.spec.ts",
];
const JOURNEY = "journey.spec.ts";
// On main the journey is recorded at both sizes for the reviewer (STEP 11-prep §A2).
const JOURNEY_VIDEO = Boolean(process.env.JOURNEY_VIDEO);
const API_LOG = ".wrangler/e2e-api.log";
const AGENT_LOG = ".wrangler/e2e-agent.log";
const API_VARS = Object.entries({
  APP_ORIGIN: "http://localhost:4174",
  ENVIRONMENT: "development",
  BETTER_AUTH_SECRET: "local-only-e2e-secret-0123456789abcdef0123456789",
  CLOUDFLARE_PURGE_TOKEN: "local-unused",
  TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
  CONTENT_SIGNING_SECRET: "local-only-e2e-content-secret-0123456789abcdef",
  TURNSTILE_HOSTNAMES: "example.com",
  CREATOR_DOMAIN: "localhost:4174",
})
  .map(([name, value]) => `--var ${name}:${value}`)
  .join(" ");

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  snapshotPathTemplate: "{testDir}/visual-baselines/{arg}{ext}",
  use: { baseURL: "http://localhost:4173" },
  projects: [
    { name: "chrome", testIgnore: [VISUAL, JOURNEY, ...CHANGES_DATA], use: { channel: "chrome" } },
    ...(process.env.CI
      ? [{ name: "visual", testMatch: VISUAL, use: { browserName: "chromium" as const } }]
      : []),
    // These change the data the screenshots show, so on CI they wait for them.
    {
      name: "flows",
      testMatch: CHANGES_DATA,
      use: { channel: "chrome" },
      dependencies: process.env.CI ? ["visual"] : [],
    },
    // The whole journey (STEP 11-prep §A2), one creator to one student. Its own project: the size it
    // runs and records at is a project's. On main it is recorded at both sizes; elsewhere a video and
    // a trace are kept only when it fails. The phone run comes after, never beside it: the ledger
    // is one total for everyone.
    ...[
      {
        name: "journey",
        viewport: { width: 1440, height: 900 },
        after: process.env.CI ? ["visual"] : [],
      },
      ...(JOURNEY_VIDEO
        ? [{ name: "journey-390", viewport: { width: 390, height: 844 }, after: ["journey"] }]
        : []),
    ].map(({ name, viewport, after }) => ({
      name,
      testMatch: JOURNEY,
      dependencies: after,
      use: {
        channel: "chrome",
        viewport,
        video: {
          mode: JOURNEY_VIDEO ? ("on" as const) : ("retain-on-failure" as const),
          size: viewport,
        },
        trace: "retain-on-failure" as const,
      },
    })),
  ],
  webServer: [
    // The real API, on the real local database, reached through the service binding.
    // LOCAL ONLY: fixed test values, and Cloudflare's published Turnstile test key. Its log
    // holds the dev sender's sign-in links, which the tests read.
    {
      command: `sh -c 'pnpm --filter @learning-routes/api exec wrangler dev --port 8788 --inspector-port 0 --local-upstream localhost:4174 ${API_VARS} 2>&1 | tee ${API_LOG}'`,
      url: "http://localhost:8788/health",
      reuseExistingServer: false,
    },
    // The MCP Worker: the OAuth provider and the server (Platform STEP 5).
    {
      command: `pnpm --filter @learning-routes/api exec wrangler dev --config wrangler.mcp.jsonc --port 8789 --inspector-port 0 --local-upstream localhost:4174 ${API_VARS}`,
      url: "http://localhost:8789/health",
      reuseExistingServer: false,
    },
    // The creator's assistant (Platform STEP 10), answered by the scripted provider (STEP 11-prep):
    // no network, no cost. A script's calls come faster than a space's minute allows. Its log holds
    // the spend book's and the ledger's lines, which the journey reads.
    {
      command: `sh -c 'pnpm --filter @learning-routes/api exec wrangler dev --config wrangler.agent.jsonc --port 8790 --inspector-port 0 --local-upstream localhost:4174 ${API_VARS} --var MODEL_PROVIDER:scripted --var AGENT_CALLS_PER_MINUTE:100 2>&1 | tee ${AGENT_LOG}'`,
      url: "http://localhost:8790/health",
      reuseExistingServer: false,
    },
    {
      command: "vite preview --port 4173 --strictPort",
      url: "http://localhost:4173/sign-in",
      reuseExistingServer: false,
    },
    {
      command: "vite preview --port 4174 --strictPort",
      url: "http://localhost:4174/sign-in",
      reuseExistingServer: false,
      env: LOCAL,
    },
  ],
});
