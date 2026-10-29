import { afterEach, describe, expect, it } from "vitest";
import { query, URLS } from "../db/connect";
import { harness, json, randomEmail } from "./harness";

// The actor comes only from the session (Platform STEP 2 §5.7): the API reads
// Actor.userId from Better Auth's session, never from a request body.

const api = harness();
afterEach(() => api.settle());

/** Signs in through the real link flow and returns the session cookie and user id. */
async function signIn() {
  const email = randomEmail();
  await api.call("/api/auth/sign-in/magic-link", json({ email }));
  const link = api.sent.find((message) => message.email === email);
  const token = new URL(link?.url ?? "").searchParams.get("token") ?? "";
  const confirmed = await api.call("/api/auth/magic-link/confirm", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
  });
  const cookie = (
    confirmed.headers.getSetCookie().find((entry) => entry.startsWith("__Host-")) ?? ""
  ).split(";")[0];
  const [user] = await query(URLS.migrator, `select id from "user" where email = $1`, [email]);
  return { cookie: cookie ?? "", userId: user?.id as string };
}

/** A published route the user is enrolled in, made as the migrator. */
async function enrollment(userId: string) {
  const [space] = await query(
    URLS.migrator,
    `insert into spaces (slug, name, default_locale, locales) values ('actor-' || uuidv7(), '{"en": "S"}', 'en', '{en}') returning id`,
  );
  const [route] = await query(
    URLS.migrator,
    `insert into routes (space_id, slug, title, source_locale, access, pricing, latest_published_version)
     values ($1, 'r', '{"en": "R"}', 'en', 'open', 'free', null) returning id`,
    [space.id],
  );
  await query(
    URLS.migrator,
    `insert into route_versions (space_id, route_id, version, snapshot, snapshot_format, content_hash, published_by_user_id)
     values ($1, $2, 1, '{}', 1, repeat('0', 64), $3)`,
    [space.id, route.id, userId],
  );
  await query(
    URLS.migrator,
    "insert into memberships (space_id, user_id, role) values ($1, $2, 'student')",
    [space.id, userId],
  );
  const [row] = await query(
    URLS.migrator,
    "insert into enrollments (space_id, route_id, user_id, pinned_version, status) values ($1, $2, $3, 1, 'active') returning id",
    [space.id, route.id, userId],
  );
  return row.id as string;
}

const review = (enrollmentId: string, extra: Record<string, unknown> = {}) => ({
  enrollmentId,
  reviewId: crypto.randomUUID(),
  itemId: crypto.randomUUID(),
  rating: 3,
  at: Date.now(),
  elapsedMs: 800,
  ...extra,
});

describe("the actor", () => {
  it("is nobody without a session: 401, and nothing runs", async () => {
    const response = await api.call("/api/a/review.submit", json(review(crypto.randomUUID())));
    expect(response.status).toBe(401);
  });

  it("is the session's user: an action runs as them, on the database, under their row-level security", async () => {
    const { cookie, userId } = await signIn();
    const enrollmentId = await enrollment(userId);
    const body = review(enrollmentId);
    const response = await api.call("/api/a/review.submit", json(body, { cookie }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      output: { reviewId: body.reviewId, duplicate: false },
    });
    const [stored] = await query(
      URLS.migrator,
      "select user_id from reviews where review_id = $1",
      [body.reviewId],
    );
    expect(stored?.user_id).toBe(userId);
  });

  it("can never be named in the body", async () => {
    const { cookie, userId } = await signIn();
    const someoneElse = (await signIn()).userId;
    const enrollmentId = await enrollment(userId);
    const response = await api.call(
      "/api/a/review.submit",
      json(review(enrollmentId, { userId: someoneElse }), { cookie }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, code: "invalid_input" });
  });

  it("answers 404 for an action that does not exist, and for another user's enrollment", async () => {
    const { cookie } = await signIn();
    const other = await signIn();
    const theirs = await enrollment(other.userId);
    expect((await api.call("/api/a/route.delete", json({}, { cookie }))).status).toBe(404);
    expect((await api.call("/api/a/review.submit", json(review(theirs), { cookie }))).status).toBe(
      404,
    );
  });

  it("passes on the refreshed cookie when a session is renewed during an action", async () => {
    const { cookie, userId } = await signIn();
    // A session close to its end is renewed on use (Better Auth's updateAge).
    await query(
      URLS.migrator,
      "update session set expires_at = now() + interval '1 day' where user_id = $1",
      [userId],
    );
    const enrollmentId = await enrollment(userId);
    const response = await api.call("/api/a/review.submit", json(review(enrollmentId), { cookie }));
    expect(response.status).toBe(200);
    expect(
      response.headers.getSetCookie().some((entry) => entry.startsWith("__Host-lr_session=")),
    ).toBe(true);
  });
});
