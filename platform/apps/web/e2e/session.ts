import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { BrowserContext, Page } from "@playwright/test";

// Signing in against the real local API (Platform STEP 4 §7): the dev sender writes each
// link to the API's log, which playwright.config.ts keeps. Only invented addresses.

const API_LOG = ".wrangler/e2e-api.log";
const APP = "http://localhost:4174";
const WAIT_MS = 10_000;
const POLL_MS = 100;
const LOG_LINE = /\{"message":"sign-in link[^\n]*\}/g;

export const newAddress = (who: string) => `${who}-${crypto.randomUUID()}@example.com`;

/** The newest link the dev sender wrote for this address. */
export async function linkFor(email: string): Promise<string> {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    const lines = readFileSync(API_LOG, "utf8").match(LOG_LINE) ?? [];
    const found = lines
      .map((line) => JSON.parse(line) as { email: string; url: string })
      .findLast((entry) => entry.email === email);
    if (found) {
      return found.url;
    }
    await new Promise((done) => setTimeout(done, POLL_MS));
  }
  throw new Error("the dev sender wrote no link for this address");
}

/** Signs a browser context in through the API alone, for a screen that needs a session. */
export async function signInContext(context: BrowserContext, email: string) {
  clearLimits();
  const { request } = context;
  const headers = { origin: APP };
  await request.post(`${APP}/api/auth/sign-in/magic-link`, { headers, data: { email } });
  const token = new URLSearchParams(new URL(await linkFor(email)).hash.slice(1)).get("token") ?? "";
  // The context's request shares its cookies, so this session is the browser's too.
  const confirmed = await request.post(`${APP}/api/auth/magic-link/confirm`, {
    headers,
    form: { token },
    maxRedirects: 0,
  });
  if (confirmed.status() !== 302) {
    throw new Error(`signing in answered ${confirmed.status()}`);
  }
}

/**
 * wrangler dev gives every request one client address, so the API's per-client limits,
 * which outlive a run, would soon refuse the whole suite. In the local database only.
 */
export function clearLimits() {
  execFileSync(
    "pnpm",
    ["--filter", "@learning-routes/api", "db:seed-storefront", "--clear-limits"],
    {
      stdio: "ignore",
    },
  );
}

/** Makes an address the platform's operator, in the local database only. */
export function makeOperator(email: string) {
  execFileSync(
    "pnpm",
    ["--filter", "@learning-routes/api", "db:seed-storefront", "--operator", email],
    { stdio: "ignore" },
  );
}

/** Stands in for Turnstile's script, which is Cloudflare's to test: it earns the test token. */
export async function stubTurnstile(page: Page) {
  await page.route("https://challenges.cloudflare.com/turnstile/**", (route) => {
    const onload = new URL(route.request().url()).searchParams.get("onload");
    return route.fulfill({
      contentType: "text/javascript",
      body: `window.turnstile = {
        render(_box, options) { options.callback("XXXX.DUMMY.TOKEN.XXXX"); return "stub"; },
        reset() {},
      };
      window[${JSON.stringify(onload)}]();`,
    });
  });
}
