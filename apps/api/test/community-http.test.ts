import { afterEach, describe, expect, it } from "vitest";
import { query, URLS } from "./db/connect";
import { oauthHarness } from "./mcp/oauth-harness";

// The community over HTTP (Platform STEP 17): its own addresses for the feed and notifications,
// and the 429 a person reads in their language. The rules themselves: test/db/community.test.ts.

const oauth = oauthHarness("https://client.example.test/community-http.json");
afterEach(() => oauth.settle());

const json = { "content-type": "application/json" };

/** A published route the person is enrolled in. Fictional, and removed by nobody: random slugs. */
async function enrolled(email: string) {
  const [space] = await query(
    URLS.migrator,
    `insert into spaces (slug, name, default_locale, locales)
     values ($1, '{"es":"Espacio"}', 'es', '{es}') returning id`,
    [`comunidad-${crypto.randomUUID().slice(0, 8)}`],
  );
  const [route] = await query(
    URLS.migrator,
    `insert into routes (space_id, slug, title, source_locale, access, pricing)
     values ($1, 'ruta', '{"es":"Ruta"}', 'es', 'open', 'free') returning id`,
    [space?.id],
  );
  const [spaceId, routeId] = [space?.id, route?.id];
  const steps: [string, unknown[]][] = [
    [
      `insert into route_versions (space_id, route_id, version, snapshot, snapshot_format, content_hash, published_by_user_id)
       values ($1, $2, 1, '{}', 1, repeat('0', 64), uuidv7())`,
      [spaceId, routeId],
    ],
    ["update routes set latest_published_version = 1 where id = $1", [routeId]],
    [
      `insert into memberships (space_id, user_id, role)
       select $1, id, 'student' from "user" where email = $2`,
      [spaceId, email],
    ],
    [
      `insert into enrollments (space_id, route_id, user_id, pinned_version, status)
       select $1, $2, id, 1, 'active' from "user" where email = $3`,
      [spaceId, routeId, email],
    ],
  ];
  for (const [statement, values] of steps) {
    await query(URLS.migrator, statement, values);
  }
  return route?.id as string;
}

describe("the community over HTTP", () => {
  it("has the feed and notifications at their own addresses, for the signed-in person only", async () => {
    expect((await oauth.api.call("/api/feed")).status).toBe(401);
    const person = await oauth.signIn();
    const feed = await oauth.api.call("/api/feed?limit=5", { headers: { cookie: person.cookie } });
    expect(feed.status).toBe(200);
    expect(await feed.json()).toEqual({ ok: true, output: { items: [], next: null } });
    const notes = await oauth.api.call("/api/notifications", {
      headers: { cookie: person.cookie },
    });
    expect(await notes.json()).toEqual({ ok: true, output: { items: [], next: null, unread: 0 } });
    const read = await oauth.api.call("/api/notifications/read", {
      method: "POST",
      headers: { ...json, cookie: person.cookie },
      body: "{}",
    });
    expect(await read.json()).toEqual({ ok: true, output: { read: "all" } });
  });

  it("answers 429 with a plain sentence in the person's language", async () => {
    const person = await oauth.signIn();
    const routeId = await enrolled(person.email);
    const post = () =>
      oauth.api.call("/api/a/community.post", {
        method: "POST",
        headers: { ...json, cookie: person.cookie, "accept-language": "es" },
        body: JSON.stringify({ routeId, kind: "note", body: "Una nota" }),
      });
    for (let n = 0; n < 10; n += 1) {
      expect((await post()).status).toBe(200);
    }
    const limited = await post();
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({
      ok: false,
      code: "rate_limited",
      message: "Escribiste mucho en poco tiempo. Espera un rato y vuelve a intentarlo.",
    });
  });
});
