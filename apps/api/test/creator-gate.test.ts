import { afterEach, describe, expect, it } from "vitest";
import { entryOf } from "../src/agent/entry";
import { withClient } from "../src/db/with-db";
import { query, URLS } from "./db/connect";
import { oauthHarness } from "./mcp/oauth-harness";

// Teaching needs a balance (Platform STEP 14): whoever is not a creator, an owner or a coeditor in
// a space, can build nothing, through any door. Each door answers 403 creator_required with one
// plain sentence. A creator elsewhere still hears not_found, and existing creators work as before.
// The operator's own way to make a space is test/auth/admin-actions.test.ts.

// Its own client: connecting at the same time as other files must not wait on their fetch.
const oauth = oauthHarness("https://client.example.test/creator-gate.json");
afterEach(() => oauth.settle());

const SPANISH = { "accept-language": "es" };
const SAYS_SPANISH = /necesitas ser creador/;
const FREE = { access: "open", pricing: "free" };

async function inSpace(
  email: string,
  role: string,
  slug = `gate-${crypto.randomUUID().slice(0, 8)}`,
) {
  await query(
    URLS.migrator,
    `insert into spaces (slug, name, default_locale, locales)
     values ($1, '{"es":"Espacio"}', 'es', '{es}') on conflict (slug) do nothing`,
    [slug],
  );
  await query(
    URLS.migrator,
    `insert into memberships (space_id, user_id, role)
     select s.id, u.id, $3 from spaces s, "user" u where s.slug = $1 and u.email = $2
     on conflict (space_id, user_id) do update set role = excluded.role`,
    [slug, email, role],
  );
  const [space] = await query(URLS.migrator, "select id from spaces where slug = $1", [slug]);
  return { slug, spaceId: space?.id as string };
}

const userIdOf = async (email: string) =>
  (await query(URLS.migrator, `select id from "user" where email = $1`, [email]))[0]?.id as string;

