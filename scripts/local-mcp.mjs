#!/usr/bin/env node
// The whole platform on this machine, to try the MCP (docs/mcp.md): the API, the MCP Worker and
// the web app, against the local database. Sign-in links are printed here, not mailed.
// LOCAL ONLY: fixed test values, and Cloudflare's published Turnstile test keys.
import { spawn } from "node:child_process";

const APP = "http://localhost:4174";
const VARS = Object.entries({
  APP_ORIGIN: APP,
  ENVIRONMENT: "development",
  CREATOR_DOMAIN: "localhost:4174",
  BETTER_AUTH_SECRET: "local-only-mcp-secret-0123456789abcdef0123456789",
  CLOUDFLARE_PURGE_TOKEN: "local-unused",
  TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
  CONTENT_SIGNING_SECRET: "local-only-mcp-content-secret-0123456789abcdef",
  TURNSTILE_HOSTNAMES: "example.com",
}).flatMap(([name, value]) => ["--var", `${name}:${value}`]);

const worker = (port, ...config) => [
  "--filter",
  "@learning-routes/api",
  "exec",
  "wrangler",
  "dev",
  ...config,
  "--port",
  String(port),
  "--inspector-port",
  "0",
  "--local-upstream",
  "localhost:4174",
  ...VARS,
];

const children = [
  spawn("pnpm", worker(8788), { stdio: "inherit" }),
  spawn("pnpm", worker(8789, "--config", "wrangler.mcp.jsonc"), { stdio: "inherit" }),
  spawn(
    "pnpm",
    [
      "--filter",
      "@learning-routes/web",
      "exec",
      "vite",
      "preview",
      "--port",
      "4174",
      "--strictPort",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        API_DEV_ORIGIN: "http://localhost:8788",
        MCP_DEV_ORIGIN: "http://localhost:8789",
        CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
        APP_ORIGIN: APP,
        PLATFORM_ORIGIN: APP,
        ENVIRONMENT: "development",
        CREATOR_DOMAIN: "localhost:4174",
        TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      },
    },
  ),
];

function stop() {
  for (const child of children) {
    child.kill();
  }
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) {
  child.on("exit", stop);
}
console.log(`\nThe app: ${APP}\nThe MCP server: ${APP}/mcp\n`);
