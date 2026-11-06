import { afterEach, describe, expect, it } from "vitest";
import { depthOf } from "../../src/mcp/request";
import { query, URLS } from "../db/connect";
import { envelope, oauthHarness, PROTOCOL } from "./oauth-harness";

// The creator's MCP server (Platform STEP 5 §3): what a client sees of the protocol, and what
// every call has to pass before a tool runs. Two people, each with a space of their own.

const oauth = oauthHarness();
afterEach(() => oauth.settle());

const NO_NETWORK_REF = /"\$ref":"https?:/;
const NO_INTERNALS = /postgres|drizzle|select |stack/i;
const METADATA = /resource_metadata="[^"]+\/\.well-known\/oauth-protected-resource\/mcp"/;

async function teacher(role = "owner", into?: string) {
  const person = await oauth.signIn();
  const slug = into ?? `mcp-${crypto.randomUUID().slice(0, 8)}`;
  if (!into) {
    await query(
      URLS.migrator,
      `insert into spaces (slug, name, default_locale, locales)
       values ($1, '{"es":"Espacio"}', 'es', '{es}')`,
      [slug],
    );
  }
  await query(
    URLS.migrator,
    `insert into memberships (space_id, user_id, role)
     select s.id, u.id, $3 from spaces s, "user" u where s.slug = $1 and u.email = $2`,
    [slug, person.email, role],
  );
  const tokens = await oauth.connect(person.cookie);
  const spaces = await oauth.tool(tokens.access_token, "list_spaces");
  const list = spaces.structuredContent?.spaces as { space_id: string; slug: string }[];
  const spaceId = list.find((entry) => entry.slug === slug)?.space_id as string;
  return { ...person, slug, spaceId, token: tokens.access_token };
}

async function newRoute(token: string, spaceId: string) {
  const made = await oauth.tool(token, "create_route", {
    space_id: spaceId,
    slug: `ruta-${crypto.randomUUID().slice(0, 8)}`,
    title: { es: "Ruta" },
    source_locale: "es",
  });
  return made.structuredContent as { route_id: string; draft_revision: number };
}

describe("before any tool", () => {
  it("answers no token with 401, naming the protected resource metadata", async () => {
    const response = await oauth.call("/mcp", envelope("tools/list", {}));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toMatch(METADATA);
  });

  it("answers a token that is nonsense with 401", async () => {
    const response = await oauth.call("/mcp", envelope("tools/list", {}, "not.a.token"));
    expect(response.status).toBe(401);
  });

  it("answers a foreign Origin with 403", async () => {
    const { token } = await teacher();
    const response = await oauth.call(
      "/mcp",
      envelope("tools/list", {}, token, { origin: "https://evil.example.test" }),
    );
    expect(response.status).toBe(403);
  });

  it("answers a missing scope with 403 insufficient_scope", async () => {
    const person = await oauth.signIn();
    await query(
      URLS.migrator,
      `with made as (insert into spaces (slug, name, default_locale, locales)
         values ($1, '{"es":"Espacio"}', 'es', '{es}') returning id)
       insert into memberships (space_id, user_id, role)
       select made.id, u.id, 'owner' from made, "user" u where u.email = $2`,
      [`mcp-${crypto.randomUUID().slice(0, 8)}`, person.email],
    );
    const { access_token: token } = await oauth.connect(person.cookie, "routes:read");
    const response = await oauth.call(
      "/mcp",
      envelope("tools/call", { name: "publish_route", arguments: {} }, token),
    );
    expect(response.status).toBe(403);
    const challenge = response.headers.get("www-authenticate") ?? "";
    expect(challenge).toContain('error="insufficient_scope"');
    expect(challenge).toContain('scope="routes:publish"');
    expect(challenge).toMatch(METADATA);
  });

  it("refuses a body over 4 MB", async () => {
    const { token } = await teacher();
    const init = envelope("tools/list", {}, token);
    const response = await oauth.call("/mcp", { ...init, body: " ".repeat(4 * 1_048_576 + 1) });
    expect(response.status).toBe(413);
  });

  it("refuses JSON that nests too deeply, without parsing it", async () => {
    expect(depthOf('{"a":"{{{{","b":[[1]]}')).toBe(3);
    const { token } = await teacher();
    const init = envelope("tools/list", {}, token);
    const response = await oauth.call("/mcp", {
      ...init,
      body: `${"[".repeat(5000)}${"]".repeat(5000)}`,
    });
    expect(response.status).toBe(400);
  });
});

