import { afterEach, describe, expect, it } from "vitest";
import { readStartIntent, startIntentCookie } from "../../src/auth/start-intent";
import { query, URLS } from "../db/connect";
import { APP, harness, json, randomEmail, TEST_SECRET } from "./harness";

// "Empezar" before signing in (Platform STEP 4 §6.1): the route survives the magic link's
// round trip in a signed, short-lived cookie. The id never travels in the email's link.

const ROUTE = "0192d3a0-0000-7000-8000-000000000001";
const NOW = 1_800_000_000_000;
const COOKIE = /^__Host-lr_start=[^;]+; Max-Age=3600; Path=\/; HttpOnly; Secure; SameSite=Lax$/;
const api = harness();
afterEach(() => api.settle());

const cookieValue = (cookie: string) => cookie.split(";")[0] ?? "";

describe("the start cookie", () => {
  it("is exact, and reads back as the route", async () => {
    const cookie = await startIntentCookie(TEST_SECRET, ROUTE, NOW);
    expect(cookie).toMatch(COOKIE);
    expect(await readStartIntent(TEST_SECRET, cookieValue(cookie), NOW)).toBe(ROUTE);
  });

  it("is refused once it is over an hour old", async () => {
    const cookie = cookieValue(await startIntentCookie(TEST_SECRET, ROUTE, NOW));
    expect(await readStartIntent(TEST_SECRET, cookie, NOW + 3_600_001)).toBeNull();
  });

  it("is refused when anything in it changed, or with another secret", async () => {
    const cookie = cookieValue(await startIntentCookie(TEST_SECRET, ROUTE, NOW));
    const other = cookie.replace(ROUTE, "0192d3a0-0000-7000-8000-000000000002");
    expect(await readStartIntent(TEST_SECRET, other, NOW)).toBeNull();
    expect(await readStartIntent("another-secret", cookie, NOW)).toBeNull();
    expect(await readStartIntent(TEST_SECRET, "__Host-lr_start=nonsense", NOW)).toBeNull();
    expect(await readStartIntent(TEST_SECRET, null, NOW)).toBeNull();
  });
});

async function linkFor(email: string) {
  await api.call("/api/auth/sign-in/magic-link", json({ email }));
  const link = api.sent.find((message) => message.email === email);
  return {
    url: link?.url ?? "",
    token: new URLSearchParams(new URL(link?.url ?? "").hash.slice(1)).get("token") ?? "",
  };
}

const confirm = (token: string, cookie?: string) =>
  api.call("/api/auth/magic-link/confirm", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams({ token }).toString(),
  });

describe("the round trip", () => {
  it("sets the cookie from the app, through its origin check", async () => {
    const asked = await api.call("/api/start/intent", json({ routeId: ROUTE }));
    expect(asked.status).toBe(204);
    expect(asked.headers.getSetCookie()[0]).toMatch(COOKIE);
    const elsewhere = await api.call("/api/start/intent", {
      ...json({ routeId: ROUTE }),
      origin: "https://ana.app.example.test",
    });
    expect(elsewhere.status).toBe(403);
    expect((await api.call("/api/start/intent", json({ routeId: "not-a-uuid" }))).status).toBe(400);
  });

  it("the email's link never carries the route, and signing in returns to it", async () => {
    const cookie = cookieValue(await startIntentCookie(TEST_SECRET, ROUTE, Date.now()));
    const { url, token } = await linkFor(randomEmail());
    expect(url).not.toContain(ROUTE);
    const signedIn = await confirm(token, cookie);
    expect(signedIn.status).toBe(302);
    expect(signedIn.headers.get("location")).toBe(`${APP}/empezar?ruta=${ROUTE}`);
    // Used up with the sign-in.
    expect(signedIn.headers.getSetCookie().join()).toContain("__Host-lr_start=; Max-Age=0");
  });

  it("with no cookie, or a forged one, signing in goes to Mis rutas", async () => {
    const plain = await linkFor(randomEmail());
    expect((await confirm(plain.token)).headers.get("location")).toBe(`${APP}/mis-rutas`);
    const forged = await linkFor(randomEmail());
    const signedIn = await confirm(forged.token, `__Host-lr_start=${ROUTE}.9999999999999.forged`);
    expect(signedIn.headers.get("location")).toBe(`${APP}/mis-rutas`);
  });
});

