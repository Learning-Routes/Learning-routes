import { afterEach, describe, expect, it } from "vitest";
import { query, URLS } from "../db/connect";
import { harness, json, randomEmail } from "./harness";

// Admin's actions over HTTP (Platform STEP 4 §7.2, §7.4): to anyone but an operator they do
// not exist, and a decision purges the right tags, after the commit.

const api = harness();
afterEach(() => api.settle());

async function signIn() {
  const email = randomEmail();
  await api.call("/api/auth/sign-in/magic-link", json({ email }));
  const link = api.sent.find((message) => message.email === email);
  const token = new URLSearchParams(new URL(link?.url ?? "").hash.slice(1)).get("token") ?? "";
  const confirmed = await api.call("/api/auth/magic-link/confirm", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
  });
  const cookie = (
    confirmed.headers.getSetCookie().find((entry) => entry.startsWith("__Host-lr_session")) ?? ""
  ).split(";")[0];
  const [user] = await query(URLS.migrator, `select id from "user" where email = $1`, [email]);
  return { cookie: cookie ?? "", userId: user?.id as string };
}

const ADMIN_ACTIONS: [string, object][] = [
  ["admin.overview", {}],
  ["catalog.decide", { listingId: crypto.randomUUID(), decision: "approve" }],
  ["catalog.feature", { listingId: crypto.randomUUID(), position: 1 }],
  ["application.decide", { applicationId: crypto.randomUUID(), status: "invited" }],
];

async function requestedListing() {
  const [space] = await query(
    URLS.migrator,
    `insert into spaces (slug, name, default_locale, locales) values ('admin-' || uuidv7(), '{"en": "S"}', 'en', '{en}') returning id`,
  );
  const [route] = await query(
    URLS.migrator,
    `insert into routes (space_id, slug, title, source_locale, access, pricing)
     values ($1, 'r', '{"en": "R"}', 'en', 'open', 'free') returning id`,
    [space.id],
  );
  const [listing] = await query(
    URLS.migrator,
    "insert into catalog_listings (route_id, space_id, status) values ($1, $2, 'requested') returning id",
    [route.id, space.id],
  );
  return {
    spaceId: space.id as string,
    routeId: route.id as string,
    listingId: listing.id as string,
  };
}

describe("admin's actions", () => {
  it.each(ADMIN_ACTIONS)(
    "%s answers 404 to a person who is not an operator",
    async (name, input) => {
      const { cookie } = await signIn();
      const response = await api.call(`/api/a/${name}`, json(input, { cookie }));
      expect(response.status).toBe(404);
    },
  );

  it.each(ADMIN_ACTIONS)("%s runs nothing with no session", async (name, input) => {
    expect((await api.call(`/api/a/${name}`, json(input))).status).toBe(401);
  });

  it("an operator's decision purges the route, its space and the catalog, once committed", async () => {
    const { cookie, userId } = await signIn();
    await query(
      URLS.migrator,
      "insert into platform_roles (user_id, is_operator) values ($1, true)",
      [userId],
    );
    const { spaceId, routeId, listingId } = await requestedListing();
    const response = await api.call(
      "/api/a/catalog.decide",
      json({ listingId, decision: "approve" }, { cookie }),
    );
    expect(response.status).toBe(200);
    expect(api.purges).toContainEqual({
      tags: [`route:${routeId}`, `space:${spaceId}`, "catalog"],
    });
    const [log] = await query(
      URLS.migrator,
      "select outcome, actor_user_id from action_log where space_id = $1 and action = 'catalog.decide'",
      [spaceId],
    );
    expect(log).toEqual({ outcome: "ok", actor_user_id: userId });
  });

  it("the log keeps an application's decision, in no space", async () => {
    const { cookie, userId } = await signIn();
    await query(
      URLS.migrator,
      "insert into platform_roles (user_id, is_operator) values ($1, true)",
      [userId],
    );
    const [application] = await query(
      URLS.migrator,
      `insert into creator_applications (name, email, teaches, locale)
       values ('Ana', $1, 'Guitarra', 'es') returning id`,
      [randomEmail()],
    );
    const response = await api.call(
      "/api/a/application.decide",
      json({ applicationId: application.id, status: "invited" }, { cookie }),
    );
    expect(response.status).toBe(200);
    const logged = await query(
      URLS.migrator,
      "select space_id, outcome from action_log where actor_user_id = $1 and action = 'application.decide'",
      [userId],
    );
    expect(logged).toEqual([{ space_id: null, outcome: "ok" }]);
  });
});
