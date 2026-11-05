import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import { APP } from "../auth/harness";
import { query, URLS } from "../db/connect";
import { oauthHarness, REDIRECT_URI, RESOURCE } from "./oauth-harness";

// What ChatGPT does, end to end (Platform STEP 7): it signs its token request with
// private_key_jwt, asks only for the three routes scopes, and then uses the real MCP client.

const CHATGPT = "https://client.example.test/chatgpt.json";
const JWKS = "https://client.example.test/jwks.json";
const SCOPES = "routes:read routes:write routes:publish";
const FIRST_JSON = /```json\n([\s\S]*?)```/;

const signedAssertion = (key: CryptoKey, kid: string) =>
  new SignJWT({ jti: crypto.randomUUID() })
    .setProtectedHeader({ alg: "RS256", kid, typ: "JWT" })
    .setIssuer(CHATGPT)
    .setSubject(CHATGPT)
    .setAudience(`${APP}/api/auth/oauth2/token`)
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(key);

const oauth = oauthHarness();
afterEach(() => oauth.settle());

async function connectLikeChatGPT() {
  const keys = await generateKeyPair("RS256", { extractable: true });
  const kid = "key-1";
  const jwk = await exportJWK(keys.publicKey);
  oauth.documents.set(JWKS, { keys: [{ ...jwk, kid, alg: "RS256", use: "sig" }] });
  oauth.documents.set(CHATGPT, {
    client_id: CHATGPT,
    client_name: "ChatGPT",
    client_uri: "https://client.example.test/",
    redirect_uris: [REDIRECT_URI],
    token_endpoint_auth_method: "private_key_jwt",
    token_endpoint_auth_signing_alg: "RS256",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    jwks_uri: JWKS,
  });
  const person = await oauth.signIn();
  const slug = `gpt-${crypto.randomUUID().slice(0, 8)}`;
  await query(
    URLS.migrator,
    `insert into spaces (slug, name, default_locale, locales) values ($1, '{"es":"E"}', 'es', '{es}')`,
    [slug],
  );
  await query(
    URLS.migrator,
    `insert into memberships (space_id, user_id, role)
     select s.id, u.id, 'owner' from spaces s, "user" u where s.slug = $1 and u.email = $2`,
    [slug, person.email],
  );
  const asked = await oauth.authorize(person.cookie, SCOPES, CHATGPT);
  const consent = await oauth.consent(person.cookie, asked.headers.get("location") ?? "");
  const { url } = (await consent.json()) as { url: string };
  const code = new URL(url).searchParams.get("code") ?? "";
  const answer = await oauth.call("/api/auth/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: oauth.verifier,
      resource: RESOURCE,
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: await signedAssertion(keys.privateKey, kid),
    }).toString(),
  });
  const tokens = (await answer.json()) as { access_token?: string; scope?: string };
  return { status: answer.status, tokens, slug };
}

describe("the way ChatGPT connects", () => {
  it("gets a token, lists every tool, and makes and publishes a route", async () => {
    const { status, tokens, slug } = await connectLikeChatGPT();
    expect(status).toBe(200);
    expect(tokens.scope).toBe(SCOPES);
    const client = new Client({ name: "like-chatgpt", version: "1" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(RESOURCE), {
        fetch: async (input, init) =>
          oauth.call(new URL(String(input)).pathname, {
            ...init,
            headers: {
              ...Object.fromEntries(new Headers(init?.headers).entries()),
              authorization: `Bearer ${tokens.access_token}`,
            },
          }),
      }),
    );
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    for (const name of ["list_spaces", "get_route_format", "import_route", "publish_route"]) {
      expect(names).toContain(name);
    }
    expect(tools.find((tool) => tool.name === "list_spaces")?.description).toContain(
      "get_route_format",
    );

    const spaces = (await client.callTool({ name: "list_spaces", arguments: {} }))
      .structuredContent as { spaces: { space_id: string; slug: string }[] };
    const spaceId = spaces.spaces.find((space) => space.slug === slug)?.space_id;
    expect(spaceId).toBeTruthy();

    const format = (await client.callTool({ name: "get_route_format", arguments: {} }))
      .structuredContent as { guide: string; json_schema: object };
    expect(format.guide.length).toBeGreaterThan(100);
    expect(format.json_schema).toBeTruthy();

    // What the guide says is what a model would send.
    const example = JSON.parse(format.guide.match(FIRST_JSON)?.[1] ?? "null");
    const imported = await client.callTool({
      name: "import_route",
      arguments: { space_id: spaceId, document: example },
    });
    expect(imported.isError ?? false).toBe(false);
    const made = imported.structuredContent as { route_id: string; draft_revision: number };

    const published = await client.callTool({
      name: "publish_route",
      arguments: { route_id: made.route_id, draft_revision: made.draft_revision },
    });
    expect(published.isError ?? false).toBe(false);
    expect((published.structuredContent as { public_url: string }).public_url).toContain(slug);
    await client.close();
  });

  it("keeps every tool's name and description the same from one deploy to the next", async () => {
    const { TOOLS } = await import("../../src/mcp/tools");
    expect(TOOLS.map(({ name, description }) => ({ name, description }))).toMatchSnapshot();
  });
});
