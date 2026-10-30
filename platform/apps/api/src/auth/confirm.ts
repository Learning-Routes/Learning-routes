import { negotiateLocale } from "@learning-routes/core/locales";
import { SIGN_IN_TEXT } from "@learning-routes/core/sign-in-text";
import type { Hono } from "hono";
import { withClient } from "../db/with-db";
import { AUTH_PATH, CONFIRM_PATH, createAuth } from "./auth";
import { type EmailSender, escapeHtml } from "./email";

// The sign-in link's page (Platform STEP 2 §5.3, and review item 11). The link
// carries the token in its fragment, which no browser sends: this page's request
// has no token, so no server, proxy or log sees it. The page asks "Sign in?" in the
// browser's language; its script, an external file that script-src 'self' allows,
// moves the token into the form, and the form's POST is the only thing that signs
// in. A link scanner, or another site that opens the link, gets the question and
// nothing more. Better Auth's own verify, which signs in on a GET, answers 404.

const PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  // Not no-referrer: a browser then sends the form's POST with Origin: null, which
  // the app-origin check refuses.
  "referrer-policy": "same-origin",
  "content-security-policy":
    "default-src 'none'; script-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

const SCRIPT_PATH = `${CONFIRM_PATH}.js`;

/** Moves the token from the fragment into the form, and out of the address bar. */
const SCRIPT = `// The sign-in token is in the link's fragment, which no request carries.
const token = new URLSearchParams(location.hash.slice(1)).get("token");
history.replaceState(null, "", location.pathname);
const form = document.querySelector("form");
if (token && form) {
  form.elements.token.value = token;
} else {
  form?.setAttribute("hidden", "");
  document.getElementById("no-link")?.removeAttribute("hidden");
}
`;

function page(acceptLanguage: string | undefined): string {
  const locale = negotiateLocale(acceptLanguage);
  const words = SIGN_IN_TEXT[locale];
  return `<!doctype html>
<html lang="${locale}">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(words.pageTitle)}</title>
<script src="${SCRIPT_PATH}" defer></script>
<main>
<h1>${escapeHtml(words.pageQuestion)}</h1>
<form method="post" action="${CONFIRM_PATH}">
<input type="hidden" name="token" value="">
<button type="submit">${escapeHtml(words.pageAction)}</button>
</form>
<p id="no-link" hidden>${escapeHtml(words.pageNoLink)}</p>
</main>
</html>
`;
}

export function confirmRoutes(
  app: Hono<{ Bindings: Env }>,
  emailSender: (env: Env) => EmailSender,
) {
  app.get(`${AUTH_PATH}/magic-link/verify`, (c) => c.notFound());

  app.get(CONFIRM_PATH, (c) => c.body(page(c.req.header("accept-language")), 200, PAGE_HEADERS));

  app.get(SCRIPT_PATH, (c) =>
    c.body(SCRIPT, 200, {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
    }),
  );

  app.post(CONFIRM_PATH, async (c) => {
    const form = await c.req.formData().catch(() => null);
    const field = form?.get("token");
    if (typeof field !== "string" || field.length === 0) {
      return c.text("Bad request", 400);
    }
    const token = field;
    // Through Better Auth's handler, so its rate limits and checks apply.
    const verify = new URL(`${c.env.APP_ORIGIN}${AUTH_PATH}/magic-link/verify`);
    verify.searchParams.set("token", token);
    verify.searchParams.set("callbackURL", "/");
    const request = new Request(verify, { headers: c.req.raw.headers });
    return withClient(c.env, c.executionCtx, (db) =>
      createAuth(c.env, db, emailSender(c.env)).handler(request),
    );
  });
}