describe("the protocol", () => {
  it("has no subscriptions, the one answer that never ends", async () => {
    const { token } = await teacher();
    const response = await oauth.call("/mcp", envelope("subscriptions/listen", {}, token));
    expect(response.status).toBe(404);
  });

  it("answers server/discover, with its cache fields per user", async () => {
    const { token } = await teacher();
    const response = await oauth.call("/mcp", envelope("server/discover", {}, token));
    expect(response.status).toBe(200);
    const { result } = (await response.json()) as { result: Record<string, unknown> };
    expect(result.supportedVersions).toContain(PROTOCOL);
    expect(result.cacheScope).toBe("private");
    expect(result.ttlMs).toBeGreaterThan(0);
  });

  it("lists every tool, in snake_case, with both schemas, cached per user", async () => {
    const { token } = await teacher();
    const response = await oauth.call("/mcp", envelope("tools/list", {}, token));
    const { result } = (await response.json()) as {
      result: {
        tools: { name: string; inputSchema: object; outputSchema: object; annotations: object }[];
        cacheScope: string;
        ttlMs: number;
      };
    };
    expect(result.cacheScope).toBe("private");
    expect(result.ttlMs).toBeGreaterThan(0);
    expect(result.tools.map((tool) => tool.name).sort()).toEqual([
      "add_blocks",
      "add_lesson",
      "add_module",
      "create_route",
      "get_route",
      "get_route_format",
      "import_route",
      "list_routes",
      "list_spaces",
      "publish_route",
      "update_route_details",
      "upload_asset",
      "upload_creation",
      "upload_document",
    ]);
    for (const tool of result.tools) {
      expect(tool.inputSchema).toMatchObject({ type: "object" });
      expect(tool.outputSchema).toMatchObject({ type: "object" });
      expect(JSON.stringify(tool.inputSchema)).not.toMatch(NO_NETWORK_REF);
    }
    expect(result.tools.find((tool) => tool.name === "publish_route")?.annotations).toMatchObject({
      destructiveHint: true,
    });
  });

  it("refuses a header that disagrees with the body", async () => {
    const { token } = await teacher();
    const wrongMethod = await oauth.call(
      "/mcp",
      envelope("tools/list", {}, token, { "mcp-method": "tools/call" }),
    );
    expect(wrongMethod.status).toBe(400);
    const wrongName = await oauth.call(
      "/mcp",
      envelope("tools/call", { name: "list_spaces", arguments: {} }, token, {
        "mcp-name": "publish_route",
      }),
    );
    expect(wrongName.status).toBe(400);
  });
});

describe("the tools", () => {
  it("makes a route, step by step, and publishes it at its public address", async () => {
    const { token, spaceId, slug } = await teacher();
    const route = await newRoute(token, spaceId);
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
    const blocks = await oauth.tool(token, "add_blocks", {
      route_id: route.route_id,
      draft_revision: lesson.structuredContent?.draft_revision,
      lesson_id: lesson.structuredContent?.lesson_id,
      blocks: [
        { type: "concept", body: { es: "Uno" } },
        { type: "concept", body: { es: "Dos" } },
      ],
    });
    expect(blocks.isError).toBeFalsy();
    const details = await oauth.tool(token, "update_route_details", {
      route_id: route.route_id,
      draft_revision: blocks.structuredContent?.draft_revision,
      title: { es: "Ruta nueva" },
    });
    const read = await oauth.tool(token, "get_route", { route_id: route.route_id });
    expect(read.structuredContent?.blocks).toHaveLength(2);
    const published = await oauth.tool(token, "publish_route", {
      route_id: route.route_id,
      draft_revision: details.structuredContent?.draft_revision,
    });
    expect(published.isError).toBeFalsy();
    expect(published.structuredContent?.public_url).toMatch(
      new RegExp(`^https://${slug}\\.example\\.test/ruta-`),
    );
    const logged = await query(
      URLS.migrator,
      `select actor_via, oauth_client_id from action_log
        where space_id = $1 and action = 'route.publish'`,
      [spaceId],
    );
    expect(logged).toEqual([
      {
        actor_via: "mcp",
        oauth_client_id: "https://client.example.test/metadata.json",
      },
    ]);
  });

  it("answers a stale revision with the current one, and tells the model what to do", async () => {
    const { token, spaceId } = await teacher();
    const route = await newRoute(token, spaceId);
    await oauth.tool(token, "add_module", {
      route_id: route.route_id,
      draft_revision: route.draft_revision,
      title: { es: "Uno" },
    });
    const stale = await oauth.tool(token, "add_module", {
      route_id: route.route_id,
      draft_revision: route.draft_revision,
      title: { es: "Dos" },
    });
    expect(stale.isError).toBe(true);
    const said = stale.content?.[0]?.text ?? "";
    expect(said).toContain(`revision is now ${route.draft_revision + 1}`);
    expect(said).toContain("get_route");
  });

  it("adds blocks all or none: one bad block writes nothing", async () => {
    const { token, spaceId } = await teacher();
    const route = await newRoute(token, spaceId);
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
    const refused = await oauth.tool(token, "add_blocks", {
      route_id: route.route_id,
      draft_revision: lesson.structuredContent?.draft_revision,
      lesson_id: lesson.structuredContent?.lesson_id,
      blocks: [{ type: "concept", body: { es: "Bien" } }, { type: "nada" }],
    });
    expect(refused.isError).toBe(true);
    const read = await oauth.tool(token, "get_route", { route_id: route.route_id });
    expect(read.structuredContent?.blocks).toHaveLength(0);
  });

  it("limits writes to 30 a minute for a connection", async () => {
    const { token, spaceId } = await teacher();
    let route = await newRoute(token, spaceId);
    let last = await oauth.tool(token, "add_module", {
      route_id: route.route_id,
      draft_revision: route.draft_revision,
      title: { es: "M" },
    });
    for (let n = 0; n < 30 && !last.isError; n++) {
      route = { ...route, draft_revision: last.structuredContent?.draft_revision as number };
      last = await oauth.tool(token, "add_module", {
        route_id: route.route_id,
        draft_revision: route.draft_revision,
        title: { es: "M" },
      });
    }
    expect(last.isError).toBe(true);
    expect(last.content?.[0]?.text).toContain("Too many changes");
  }, 30_000);

  it("says nothing of how it is built when something breaks", async () => {
    const { token } = await teacher();
    const answer = await oauth.tool(token, "get_route", { route_id: "no-es-un-uuid" });
    expect(answer.isError).toBe(true);
    expect(answer.content?.[0]?.text ?? "").not.toMatch(NO_INTERNALS);
  });
});