const action = (cookie: string, name: string, input: unknown, headers = {}) =>
  oauth.api.call(`/api/a/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, ...headers },
    body: JSON.stringify(input),
  });

const agentEntry = (userId: string, spaceId: string) =>
  withClient(
    { DB: { connectionString: URLS.app } as Hyperdrive },
    { waitUntil: () => undefined } as unknown as ExecutionContext,
    (db) => entryOf(db, userId, spaceId),
  );

describe("the app's actions", () => {
  it("answer 403 creator_required, in the person's language, to someone who teaches nowhere", async () => {
    const person = await oauth.signIn();
    const { spaceId } = await inSpace(person.email, "student");
    const answer = await action(
      person.cookie,
      "route.create",
      { spaceId, slug: "nueva", title: { es: "Nueva" }, sourceLocale: "es", ...FREE },
      SPANISH,
    );
    expect(answer.status).toBe(403);
    const body = (await answer.json()) as { code: string; message: string };
    expect(body.code).toBe("creator_required");
    expect(body.message).toMatch(SAYS_SPANISH);
  });

  it("let an existing owner and coeditor build exactly as before", async () => {
    const owner = await oauth.signIn();
    const coeditor = await oauth.signIn();
    const { slug, spaceId } = await inSpace(owner.email, "owner");
    await inSpace(coeditor.email, "coeditor", slug);
    for (const [who, routeSlug] of [
      [owner, "del-dueno"],
      [coeditor, "del-coeditor"],
    ] as const) {
      const answer = await action(who.cookie, "route.create", {
        spaceId,
        slug: routeSlug,
        title: { es: "Ruta" },
        sourceLocale: "es",
        ...FREE,
      });
      expect(answer.status, routeSlug).toBe(200);
    }
  });
});

describe("connecting an MCP client", () => {
  it("is refused with creator_required to a learner and to an assistant", async () => {
    for (const role of ["student", "assistant"]) {
      const person = await oauth.signIn();
      await inSpace(person.email, role);
      const asked = await oauth.authorize(person.cookie);
      const consent = await oauth.call("/api/auth/oauth2/consent", {
        method: "POST",
        cookie: person.cookie,
        headers: { "content-type": "application/json", ...SPANISH },
        body: JSON.stringify({
          accept: true,
          oauth_query: new URL(asked.headers.get("location") ?? "", "https://x.test").search.slice(
            1,
          ),
        }),
      });
      expect(consent.status, role).toBe(403);
      const body = (await consent.json()) as { error: string; code: string; message: string };
      expect(body, role).toMatchObject({ error: "access_denied", code: "creator_required" });
      expect(body.message, role).toMatch(SAYS_SPANISH);
    }
  });
});

describe("every MCP tool that builds", () => {
  it("answers creator_required once its person is no longer a creator", async () => {
    const person = await oauth.signIn();
    const { slug, spaceId } = await inSpace(person.email, "owner");
    const { access_token: token } = await oauth.connect(person.cookie);
    const made = await oauth.tool(token, "create_route", {
      space_id: spaceId,
      slug: `ruta-${crypto.randomUUID().slice(0, 8)}`,
      title: { es: "Ruta" },
      source_locale: "es",
    });
    const route = made.structuredContent as { route_id: string; draft_revision: number };
    const module = await oauth.tool(token, "add_module", {
      route_id: route.route_id,
      draft_revision: route.draft_revision,
      title: { es: "Módulo" },
    });
    const lesson = await oauth.tool(token, "add_lesson", {
      route_id: route.route_id,
      draft_revision: module.structuredContent?.draft_revision,
      module_id: module.structuredContent?.module_id,
      title: { es: "Lección" },
    });
    const at = {
      route_id: route.route_id,
      draft_revision: lesson.structuredContent?.draft_revision as number,
    };
    const lessonId = String(lesson.structuredContent?.lesson_id);
    // The owner leaves teaching, to another owner (a space always keeps one); the token they hold
    // is still good until it expires.
    await inSpace((await oauth.signIn()).email, "owner", slug);
    await query(
      URLS.migrator,
      `update memberships set role = 'student' where user_id = (select id from "user" where email = $1)`,
      [person.email],
    );
    const calls: [string, Record<string, unknown>][] = [
      [
        "create_route",
        { space_id: spaceId, slug: "otra", title: { es: "Otra" }, source_locale: "es" },
      ],
      [
        "import_route",
        {
          space_id: spaceId,
          document: {
            slug: "importada",
            title: { es: "Importada" },
            source_locale: "es",
            modules: [],
          },
        },
      ],
      ["update_route_details", { ...at, title: { es: "Otra" } }],
      ["add_module", { ...at, title: { es: "Otro" } }],
      [
        "add_lesson",
        { ...at, module_id: module.structuredContent?.module_id, title: { es: "Otra" } },
      ],
      [
        "add_blocks",
        { ...at, lesson_id: lessonId, blocks: [{ type: "concept", body: { es: "Hola" } }] },
      ],
      [
        "upload_creation",
        {
          ...at,
          lesson_id: lessonId,
          title: { es: "Piano" },
          html: "<!doctype html><title>P</title>",
        },
      ],
      ["upload_asset", { space_id: spaceId, data_base64: btoa("GIF89a") }],
      ["upload_asset", { space_id: spaceId, source_url: "https://example.com/a.png" }],
      [
        "upload_document",
        { space_id: spaceId, document: "# Curso\n\n## Módulo\n\n### Tema\n\nHola." },
      ],
      ["publish_route", at],
    ];
    for (const [name, args] of calls) {
      const answer = await oauth.tool(token, name, args);
      expect(answer.isError, name).toBe(true);
      expect(answer.content?.[0]?.text, name).toContain("creator_required");
    }
  });
});

describe("the assistant's door", () => {
  it("lets an editor in, says creator_required to a non-creator, and not_found to a creator elsewhere", async () => {
    const owner = await oauth.signIn();
    const learner = await oauth.signIn();
    const elsewhere = await oauth.signIn();
    const { slug, spaceId } = await inSpace(owner.email, "owner");
    await inSpace(learner.email, "student", slug);
    await inSpace(elsewhere.email, "owner");
    const stranger = await oauth.signIn();
    expect(await agentEntry(await userIdOf(owner.email), spaceId)).toBe("editor");
    expect(await agentEntry(await userIdOf(learner.email), spaceId)).toBe("creator_required");
    expect(await agentEntry(await userIdOf(stranger.email), spaceId)).toBe("creator_required");
    expect(await agentEntry(await userIdOf(elsewhere.email), spaceId)).toBe("not_found");
  });
});