describe("what /empezar may say about a route", () => {
  async function published(access: "open" | "closed") {
    const [space] = await query(
      URLS.migrator,
      `insert into spaces (slug, name, default_locale, locales) values ('start-' || uuidv7(), '{"es": "Ana"}', 'es', '{es}') returning id`,
    );
    const [route] = await query(
      URLS.migrator,
      `insert into routes (space_id, slug, title, source_locale, access, pricing)
       values ($1, 'r', '{"es": "Guitarra"}', 'es', $2, 'free') returning id`,
      [space.id, access],
    );
    const snapshot = {
      route: {
        id: route.id,
        slug: "r",
        title: { es: "Guitarra" },
        description: null,
        sourceLocale: "es",
        access,
        pricing: "free",
      },
      modules: [],
      lessons: [],
      prerequisites: [],
      blocks: [],
    };
    await query(
      URLS.migrator,
      `insert into route_versions (space_id, route_id, version, snapshot, snapshot_format, content_hash, published_by_user_id)
       values ($1, $2, 1, $3, 1, repeat('0', 64), uuidv7())`,
      [space.id, route.id, JSON.stringify(snapshot)],
    );
    await query(URLS.migrator, "update routes set latest_published_version = 1 where id = $1", [
      route.id,
    ]);
    return route.id as string;
  }

  it("names a published route and who teaches it, to anyone, and is never kept", async () => {
    const routeId = await published("open");
    const response = await api.call(`/api/start/preview?ruta=${routeId}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      title: { es: "Guitarra" },
      creator: { es: "Ana" },
      isOpen: true,
    });
  });

  it("says a closed route is not open", async () => {
    const routeId = await published("closed");
    const response = await api.call(`/api/start/preview?ruta=${routeId}`);
    expect(await response.json()).toMatchObject({ isOpen: false });
  });

  it("answers 404 for a route that is unknown, unpublished or not an id", async () => {
    expect((await api.call(`/api/start/preview?ruta=${crypto.randomUUID()}`)).status).toBe(404);
    expect((await api.call("/api/start/preview?ruta=nonsense")).status).toBe(404);
  });
});

describe("a link opened on another device", () => {
  const askWith = async (cookie: string) => {
    const email = randomEmail();
    const asked = await api.call("/api/auth/sign-in/magic-link", json({ email }, { cookie }));
    expect(asked.status).toBe(200);
    const link = new URL(api.sent.find((entry) => entry.email === email)?.url ?? "");
    return new URLSearchParams(link.hash.slice(1)).get("token") ?? "";
  };
  const open = (token: string, cookie?: string) =>
    api.call("/api/auth/magic-link/confirm", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...(cookie ? { cookie } : {}),
      },
      body: new URLSearchParams({ token }).toString(),
    });

  it("still lands on Empezar, with no cookie on that device", async () => {
    const cookie = cookieValue(await startIntentCookie(TEST_SECRET, ROUTE, Date.now()));
    const answer = await open(await askWith(cookie));
    expect(answer.headers.get("location")).toBe(`${APP}/empezar?ruta=${ROUTE}`);
  });

  it("still goes back to the assistant's request", async () => {
    const waiting = encodeURIComponent("client_id=a&sig=b");
    const answer = await open(await askWith(`__Host-lr_connect=${waiting}`));
    expect(answer.headers.get("location")).toBe(
      `${APP}/api/auth/oauth2/authorize?client_id=a&sig=b`,
    );
  });

  it("follows the link's own intent, not what the other device has", async () => {
    const cookie = cookieValue(await startIntentCookie(TEST_SECRET, ROUTE, Date.now()));
    const other = cookieValue(
      await startIntentCookie(TEST_SECRET, "0192d3a0-0000-7000-8000-000000000002", Date.now()),
    );
    const answer = await open(await askWith(cookie), other);
    expect(answer.headers.get("location")).toBe(`${APP}/empezar?ruta=${ROUTE}`);
  });

  it("with nothing kept and no cookie, goes to Mis rutas", async () => {
    const answer = await open(await askWith("other=1"));
    expect(answer.headers.get("location")).toBe(`${APP}/mis-rutas`);
  });

  it("never puts the intent in the email's link", async () => {
    const cookie = cookieValue(await startIntentCookie(TEST_SECRET, ROUTE, Date.now()));
    const token = await askWith(cookie);
    const message = api.sent.find((entry) => entry.url.includes(encodeURIComponent(token)));
    expect(message?.url).not.toContain(ROUTE);
  });
});
