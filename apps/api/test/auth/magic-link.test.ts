import { afterEach, describe, expect, it } from "vitest";
import { maskAddress, screenAfterConfirm } from "../../src/auth/confirm";
import { query, URLS } from "../db/connect";
import { APP, harness, json, randomEmail, randomIp } from "./harness";

// Signing in with a link (Platform STEP 2 §5.3, §5.4, and review item 11). The link
// carries the token in its fragment, which no request sends: the app's page it opens
// asks which address it signs in, shows it, and posts the token back from a form.
// Nothing signs in on a GET, so a link scanner, or a page on another site that
// opens the link, signs in nobody, and no server or log ever sees the token in a URL.

const EXACT_SESSION_COOKIE =
  /^__Host-lr_session=[^;\s]+; Max-Age=604800; Path=\/; HttpOnly; Secure; SameSite=Lax$/;
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PADDING = /=+$/;
const PEEK_MAX = 30;
const PEEK_TOKEN_MAX = 10;
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

const peek = (token: string) => api.call("/api/auth/magic-link/peek", json({ token }));

/** How Better Auth stores a token: the base64url of its SHA-256. */
async function identifierOf(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(PADDING, "");
}

const sessionCookie = (response: Response) =>
  response.headers.getSetCookie().find((cookie) => cookie.startsWith("__Host-"));

