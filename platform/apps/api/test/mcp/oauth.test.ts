import { afterEach, describe, expect, it } from "vitest";
import { APP } from "../auth/harness";
import { query, URLS } from "../db/connect";
import { CLIENT_ID, oauthHarness, REDIRECT_URI, RESOURCE } from "./oauth-harness";

// OAuth for the creator's MCP (Platform STEP 5 §2): a client names itself by its metadata
// document, a person with a space to teach in says yes on the app's host, and what comes
// back is an hour's token for this server alone, with a refresh token that rotates.

const oauth = oauthHarness();
afterEach(() => oauth.settle());

/** A signed-in person who teaches in a space of their own. */
async function teacher(joining?: string) {
  const person = await oauth.signIn();
  if (joining) {
    await query(
      URLS.migrator,
      `insert into memberships (space_id, user_id, role)
       select s.id, u.id, 'coeditor' from spaces s, "user" u where s.slug = $1 and u.email = $2`,
      [joining, person.email],
    );
    return { ...person, slug: joining };
  }
  const slug = `conexion-${crypto.randomUUID().slice(0, 8)}`;
  await query(
    URLS.migrator,
    `with made as (
       insert into spaces (slug, name, default_locale, locales)
       values ($1, '{"es":"Espacio"}', 'es', '{es}') returning id
     )
     insert into memberships (space_id, user_id, role)
     select made.id, u.id, 'owner' from made, "user" u where u.email = $2`,
    [slug, person.email],
  );
  return { ...person, slug };
}

// What these servers answer, read loosely: the assertions say what matters.
// biome-ignore lint/suspicious/noExplicitAny: test bodies
type Json = Record<string, any>;
const claimsOf = (jwt: string) =>
  JSON.parse(atob((jwt.split(".")[1] ?? "").replaceAll("-", "+").replaceAll("_", "/")));

describe("discovery", () => {
  it("names the server and its authorization server, and asks for the client's document", async () => {
    const resource = await oauth.call("/.well-known/oauth-protected-resource/mcp");
    expect(resource.status).toBe(200);
    const described = (await resource.json()) as Json;
    expect(described.resource).toBe(RESOURCE);
    expect(described.scopes_supported).toEqual(["routes:read", "routes:write", "routes:publish"]);
    const issuer = described.authorization_servers[0];
    expect(issuer).toBe(`${APP}/api/auth`);
    const server = await oauth.call("/.well-known/oauth-authorization-server/api/auth");
    expect(server.status).toBe(200);
    const metadata = (await server.json()) as Json;
    expect(metadata.client_id_metadata_document_supported).toBe(true);
    expect(metadata.token_endpoint_auth_methods_supported).toContain("none");
    expect(metadata.registration_endpoint).toBeUndefined();
    expect(metadata.code_challenge_methods_supported).toContain("S256");
  });
});

