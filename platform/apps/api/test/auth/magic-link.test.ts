import { afterEach, describe, expect, it } from "vitest";
import { query, URLS } from "../db/connect";
import { APP, harness, json, randomEmail } from "./harness";

// Signing in with a link (Platform STEP 2 §5.3, §5.4, and review item 11). The link
// carries the token in its fragment, which no request sends: the page it opens asks
// "Sign in?", and its script moves the token into the form that posts it back.
// Nothing signs in on a GET, so a link scanner, or a page on another site that
// opens the link, signs in nobody, and no server or log ever sees the token in a URL.

const SESSION_COOKIE_FIRST = /^__Host-lr_session=[^;]+; /;
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const api = harness();
afterEach(() => api.settle());

async function requestLink(email = randomEmail()) {
  const response = await api.call("/api/auth/sign-in/magic-link", json({ email }));
  expect(response.status).toBe(200);
  const message = api.sent.find((entry) => entry.email === email);
  if (message === undefined) {
    throw new Error("no link was sent");
  }
  const url = new URL(message.url);
  return { email, url, token: new URLSearchParams(url.hash.slice(1)).get("token") ?? "" };
}

const confirm = (token: string, headers: Record<string, string> = {}, origin?: string) =>
  api.call("/api/auth/magic-link/confirm", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams({ token }).toString(),
    origin,
  });

const sessionCookie = (response: Response) =>
  response.headers.getSetCookie().find((cookie) => cookie.startsWith("__Host-"));

describe("signing in with a link", () => {
  it("sends a link to the app's confirmation page, and stores only the token's hash", async () => {
    const { url, token } = await requestLink();
    expect(`${url.origin}${url.pathname}`).toBe(`${APP}/api/auth/magic-link/confirm`);
    // The request the link makes carries no token: it is only in the fragment.
    expect(url.search).toBe("");
    expect(url.href.split("#")[0]).not.toContain(token);
    expect(token.length).toBeGreaterThan(20);
    const stored = await query(
      URLS.migrator,
      "select 1 from verification where identifier like '%' || $1 || '%'",
      [token],
    );
    expect(stored).toEqual([]);
  });

  it("writes the email in the language the browser asked in", async () => {
    const email = randomEmail();
    const response = await api.call(
      "/api/auth/sign-in/magic-link",
      json({ email }, { "accept-language": "fr-CA,fr;q=0.9,en;q=0.5" }),
    );
    expect(response.status).toBe(200);
    expect(api.sent.find((entry) => entry.email === email)?.locale).toBe("fr");
  });

  it("asks on a GET, in the browser's language, and signs in nobody", async () => {
    const { url, token } = await requestLink();
    for (const _ of [1, 2]) {
      const page = await api.call(url.pathname, { headers: { "accept-language": "en" } });
      expect(page.status).toBe(200);
      expect(page.headers.getSetCookie()).toEqual([]);
      const html = await page.text();
      expect(html).toContain("Sign in to New Learning Routes?");
      expect(html).toContain('<form method="post" action="/api/auth/magic-link/confirm">');
      expect(html).toContain('<script src="/api/auth/magic-link/confirm.js" defer></script>');
      expect(html).not.toContain(token);
      expect(page.headers.get("content-security-policy")).toContain("script-src 'self'");
    }
    const spanish = await api.call(url.pathname, { headers: { "accept-language": "es-MX,es" } });
    const html = await spanish.text();
    expect(html).toContain('<html lang="es">');
    expect(html).toContain("¿Entrar en New Learning Routes?");
    // Better Auth's own GET verify, which would sign in, does not exist here.
    const scanner = await api.call(
      `/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`,
    );
    expect(scanner.status).toBe(404);
    expect(scanner.headers.getSetCookie()).toEqual([]);
  });

  it("serves the page's script from the app, which moves the fragment's token into the form", async () => {
    const script = await api.call("/api/auth/magic-link/confirm.js");
    expect(script.status).toBe(200);
    expect(script.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    const source = await script.text();
    expect(source).toContain("location.hash");
    expect(source).toContain("history.replaceState");
  });

  it("signs in on the POST, once, with an exact __Host- session cookie and a uuidv7 user", async () => {
    const { email, token } = await requestLink();
    const signedIn = await confirm(token);
    expect(signedIn.status).toBe(302);
    const cookie = sessionCookie(signedIn) ?? "";
    expect(cookie).toMatch(SESSION_COOKIE_FIRST);
    const attributes = cookie
      .split("; ")
      .slice(1)
      .map((part) => part.split("=")[0]?.toLowerCase());
    expect(attributes).toEqual(expect.arrayContaining(["path", "httponly", "secure", "samesite"]));
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(attributes).not.toContain("domain");

    const [user] = await query(URLS.migrator, `select id from "user" where email = $1`, [email]);
    expect(user?.id).toMatch(UUID_V7);

    const again = await confirm(token);
    expect(sessionCookie(again)).toBeUndefined();
  });

  it("posts from a page whose referrer policy keeps the Origin a browser sends", async () => {
    const { url, token } = await requestLink();
    const page = await api.call(`${url.pathname}${url.search}`);
    // Fetch: a form POST from a no-referrer page carries Origin: null.
    const policy = page.headers.get("referrer-policy") ?? "";
    const browserOrigin = policy === "no-referrer" ? "null" : APP;
    const signedIn = await confirm(token, {}, browserOrigin);
    expect(signedIn.status).toBe(302);
    expect(sessionCookie(signedIn)).toBeDefined();
  });

  it("answers 400 to a POST that is not a form, and signs in nobody with a token that does not exist", async () => {
    const notAForm = await api.call("/api/auth/magic-link/confirm", json({ token: "x" }));
    expect(notAForm.status).toBe(400);
    const unknown = await confirm(crypto.randomUUID());
    expect(sessionCookie(unknown)).toBeUndefined();
  });
});
