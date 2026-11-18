import { afterEach, describe, expect, it } from "vitest";
import { signedCaller } from "../../src/agent/caller";
import { entryFor, fromMcp } from "../../src/agent/entries";
import type { AgentEnv } from "../../src/agent/env";
import { APP } from "../auth/harness";
import { query, TEST_SECRET, URLS } from "../db/connect";
import { oauthHarness } from "../mcp/oauth-harness";

// The agent Worker's own entry points (Platform STEP 20), with the model faked: the tutor and route
// images fail politely without a key, take nothing then, and keep to the app, a live session,
// creators and the month's twenty; the MCP's generate_image is let in only signed.

const oauth = oauthHarness("https://client.example.test/agent-entries.json");
afterEach(() => oauth.settle());

// A 1x1 PNG: what the faked model draws.
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function world(key: string | null = "test-key") {
  const objects = new Map<string, Uint8Array>();
  const added: number[] = [];
  const pending: Promise<unknown>[] = [];
  const env = {
    DB: { connectionString: URLS.app } as Hyperdrive,
    APP_ORIGIN: APP,
    ENVIRONMENT: "test",
    BETTER_AUTH_SECRET: TEST_SECRET,
    CONTENT_ORIGIN: "https://content.example.test",
    AGENT_DAILY_MICROCENTS: "20000000",
    AGENT_USER_DAILY_MICROCENTS: "2000000",
    OPENROUTER_API_KEY: key ?? undefined,
    CREATIONS: {
      put: async (name: string, bytes: Uint8Array) => void objects.set(name, bytes),
    },
    LEDGER: {
      idFromName: () => "global",
      get: () => ({ today: async () => 0, add: async (n: number) => void added.push(n) }),
    },
  } as unknown as AgentEnv;
  const ctx = {
    waitUntil: (promise: Promise<unknown>) => void pending.push(promise),
    passThroughOnException: () => undefined,
    props: {},
  } as unknown as ExecutionContext;
  return { env, ctx, objects, added, settled: () => Promise.all(pending) };
}

const drawn = (status = 200) =>
  (async () =>
    status === 200
      ? Response.json({
          choices: [
            { message: { images: [{ image_url: { url: `data:image/png;base64,${PNG}` } }] } },
          ],
          usage: { prompt_tokens: 60, completion_tokens: 1290, cost: 0.0387 },
        })
      : Response.json({ error: { message: "Insufficient credits" } }, { status })) as typeof fetch;