describe("connecting", () => {
  it("sends someone not signed in to sign in, with the request kept", async () => {
    const asked = await oauth.authorize("");
    expect(asked.status).toBe(302);
    const location = new URL(asked.headers.get("location") ?? "", APP);
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(location.searchParams.get("sig")).toBeTruthy();
  });

  it("asks a teacher on the app's own consent page", async () => {
    const { cookie } = await teacher();
    const asked = await oauth.authorize(cookie);
    const location = new URL(asked.headers.get("location") ?? "", APP);
    expect(location.pathname).toBe("/conectar");
  });

  it("gives an hour's token for this server only, carrying the scopes said yes to", async () => {
    const { cookie } = await teacher();
    const tokens = await oauth.connect(cookie);
    expect(tokens.expires_in).toBe(3600);
    const claims = claimsOf(tokens.access_token);
    expect(claims.aud).toBe(RESOURCE);
    expect(claims.iss).toBe(`${APP}/api/auth`);
    expect(claims.azp).toBe(CLIENT_ID);
    expect(claims.scope.split(" ")).toContain("routes:publish");
  });

  it("stores only hashes of what it hands out", async () => {
    const { cookie, email } = await teacher();
    const tokens = await oauth.connect(cookie);
    const stored = await query(
      URLS.migrator,
      `select r.token from oauth_refresh_token r join "user" u on u.id = r.user_id where u.email = $1`,
      [email],
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].token).not.toBe(tokens.refresh_token);
    expect(stored[0].token).not.toContain(tokens.refresh_token);
  });

  it("logs the grant", async () => {
    const { cookie, email } = await teacher();
    await oauth.connect(cookie);
    const logged = await query(
      URLS.migrator,
      `select l.outcome, l.actor_via, l.space_id from action_log l join "user" u on u.id = l.actor_user_id
        where u.email = $1 and l.action = 'connection.grant'`,
      [email],
    );
    expect(logged).toEqual([{ outcome: "ok", actor_via: "ui", space_id: null }]);
  });

  it("sends a refusal back to the client as access_denied, with no grant", async () => {
    const { cookie, email } = await teacher();
    const asked = await oauth.authorize(cookie);
    const answer = await oauth.consent(cookie, asked.headers.get("location") ?? "", false);
    const { url } = (await answer.json()) as Json;
    expect(url.startsWith(REDIRECT_URI)).toBe(true);
    expect(new URL(url).searchParams.get("error")).toBe("access_denied");
    const consents = await query(
      URLS.migrator,
      `select 1 from oauth_consent c join "user" u on u.id = c.user_id where u.email = $1`,
      [email],
    );
    expect(consents).toHaveLength(0);
  });
});

describe("who may connect", () => {
  it("gives no token to someone with no space to teach in", async () => {
    const { cookie, email } = await oauth.signIn();
    const asked = await oauth.authorize(cookie);
    const answer = await oauth.consent(cookie, asked.headers.get("location") ?? "");
    expect(answer.status).toBe(403);
    const consents = await query(
      URLS.migrator,
      `select 1 from oauth_consent c join "user" u on u.id = c.user_id where u.email = $1`,
      [email],
    );
    expect(consents).toHaveLength(0);
  });

  it("stops refreshing once the person no longer teaches anywhere", async () => {
    const { slug } = await teacher();
    const { cookie, email } = await teacher(slug);
    const tokens = await oauth.connect(cookie);
    await query(
      URLS.migrator,
      `delete from memberships where user_id = (select id from "user" where email = $1)`,
      [email],
    );
    const refused = await oauth.refresh(tokens.refresh_token);
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(await refused.text()).not.toContain("access_token");
  });
});

describe("refresh", () => {
  it("rotates: each refresh gives a new token and a new refresh token", async () => {
    const { cookie } = await teacher();
    const tokens = await oauth.connect(cookie);
    const next = await oauth.refresh(tokens.refresh_token);
    expect(next.status).toBe(200);
    const rotated = (await next.json()) as Json;
    expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
  });

  it("revokes the whole chain when an old refresh token comes back", async () => {
    const { cookie } = await teacher();
    const tokens = await oauth.connect(cookie);
    const rotated = (await (await oauth.refresh(tokens.refresh_token)).json()) as Json;
    const reused = await oauth.refresh(tokens.refresh_token);
    expect(reused.status).toBeGreaterThanOrEqual(400);
    const after = await oauth.refresh(rotated.refresh_token);
    expect(after.status).toBeGreaterThanOrEqual(400);
  });
});

describe("a client's metadata document", () => {
  it("refuses a client whose document is not there", async () => {
    oauth.documents.delete(CLIENT_ID);
    const { cookie } = await teacher();
    const asked = await oauth.authorize(cookie);
    const place = asked.headers.get("location") ?? "";
    expect(place.includes("/conectar")).toBe(false);
    oauth.documents.set(CLIENT_ID, (await import("./oauth-harness")).CLIENT_DOCUMENT);
  });
});
