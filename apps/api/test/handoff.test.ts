import { afterEach, describe, expect, it } from "vitest";
import { randomIp } from "./auth/harness";
import { oauthHarness } from "./mcp/oauth-harness";

// One address (Platform STEP 19): a session from the old app host moves to the new one through a
// code that lives a minute, is used once, and works only for the browser it was made for.

const oauth = oauthHarness("https://client.example.test/handoff.json");
afterEach(() => oauth.settle());

const BROWSER = "Mozilla/5.0 (fictional browser)";
const COOKIE_ATTRIBUTES = /Path=\/; Max-Age=\d+; Secure; HttpOnly; SameSite=Lax/;

async function codeFor(cookie: string, ip: string) {
  const answer = await oauth.api.call("/api/handoff", {
    method: "POST",
    ip,
    headers: { cookie, "user-agent": BROWSER },
  });
  return { status: answer.status, code: ((await answer.json()) as { code: string }).code };
}

const redeem = (code: string, ip: string, next = "/mis-rutas", browser = BROWSER) =>
  oauth.api.call(`/api/handoff?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`, {
    ip,
    headers: { "user-agent": browser },
  });

const cookieSet = (answer: Response) =>
  answer.headers.getSetCookie().find((line) => line.startsWith("__Host-lr_session="));

describe("the hand-off from the old app host", () => {
  it("puts the same session on the new host, once, and sends the person where they were going", async () => {
    const { cookie } = await oauth.signIn();
    const ip = randomIp();
    const { status, code } = await codeFor(cookie, ip);
    expect(status).toBe(200);
    const first = await redeem(code, ip, "/mis-rutas?x=1");
    expect(first.status).toBe(303);
    expect(first.headers.get("location")).toBe("/mis-rutas?x=1");
    const set = cookieSet(first);
    expect(set?.split(";")[0]).toBe(cookie);
    expect(set).toMatch(COOKIE_ATTRIBUTES);
    expect(cookieSet(await redeem(code, ip))).toBeUndefined();
  });

  it("works for nobody else: another address, another browser, or no session at all", async () => {
    const { cookie } = await oauth.signIn();
    const ip = randomIp();
    expect(cookieSet(await redeem((await codeFor(cookie, ip)).code, randomIp()))).toBeUndefined();
    const other = await redeem((await codeFor(cookie, ip)).code, ip, "/", "Another browser");
    expect(cookieSet(other)).toBeUndefined();
    expect(other.status).toBe(303);
    expect((await codeFor("__Host-lr_session=made.up", ip)).status).toBe(401);
    expect(cookieSet(await redeem("made-up", ip))).toBeUndefined();
  });

  it("only ever sends people to a path on this host", async () => {
    for (const next of ["//evil.example", "https://evil.example/", "/\\evil.example"]) {
      expect((await redeem("made-up", randomIp(), next)).headers.get("location")).toBe("/");
    }
  });
});