const post = (path: string, body: object, headers: Record<string, string> = {}) =>
  new Request(`${APP}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: APP, ...headers },
    body: JSON.stringify(body),
  });

async function creator(role = "owner") {
  const person = await oauth.signIn();
  const [row] = await query(URLS.migrator, `select id from "user" where email = $1`, [
    person.email,
  ]);
  const [space] = await query(
    URLS.migrator,
    `insert into spaces (slug, name, default_locale, locales)
       values ($1, '{"es": "Espacio"}', 'es', '{es}') returning id`,
    [`img-${crypto.randomUUID().slice(0, 8)}`],
  );
  await query(
    URLS.migrator,
    "insert into memberships (space_id, user_id, role) values ($1, $2, $3)",
    [space?.id, row?.id, role],
  );
  return { cookie: person.cookie, userId: row?.id as string, spaceId: space?.id as string };
}

const imagesOf = (userId: string) =>
  query(
    URLS.migrator,
    "select asset_key, cost_microcents, completion_tokens from image_generations where user_id = $1",
    [userId],
  );

describe("the agent Worker's entry points", () => {
  it("keep to the app's host and Origin, POST, and a live session", async () => {
    const { env, ctx } = world();
    const answer = (request: Request) => entryFor(request, env, ctx) as Promise<Response>;
    expect(entryFor(new Request(`${APP}/api/a/route.get`), env, ctx)).toBeNull();
    expect((await answer(new Request(`${APP}/api/tutor/ask`))).status).toBe(405);
    expect(
      (await answer(post("/api/tutor/ask", {}, { origin: "https://elsewhere.example" }))).status,
    ).toBe(403);
    const elsewhere = new Request("https://maria.example.test/api/creator/images", {
      method: "POST",
      headers: { origin: APP },
    });
    expect((await answer(elsewhere)).status).toBe(404);
    expect((await answer(post("/api/tutor/ask", {}))).status).toBe(401);
    expect((await answer(post("/api/creator/images", {}))).status).toBe(401);
  });

  it("the tutor answers 503 tutor_unavailable in the person's language with no key, taking none", async () => {
    const { env, ctx } = world(null);
    const person = await oauth.signIn();
    const answer = await (entryFor(
      post(
        "/api/tutor/ask",
        { enrollment_id: crypto.randomUUID(), topic: 1, question: "¿Qué es esto?" },
        { cookie: person.cookie, "accept-language": "es" },
      ),
      env,
      ctx,
    ) as Promise<Response>);
    expect(answer.status).toBe(503);
    expect(await answer.json()).toEqual({
      ok: false,
      code: "tutor_unavailable",
      message: "El tutor no puede responder ahora. Inténtalo más tarde.",
    });
    const [taken] = await query(
      URLS.migrator,
      `select count(*)::integer as n from tutor_questions
        where user_id = (select id from "user" where email = $1)`,
      [person.email],
    );
    expect(taken?.n).toBe(0);
  });

  it("makes a creator's image, keeps it as the space's asset, and records its cost uncharged", async () => {
    const { env, ctx, objects, added } = world();
    const me = await creator();
    const answer = await (entryFor(
      post(
        "/api/creator/images",
        { space_id: me.spaceId, prompt: "Un freno" },
        { cookie: me.cookie },
      ),
      env,
      ctx,
      drawn(),
    ) as Promise<Response>);
    expect(answer.status).toBe(201);
    const body = (await answer.json()) as { ok: boolean; key: string; url: string };
    expect(body).toMatchObject({ ok: true, url: `https://content.example.test/${body.key}` });
    expect(body.key).toMatch(new RegExp(`^a/${me.spaceId}/[0-9a-f]{64}\\.png$`));
    expect(objects.has(body.key)).toBe(true);
    expect(added).toEqual([38_700]);
    expect(await imagesOf(me.userId)).toEqual([
      { asset_key: body.key, cost_microcents: "38700", completion_tokens: 1290 },
    ]);
  });

  it("makes twenty a month, then says so politely; with no key or credit it takes none", async () => {
    const me = await creator("coeditor");
    const noKey = world(null);
    const request = () =>
      post(
        "/api/creator/images",
        { space_id: me.spaceId, prompt: "Un mapa" },
        { cookie: me.cookie, "accept-language": "en" },
      );
    const unkeyed = await (entryFor(request(), noKey.env, noKey.ctx) as Promise<Response>);
    expect([unkeyed.status, await unkeyed.json()]).toEqual([
      503,
      {
        ok: false,
        code: "images_unavailable",
        message: "Images can't be made right now. Try again later.",
      },
    ]);
    const out = world();
    const broke = await (entryFor(request(), out.env, out.ctx, drawn(402)) as Promise<Response>);
    expect(broke.status).toBe(503);
    expect(await imagesOf(me.userId)).toEqual([]);
    for (let n = 0; n < 20; n += 1) {
      await query(
        URLS.migrator,
        "insert into image_generations (space_id, user_id, asked_at) values ($1, $2, now())",
        [me.spaceId, me.userId],
      );
    }
    const full = world();
    const limited = await (entryFor(request(), full.env, full.ctx, drawn()) as Promise<Response>);
    expect([limited.status, await limited.json()]).toEqual([
      429,
      {
        ok: false,
        code: "rate_limited",
        message: "You have made your 20 images for this month. You can make 20 more next month.",
      },
    ]);
  });

  it("makes none for someone who builds nowhere: creator_required, in their language", async () => {
    const { env, ctx } = world();
    const learner = await creator("student");
    const answer = await (entryFor(
      post(
        "/api/creator/images",
        { space_id: learner.spaceId, prompt: "Un mapa" },
        { cookie: learner.cookie, "accept-language": "es" },
      ),
      env,
      ctx,
      drawn(),
    ) as Promise<Response>);
    expect(answer.status).toBe(403);
    expect(await answer.json()).toMatchObject({ ok: false, code: "creator_required" });
  });

  it("are no actions of the API's generic route, whose answer would be the model's instructions", async () => {
    const person = await oauth.signIn();
    for (const name of ["tutor.ask", "image.generate"]) {
      const answer = await oauth.api.call(`/api/a/${name}`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: person.cookie },
        body: "{}",
      });
      expect([name, answer.status, await answer.json()]).toEqual([
        name,
        404,
        { ok: false, code: "unknown_action" },
      ]);
    }
  });

  it("lets the MCP in only with a fresh caller signed by the shared secret", async () => {
    const { env, ctx } = world();
    const me = await creator();
    const asMcp = (header: string) =>
      fromMcp(
        new Request("https://agent/internal/images", {
          method: "POST",
          headers: { "content-type": "application/json", "x-lr-caller": header },
          body: JSON.stringify({ space_id: me.spaceId, prompt: "Un volcán" }),
        }),
        env,
        ctx,
        drawn(),
      ) as Promise<Response>;
    expect((await asMcp(await signedCaller(TEST_SECRET, me.userId))).status).toBe(201);
    expect((await asMcp(await signedCaller("another-secret", me.userId))).status).toBe(401);
    const stale = await signedCaller(TEST_SECRET, me.userId, Date.now() - 120_000);
    expect((await asMcp(stale)).status).toBe(401);
    expect((await asMcp(`${me.userId}.${Date.now()}.00`)).status).toBe(401);
    expect(fromMcp(new Request("https://agent/elsewhere"), env, ctx)).toBeNull();
  });
});
