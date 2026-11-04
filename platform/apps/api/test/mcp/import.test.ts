import { afterEach, describe, expect, it } from "vitest";
import { query, URLS } from "../db/connect";
import { envelope, oauthHarness } from "./oauth-harness";

// import_route (Platform STEP 5 §4) on Postgres: one document, one transaction. Fixtures are
// invented.

const oauth = oauthHarness();
afterEach(() => oauth.settle());

const NEXT_STEP = "Revisa el borrador y, cuando quieras, publícalo con publish_route.";

async function teacher() {
  const person = await oauth.signIn();
  const slug = `importa-${crypto.randomUUID().slice(0, 8)}`;
  await query(
    URLS.migrator,
    `with made as (insert into spaces (slug, name, default_locale, locales)
       values ($1, '{"es":"Espacio"}', 'es', '{es}') returning id)
     insert into memberships (space_id, user_id, role)
     select made.id, u.id, 'owner' from made, "user" u where u.email = $2`,
    [slug, person.email],
  );
  const { access_token: token } = await oauth.connect(person.cookie);
  const spaces = await oauth.tool(token, "list_spaces");
  const { spaces: list } = spaces.structuredContent as { spaces: { space_id: string }[] };
  return { token, spaceId: list[0]?.space_id as string };
}

const document = (slug = `ruta-${crypto.randomUUID().slice(0, 8)}`, title = "Primera") => ({
  slug,
  title: { es: title },
  source_locale: "es",
  modules: [
    {
      title: { es: "Módulo uno" },
      lessons: [
        {
          title: { es: "Lección uno" },
          blocks: [
            { type: "concept", body: { es: "Uno" } },
            { type: "tip", body: { es: "Dos" } },
          ],
        },
        { title: { es: "Lección dos" }, blocks: [{ type: "concept", body: { es: "Tres" } }] },
      ],
    },
    { title: { es: "Módulo dos" }, lessons: [] },
  ],
});

describe("import_route", () => {
  it("makes a new draft, says what it made, and what comes next", async () => {
    const { token, spaceId } = await teacher();
    const made = await oauth.tool(token, "import_route", {
      space_id: spaceId,
      document: document(),
    });
    expect(made.isError).toBeFalsy();
    expect(made.structuredContent).toMatchObject({
      draft_revision: 1,
      counts: { modules: 2, lessons: 2, blocks: 3 },
      next_step: NEXT_STEP,
    });
    const read = await oauth.tool(token, "get_route", {
      route_id: made.structuredContent?.route_id,
    });
    expect(read.structuredContent?.modules).toHaveLength(2);
    expect(read.structuredContent?.blocks).toHaveLength(3);
  });

  it("publishes what it imported", async () => {
    const { token, spaceId } = await teacher();
    const made = await oauth.tool(token, "import_route", {
      space_id: spaceId,
      document: document(),
    });
    const published = await oauth.tool(token, "publish_route", {
      route_id: made.structuredContent?.route_id,
      draft_revision: made.structuredContent?.draft_revision,
    });
    expect(published.isError).toBeFalsy();
    expect(published.structuredContent?.version).toBe(1);
  });

  it("replaces a draft and leaves the published version as it was", async () => {
    const { token, spaceId } = await teacher();
    const slug = `ruta-${crypto.randomUUID().slice(0, 8)}`;
    const made = await oauth.tool(token, "import_route", {
      space_id: spaceId,
      document: document(slug),
    });
    const routeId = made.structuredContent?.route_id as string;
    await oauth.tool(token, "publish_route", {
      route_id: routeId,
      draft_revision: made.structuredContent?.draft_revision,
    });
    const before = await query(
      URLS.migrator,
      "select content_hash, snapshot from route_versions where route_id = $1",
      [routeId],
    );
    const replaced = await oauth.tool(token, "import_route", {
      route_id: routeId,
      draft_revision: made.structuredContent?.draft_revision,
      document: { ...document(slug, "Segunda"), modules: [{ title: { es: "Solo" }, lessons: [] }] },
    });
    expect(replaced.isError).toBeFalsy();
    expect(replaced.structuredContent?.draft_revision).toBe(2);
    const read = await oauth.tool(token, "get_route", { route_id: routeId });
    expect(read.structuredContent?.modules).toHaveLength(1);
    expect(read.structuredContent?.blocks).toHaveLength(0);
    expect(read.structuredContent?.published_version).toBe(1);
    const after = await query(
      URLS.migrator,
      "select content_hash, snapshot from route_versions where route_id = $1",
      [routeId],
    );
    expect(after).toEqual(before);
    const republished = await oauth.tool(token, "publish_route", {
      route_id: routeId,
      draft_revision: 2,
    });
    expect(republished.structuredContent?.version).toBe(2);
  });

  it("refuses a stale revision, and writes nothing", async () => {
    const { token, spaceId } = await teacher();
    const slug = `ruta-${crypto.randomUUID().slice(0, 8)}`;
    const made = await oauth.tool(token, "import_route", {
      space_id: spaceId,
      document: document(slug),
    });
    const routeId = made.structuredContent?.route_id as string;
    const stale = await oauth.tool(token, "import_route", {
      route_id: routeId,
      draft_revision: 0,
      document: document(slug, "Otra"),
    });
    expect(stale.isError).toBe(true);
    expect(stale.content?.[0]?.text).toContain("revision is now 1");
    expect(stale.content?.[0]?.text).toContain("get_route");
    const read = await oauth.tool(token, "get_route", { route_id: routeId });
    expect(read.structuredContent?.route).toMatchObject({ title: { es: "Primera" } });
  });

  it("writes nothing from an invalid document, and lists every problem", async () => {
    const { token, spaceId } = await teacher();
    const before = await oauth.tool(token, "list_routes", { space_id: spaceId });
    const bad = document();
    bad.modules[0]?.lessons[1]?.blocks.push({ type: "nada", body: { es: "x" } });
    const refused = await oauth.tool(token, "import_route", {
      space_id: spaceId,
      document: { ...bad, slug: "NO VALE", title: {} },
    });
    expect(refused.isError).toBe(true);
    const said = refused.content?.[0]?.text ?? "";
    expect(said).toContain("Nothing was written");
    expect(said).toContain("slug:");
    expect(said).toContain("title:");
    expect(said).toContain("modules[0].lessons[1].blocks[1]");
    const after = await oauth.tool(token, "list_routes", { space_id: spaceId });
    expect(after.structuredContent).toEqual(before.structuredContent);
  });

  it("refuses a slug that is taken, and writes nothing else", async () => {
    const { token, spaceId } = await teacher();
    const slug = `ruta-${crypto.randomUUID().slice(0, 8)}`;
    await oauth.tool(token, "import_route", { space_id: spaceId, document: document(slug) });
    const again = await oauth.tool(token, "import_route", {
      space_id: spaceId,
      document: document(slug),
    });
    expect(again.isError).toBe(true);
    expect(again.content?.[0]?.text).toContain("already has that slug");
  });

  it("keeps none of a document's words in the action log", async () => {
    const { token, spaceId } = await teacher();
    await oauth.tool(token, "import_route", {
      space_id: spaceId,
      document: document(undefined, "Palabras privadas"),
    });
    const logged = await query(
      URLS.migrator,
      `select input from action_log where space_id = $1 and action = 'route.import'`,
      [spaceId],
    );
    expect(JSON.stringify(logged)).not.toContain("Palabras privadas");
    expect(logged[0]?.input.document).toBe("[redacted]");
  });
});

