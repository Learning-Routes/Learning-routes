import { describe, expect, it } from "vitest";
import worker, { policyFor } from "../src/index";
import { isSigned, LONGEST_S, signatureOf } from "../src/signing";

// The content host (Platform STEP 9 §1): what it serves, and what it never does.

const SPACE = "0192d3a0-0000-7000-8000-0000000000a0";
const ROUTE = "0192d3a0-0000-7000-8000-0000000000b0";
const HASH = "a".repeat(64);
const SECRET = "test-only-content-secret-0123456789abcdef";
const HTML = "<!doctype html><button>Do</button>";

function bucket(keys: string[]) {
  return {
    get: async (key: string) => (keys.includes(key) ? { body: HTML } : null),
  } as unknown as R2Bucket;
}

const env = (keys: string[]) =>
  ({
    CREATIONS: bucket(keys),
    CONTENT_SIGNING_SECRET: SECRET,
    FRAME_ANCESTORS: "https://app.example.test",
  }) as unknown as Env;

const get = (path: string, keys: string[], init: RequestInit = {}) =>
  worker.fetch(new Request(`https://content.example.test${path}`, init) as never, env(keys));

const published = `/p/${SPACE}/${ROUTE}/${HASH}.html`;
const draft = `/d/${SPACE}/${ROUTE}/${HASH}.html`;

describe("a published creation", () => {
  it("is served as it was uploaded, under the strict policy, for good", async () => {
    const answer = await get(published, [`pub/${SPACE}/${ROUTE}/${HASH}.html`]);
    expect(answer.status).toBe(200);
    expect(await answer.text()).toBe(HTML);
    const policy = answer.headers.get("content-security-policy") ?? "";
    for (const rule of [
      "default-src 'none'",
      "connect-src 'none'",
      "form-action 'none'",
      "frame-ancestors https://app.example.test",
    ]) {
      expect(policy).toContain(rule);
    }
    expect(answer.headers.get("x-content-type-options")).toBe("nosniff");
    expect(answer.headers.get("cache-control")).toContain("immutable");
    expect(answer.headers.get("set-cookie")).toBeNull();
  });

  it("is not there when nothing was published under it", async () => {
    expect((await get(published, [])).status).toBe(404);
  });
});

describe("a draft's creation", () => {
  const key = [`draft/${SPACE}/${ROUTE}/${HASH}.html`];
  const now = () => Math.floor(Date.now() / 1000);

  it("needs the API's signature", async () => {
    expect((await get(draft, key)).status).toBe(403);
    const expires = now() + 300;
    const signature = await signatureOf(SECRET, draft, expires);
    const answer = await get(`${draft}?e=${expires}&s=${signature}`, key);
    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toContain("no-store");
  });

  it("refuses a signature that is expired, too long-lived, for another path, or forged", async () => {
    const late = now() - 1;
    expect(
      (await get(`${draft}?e=${late}&s=${await signatureOf(SECRET, draft, late)}`, key)).status,
    ).toBe(403);
    const far = now() + LONGEST_S + 60;
    expect(
      (await get(`${draft}?e=${far}&s=${await signatureOf(SECRET, draft, far)}`, key)).status,
    ).toBe(403);
    const soon = now() + 60;
    const other = await signatureOf(SECRET, `/d/${SPACE}/${ROUTE}/${"b".repeat(64)}.html`, soon);
    expect((await get(`${draft}?e=${soon}&s=${other}`, key)).status).toBe(403);
    const forged = await signatureOf("another-secret", draft, soon);
    expect((await get(`${draft}?e=${soon}&s=${forged}`, key)).status).toBe(403);
  });
});

describe("anything else", () => {
  it.each([
    "/",
    "/p/x.html",
    `/p/${SPACE}/${ROUTE}/${HASH}.js`,
    `/p/${SPACE}/../${HASH}.html`,
    `/x/${SPACE}/${ROUTE}/${HASH}.html`,
  ])("is not found: %s", async (path) => {
    expect((await get(path, [])).status).toBe(404);
  });

  it("only reads", async () => {
    const answer = await get(published, [], { method: "POST" });
    expect(answer.status).toBe(405);
  });

  it("never names the app's session, nor lets a creation reach the network", () => {
    expect(policyFor("https://a.test")).not.toContain("connect-src https");
    expect(policyFor("https://a.test")).toContain("object-src 'none'");
  });
});

describe("the signature both Workers make", () => {
  it("matches this vector, which the API's signer is tested against too", async () => {
    expect(await signatureOf(SECRET, "/d/x", 1_800_000_000)).toMatchSnapshot();
    expect(await isSigned(SECRET, "/d/x", 1, "", 0)).toBe(false);
  });
});