describe("tenancy", () => {
  it("answers not_found for another person's space and routes, through every tool", async () => {
    const a = await teacher();
    const b = await teacher();
    const theirs = await newRoute(b.token, b.spaceId);
    const route = { route_id: theirs.route_id, draft_revision: theirs.draft_revision };
    const calls: [string, Record<string, unknown>][] = [
      ["list_routes", { space_id: b.spaceId }],
      ["get_route", { route_id: theirs.route_id }],
      [
        "create_route",
        {
          space_id: b.spaceId,
          slug: `ajena-${crypto.randomUUID().slice(0, 8)}`,
          title: { es: "Ajena" },
          source_locale: "es",
        },
      ],
      ["update_route_details", { ...route, title: { es: "Ajena" } }],
      ["add_module", { ...route, title: { es: "Ajeno" } }],
      ["add_lesson", { ...route, module_id: crypto.randomUUID(), title: { es: "Ajena" } }],
      [
        "add_blocks",
        {
          ...route,
          lesson_id: crypto.randomUUID(),
          blocks: [{ type: "concept", body: { es: "Ajeno" } }],
        },
      ],
      ["publish_route", route],
    ];
    for (const [name, args] of calls) {
      const answer = await oauth.tool(a.token, name, args);
      expect(answer.isError, name).toBe(true);
      expect(answer.content?.[0]?.text, name).toContain("not_found");
    }
    const after = await oauth.tool(b.token, "get_route", { route_id: theirs.route_id });
    expect(after.structuredContent?.draft_revision).toBe(theirs.draft_revision);
    expect(after.structuredContent?.modules).toHaveLength(0);
  });

  it("lists only the spaces one teaches in", async () => {
    const a = await teacher();
    const b = await teacher();
    const spaces = await oauth.tool(a.token, "list_spaces");
    const ids = (spaces.structuredContent as { spaces: { space_id: string }[] }).spaces.map(
      (space) => space.space_id,
    );
    expect(ids).toContain(a.spaceId);
    expect(ids).not.toContain(b.spaceId);
  });

  it("does not let an assistant publish, even with routes:publish", async () => {
    const owner = await teacher();
    const route = await newRoute(owner.token, owner.spaceId);
    const assistant = await teacher("assistant", owner.slug);
    const answer = await oauth.tool(assistant.token, "publish_route", {
      route_id: route.route_id,
      draft_revision: route.draft_revision,
    });
    expect(answer.isError).toBe(true);
    expect(answer.content?.[0]?.text).toContain("does not allow");
  });
});

describe("disconnecting", () => {
  it("ends the token at once, and an old token stays dead after reconnecting", async () => {
    const person = await teacher();
    const clientId = "https://client.example.test/metadata.json";
    await query(
      URLS.migrator,
      `delete from oauth_consent where client_id = $1
         and user_id = (select id from "user" where email = $2)`,
      [clientId, person.email],
    );
    const refused = await oauth.call("/mcp", envelope("tools/list", {}, person.token));
    expect(refused.status).toBe(401);
    await new Promise((done) => setTimeout(done, 1100));
    await oauth.connect(person.cookie);
    const stillDead = await oauth.call("/mcp", envelope("tools/list", {}, person.token));
    expect(stillDead.status).toBe(401);
  });
});