describe("signing in with a link", () => {
  it("sends a link to the app's confirmation page, and stores only the token's hash", async () => {
    const { url, token } = await requestLink();
    expect(`${url.origin}${url.pathname}`).toBe(`${APP}/sign-in/confirm`);
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

  it("refuses a sign-in request that names the account: the name is not the requester's to set", async () => {
    const email = randomEmail();
    const response = await api.call(
      "/api/auth/sign-in/magic-link",
      json({ email, name: "Someone else" }),
    );
    expect(response.status).toBe(400);
    expect(api.sent.some((entry) => entry.email === email)).toBe(false);
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

  it("signs in nobody on a GET: the API has no page for the link, and Better Auth's verify is gone", async () => {
    const { token } = await requestLink();
    const page = await api.call("/api/auth/magic-link/confirm");
    expect(page.status).toBe(404);
    expect(page.headers.getSetCookie()).toEqual([]);
    const scanner = await api.call(
      `/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`,
    );
    expect(scanner.status).toBe(404);
    expect(scanner.headers.getSetCookie()).toEqual([]);
  });

  it("says which address a link signs in, masked, without using it up", async () => {
    const { email, token } = await requestLink();
    for (const _ of [1, 2]) {
      const peeked = await peek(token);
      expect(peeked.status).toBe(200);
      const body = await peeked.json();
      expect(body).toEqual({ email: `${email.slice(0, 2)}•••@example.com` });
      expect(JSON.stringify(body)).not.toContain(email);
      expect(peeked.headers.getSetCookie()).toEqual([]);
      expect(peeked.headers.get("cache-control")).toBe("no-store");
    }
    expect(sessionCookie(await confirm(token))).toBeDefined();
    expect((await peek(token)).status).toBe(404);
  });

  it("masks an address to its first two characters and its whole domain", () => {
    expect(maskAddress("lector@example.com")).toBe("le•••@example.com");
    expect(maskAddress("ab@example.com")).toBe("ab•••@example.com");
    expect(maskAddress("a@example.com")).toBe("a•••@example.com");
    expect(maskAddress("a@b@example.com")).toBe("a@•••@example.com");
  });

  it("answers the same for an unknown, an expired and a used token", async () => {
    const expired = await requestLink();
    const rows = await query(
      URLS.migrator,
      "update verification set expires_at = now() - interval '1 minute' where identifier = $1 returning 1",
      [`magic-link:${await identifierOf(expired.token)}`],
    );
    expect(rows).toHaveLength(1);
    const used = await requestLink();
    expect(sessionCookie(await confirm(used.token))).toBeDefined();

    const answers = await Promise.all(
      [crypto.randomUUID(), expired.token, used.token].map(async (token) => {
        const response = await peek(token);
        return {
          status: response.status,
          body: await response.text(),
          headers: [...response.headers.entries()],
        };
      }),
    );
    expect(answers[0]?.status).toBe(404);
    expect(answers[0]?.headers).toContainEqual(["cache-control", "no-store"]);
    expect(answers[1]).toEqual(answers[0]);
    expect(answers[2]).toEqual(answers[0]);
  });

  it("does not cache a request that is not a lookup", async () => {
    const notJson = await api.call("/api/auth/magic-link/peek", json({ nothing: true }));
    expect(notJson.status).toBe(400);
    expect(notJson.headers.get("cache-control")).toBe("no-store");
  });

  it("limits how often one client can look a link up, and counts each client apart", async () => {
    const ip = randomIp();
    const lookups = Array.from({ length: PEEK_MAX + 5 }, () =>
      api.call("/api/auth/magic-link/peek", { ...json({ token: crypto.randomUUID() }), ip }),
    );
    const responses = await Promise.all(lookups);
    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 404).length).toBeLessThanOrEqual(PEEK_MAX);
    expect(statuses.filter((status) => status === 429).length).toBeGreaterThan(0);
    const limited = responses.find((response) => response.status === 429);
    expect(limited?.headers.get("cache-control")).toBe("no-store");
    const another = await api.call("/api/auth/magic-link/peek", {
      ...json({ token: crypto.randomUUID() }),
      ip: randomIp(),
    });
    expect(another.status).toBe(404);
  });

  it("limits how often one token can be looked up, from any client, known or not", async () => {
    for (const token of [(await requestLink()).token, crypto.randomUUID()]) {
      const responses = [];
      // One at a time, each from a new client, so only the token's own limit can answer.
      for (let lookup = 0; lookup < PEEK_TOKEN_MAX; lookup++) {
        responses.push((await peek(token)).status);
      }
      expect(responses).not.toContain(429);
      expect((await peek(token)).status).toBe(429);
    }
  });

  it("signs in on the POST, once, with an exact __Host- session cookie and a uuidv7 user", async () => {
    const { email, token } = await requestLink();
    const signedIn = await confirm(token);
    expect(signedIn.status).toBe(302);
    expect(signedIn.headers.get("location")).toBe(`${APP}/mis-rutas`);
    // The whole Set-Cookie, exactly, and no other cookie: __Host- with Secure,
    // Path=/ and no Domain, HttpOnly, SameSite=Lax, for Better Auth's seven days.
    const cookies = signedIn.headers.getSetCookie();
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(EXACT_SESSION_COOKIE);

    const [user] = await query(URLS.migrator, `select id from "user" where email = $1`, [email]);
    expect(user?.id).toMatch(UUID_V7);

    const again = await confirm(token);
    expect(sessionCookie(again)).toBeUndefined();
    expect(again.headers.get("location")).toContain("/sign-in?notice=expired");
  });

  it("answers 400 to a POST that is not a form, and signs in nobody with a token that does not exist", async () => {
    const notAForm = await api.call("/api/auth/magic-link/confirm", json({ token: "x" }));
    expect(notAForm.status).toBe(400);
    const unknown = await confirm(crypto.randomUUID());
    expect(sessionCookie(unknown)).toBeUndefined();
  });
});

describe("the screen after the confirm POST", () => {
  const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });

  it("lets a sign-in through, and says expired only when the link is the problem", () => {
    expect(screenAfterConfirm(redirect(`${APP}/mis-rutas`))).toBeNull();
    expect(screenAfterConfirm(redirect(`${APP}/sign-in?notice=expired&error=INVALID_TOKEN`))).toBe(
      "/sign-in?notice=expired",
    );
  });

  it("never blames the link for a fault on our side, or shows a raw error", () => {
    for (const code of ["failed_to_create_session", "failed_to_create_user", "user_not_found"]) {
      expect(screenAfterConfirm(redirect(`${APP}/sign-in?notice=expired&error=${code}`))).toBe(
        "/sign-in?notice=failed",
      );
    }
    expect(screenAfterConfirm(new Response(null, { status: 500 }))).toBe("/sign-in?notice=failed");
    expect(screenAfterConfirm(new Response(null, { status: 429 }))).toBe("/sign-in?notice=limited");
  });
});