describe("hostile documents", () => {
  it("refuses a javascript: link and a giant string, and writes nothing", async () => {
    const { token, spaceId } = await teacher();
    for (const body of ["[pulsa](javascript:alert(1))", "x".repeat(20_001)]) {
      const hostile = document();
      hostile.modules[0]?.lessons[0]?.blocks.push({ type: "concept", body: { es: body } });
      const answer = await oauth.tool(token, "import_route", {
        space_id: spaceId,
        document: hostile,
      });
      expect(answer.isError).toBe(true);
      expect(answer.content?.[0]?.text).toContain("modules[0].lessons[0].blocks[2].body.es");
    }
    const routes = await oauth.tool(token, "list_routes", { space_id: spaceId });
    expect(routes.structuredContent?.routes).toEqual([]);
  });

  it("refuses deeply nested JSON before reading it", async () => {
    const { token, spaceId } = await teacher();
    let nested: unknown = { es: "x" };
    for (let depth = 0; depth < 60; depth++) {
      nested = { nested };
    }
    const response = await oauth.call(
      "/mcp",
      envelope(
        "tools/call",
        { name: "import_route", arguments: { space_id: spaceId, document: nested } },
        token,
      ),
    );
    expect(response.status).toBe(400);
  });

  it("stores a script tag as words, and an unknown field not at all", async () => {
    const { token, spaceId } = await teacher();
    const made = await oauth.tool(token, "import_route", {
      space_id: spaceId,
      document: {
        ...document(undefined, "<script>alert(1)</script>"),
        price: 500,
        pricing: "paid",
      },
    });
    expect(made.isError).toBeFalsy();
    const read = await oauth.tool(token, "get_route", {
      route_id: made.structuredContent?.route_id,
    });
    expect(read.structuredContent?.route).toMatchObject({
      title: { es: "<script>alert(1)</script>" },
      pricing: "free",
      priceMinor: null,
    });
  });
});

describe("the guide", () => {
  const read = async (token: string, uri: string) => {
    const response = await oauth.call("/mcp", envelope("resources/read", { uri }, token));
    return (await response.json()) as {
      result: { contents: { text: string }[]; cacheScope: string };
    };
  };

  it("is there in Spanish and English, with an example that imports", async () => {
    const { token, spaceId } = await teacher();
    const { result } = await read(token, "learning-routes://guides/route-format");
    expect(result.cacheScope).toBe("private");
    const text = result.contents[0]?.text ?? "";
    expect(text).toContain("Cómo escribir una ruta");
    expect(text).toContain("How to write a route");
    const example = text.split("```json\n")[1]?.split("\n```")[0] ?? "";
    const made = await oauth.tool(token, "import_route", {
      space_id: spaceId,
      document: JSON.parse(example),
    });
    expect(made.isError).toBeFalsy();
  });

  it("publishes the JSON Schema", async () => {
    const { token } = await teacher();
    const { result } = await read(token, "learning-routes://schemas/route-document");
    const schema = JSON.parse(result.contents[0]?.text ?? "{}");
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(JSON.stringify(schema)).toContain("code_playground");
  });

  it("answers an address that is no resource with an error, not empty contents", async () => {
    const { token } = await teacher();
    const response = await oauth.call(
      "/mcp",
      envelope("resources/read", { uri: "learning-routes://guides/nada" }, token),
    );
    const body = (await response.json()) as { error?: { code: number } };
    expect(body.error?.code).toBe(-32602);
  });
});
