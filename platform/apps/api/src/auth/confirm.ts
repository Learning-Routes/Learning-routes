import type { Hono } from "hono";
import { withDb } from "../db/with-db";
import { AUTH_PATH, CONFIRM_PATH, createAuth } from "./auth";
import type { EmailSender } from "./email";

// The sign-in link's page (Platform STEP 2 §5.3). A GET only asks "Sign in as …?";
// the page's form POSTs the token back, and only that signs in. A link scanner, or
// another site that opens the link, gets the question and nothing more. Better
// Auth's own verify, which signs in on a GET, answers 404 from outside.

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const HTML_SPECIAL = /[&<>"']/g;
const escapeHtml = (text: string) =>
  text.replace(HTML_SPECIAL, (char) => HTML_ESCAPES[char] ?? char);
const BASE64_PADDING = /=+$/;

const PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  // The token is in this page's URL: send it nowhere else.
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'",
};

/** The stored identifier of a magic link's token, as Better Auth 1.7.8 writes it (storeToken: "hashed"). */
async function identifierOf(token: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
  );
  const base64 = btoa(String.fromCharCode(...digest));
  return `magic-link:${base64.replaceAll("+", "-").replaceAll("/", "_").replace(BASE64_PADDING, "")}`;
}

/** The email an unexpired link was sent to, or null, read through Better Auth's own adapter. */
async function pendingEmail(
  auth: ReturnType<typeof createAuth>,
  token: string,
): Promise<string | null> {
  const { internalAdapter } = await auth.$context;
  const row = await internalAdapter.findVerificationValue(await identifierOf(token));
  if (row === null || row.expiresAt.getTime() <= Date.now()) {
    return null;
  }
  const { email } = JSON.parse(row.value) as { email?: unknown };
  return typeof email === "string" ? email : null;
}

function page(email: string, token: string): string {
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in</title>
<main>
<h1>Sign in as ${escapeHtml(email)}?</h1>
<form method="post" action="${CONFIRM_PATH}">
<input type="hidden" name="token" value="${escapeHtml(token)}">
<button type="submit">Sign in</button>
</form>
</main>
</html>
`;
}

export function confirmRoutes(
  app: Hono<{ Bindings: Env }>,
  emailSender: (env: Env) => EmailSender,
) {
  app.get(`${AUTH_PATH}/magic-link/verify`, (c) => c.notFound());

  app.get(CONFIRM_PATH, (c) => {
    const token = c.req.query("token") ?? "";
    return withDb(c.env, c.executionCtx, null, async (tx) => {
      const auth = createAuth(c.env, tx, emailSender(c.env));
      const email = token.length === 0 ? null : await pendingEmail(auth, token);
      return email === null
        ? c.text("This sign-in link has expired or was already used.", 404)
        : c.body(page(email, token), 200, PAGE_HEADERS);
    });
  });

  app.post(CONFIRM_PATH, async (c) => {
    const form = await c.req.formData();
    const token = String(form.get("token") ?? "");
    // Through Better Auth's handler, so its rate limits and checks apply.
    const verify = new URL(`${c.env.APP_ORIGIN}${AUTH_PATH}/magic-link/verify`);
    verify.searchParams.set("token", token);
    verify.searchParams.set("callbackURL", "/");
    const request = new Request(verify, { headers: c.req.raw.headers });
    return withDb(c.env, c.executionCtx, null, (tx) =>
      createAuth(c.env, tx, emailSender(c.env)).handler(request),
    );
  });
}
