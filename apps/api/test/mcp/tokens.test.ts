import { afterEach, describe, expect, it } from "vitest";
import { APP } from "../auth/harness";
import { query, URLS } from "../db/connect";
import { CLIENT_ID, envelope, oauthHarness, RESOURCE } from "./oauth-harness";

// A token is only good here if it says so in every way (Platform STEP 5 §6). Each of these is
// signed with the server's real key, so the claim itself is what gets it refused.

const oauth = oauthHarness();
afterEach(() => oauth.settle());

const NOW_S = () => Math.floor(Date.now() / 1000);

async function connected() {
  const person = await oauth.signIn();
  await query(
    URLS.migrator,
    `with made as (insert into spaces (slug, name, default_locale, locales)
       values ($1, '{"es":"Espacio"}', 'es', '{es}') returning id)
     insert into memberships (space_id, user_id, role)
     select made.id, u.id, 'owner' from made, "user" u where u.email = $2`,
    [`token-${crypto.randomUUID().slice(0, 8)}`, person.email],
  );
  const { access_token: real } = await oauth.connect(person.cookie);
  const claims = JSON.parse(
    atob((real.split(".")[1] ?? "").replaceAll("-", "+").replaceAll("_", "/")),
  );
  return { real, sub: claims.sub as string };
}

const listTools = (token: string) => oauth.call("/mcp", envelope("tools/list", {}, token));

describe("an access token", () => {
  it("is good when everything in it is", async () => {
    const { sub } = await connected();
    const token = await oauth.signed({
      sub,
      azp: CLIENT_ID,
      aud: RESOURCE,
      iss: `${APP}/api/auth`,
      scope: "routes:read",
      iat: NOW_S(),
      exp: NOW_S() + 3600,
    });
    expect((await listTools(token)).status).toBe(200);
  });

  const BAD: [string, Record<string, unknown>][] = [
    ["for another server", { aud: "https://other.example.test/mcp" }],
    ["from another issuer", { iss: "https://other.example.test/api/auth" }],
    ["expired", { exp: NOW_S() - 10, iat: NOW_S() - 3610 }],
    ["with no client", { azp: undefined }],
    ["bound to a key this server has not checked", { cnf: { jkt: "x" } }],
    ["of a client they never said yes to", { azp: "https://other.example.test/client.json" }],
  ];

  for (const [name, change] of BAD) {
    it(`is refused when ${name}`, async () => {
      const { sub } = await connected();
      const payload = {
        sub,
        azp: CLIENT_ID,
        aud: RESOURCE,
        iss: `${APP}/api/auth`,
        scope: "routes:read",
        iat: NOW_S(),
        exp: NOW_S() + 3600,
        ...change,
      };
      const response = await listTools(await oauth.signed(payload));
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("resource_metadata=");
    });
  }
});
