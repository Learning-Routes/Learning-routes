import { afterEach, describe, expect, it } from "vitest";
import { identifierOf } from "../../src/auth/confirm";
import { query, URLS } from "../db/connect";
import { APP, harness, json, randomEmail } from "./harness";

// Signing in with a link (Platform STEP 2 §5.3, §5.4). The link opens a page that
// asks "Sign in as …?" and posts the token back; nothing signs in on a GET, so a
// link scanner, or a page on another site that opens the link, signs in nobody.

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
  return { email, url, token: url.searchParams.get("token") ?? "" };
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
    expect(token.length).toBeGreaterThan(20);
    const stored = await query(
      URLS.migrator,
      "select 1 from verification where identifier like '%' || $1 || '%'",
      [token],
    );
    expect(stored).toEqual([]);
  });

  it("asks on a GET, and signs in nobody: the page posts the token back", async () => {
    const { email, url, token } = await requestLink();
    for (const _ of [1, 2]) {
      const page = await api.call(`${url.pathname}${url.search}`);
      expect(page.status).toBe(200);
      expect(page.headers.getSetCookie()).toEqual([]);
      const html = await page.text();
      expect(html).toContain(`Sign in as ${email}?`);
      expect(html).toContain('<form method="post" action="/api/auth/magic-link/confirm">');
    }
    // Better Auth's own GET verify, which would sign in, does not exist here.
    const scanner = await api.call(
      `/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`,
    );
    expect(scanner.status).toBe(404);
    expect(scanner.headers.getSetCookie()).toEqual([]);
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

  it("answers 400 to a POST that is not a form, and 404 to a stored value that is not a link's", async () => {
    const notAForm = await api.call("/api/auth/magic-link/confirm", json({ token: "x" }));
    expect(notAForm.status).toBe(400);
    const token = crypto.randomUUID();
    await query(
      URLS.migrator,
      "insert into verification (identifier, value, expires_at) values ($1, 'not json', now() + interval '5 minutes')",
      [await identifierOf(token)],
    );
    expect((await api.call(`/api/auth/magic-link/confirm?token=${token}`)).status).toBe(404);
  });

  it("finds a link's stored row by the same identifier Better Auth 1.7.8 writes", async () => {
    const { token } = await requestLink();
    const rows = await query(URLS.migrator, "select 1 from verification where identifier = $1", [
      await identifierOf(token),
    ]);
    expect(rows).toHaveLength(1);
  });

  it("shows no email for a token that does not exist", async () => {
    const page = await api.call("/api/auth/magic-link/confirm?token=not-a-real-token");
    expect(page.status).toBe(404);
  });
});
