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
    expect(answer.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(answer.headers.get("content-security-policy")).toContain("sandbox allow-scripts");
    expect(answer.headers.get("strict-transport-security")).toBeTruthy();
    expect(answer.headers.get("set-cookie")).toBeNull();
  });

  it("answers a cheap 304 to a cache that already holds it", async () => {
    const answer = await get(published, [], { headers: { "if-none-match": `"${HASH}"` } });
    expect(answer.status).toBe(304);
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
    expect(await isSigned(SECRET, "/d/x", 1, "!!!", 0)).toBe(false);
    await expect(isSigned("short", "/d/x", 1, "", 0)).rejects.toThrow("too short");
  });
});

describe("an asset", () => {
  const PNG_KEY = `a/${SPACE}/${HASH}.png`;
  const assets = (contentType: string) =>
    ({
      CREATIONS: {
        get: async (key: string, options?: { range?: Headers }) => {
          if (key !== PNG_KEY) {
            return null;
          }
          const ranged = options?.range?.get("range") === "bytes=2-5";
          return {
            body: ranged ? "2345" : "0123456789",
            size: 10,
            range: ranged ? { offset: 2, length: 4 } : undefined,
            httpMetadata: { contentType },
          };
        },
      },
    }) as unknown as Env;
  const fetchAsset = (path: string, contentType: string, init: RequestInit = {}) =>
    worker.fetch(
      new Request(`https://content.example.test${path}`, init) as never,
      assets(contentType),
    );

  it("is served by the type its bytes had, with nothing in it allowed to run", async () => {
    const answer = await fetchAsset(`/a/${SPACE}/${HASH}.png`, "image/png");
    expect(answer.status).toBe(200);
    expect(answer.headers.get("content-type")).toBe("image/png");
    const policy = answer.headers.get("content-security-policy") ?? "";
    expect(policy).toContain("default-src 'none'");
    expect(policy.endsWith("sandbox")).toBe(true);
    expect(policy).not.toContain("script");
    expect(answer.headers.get("x-content-type-options")).toBe("nosniff");
    expect(answer.headers.get("set-cookie")).toBeNull();
  });

  it("answers a range, as audio and video ask", async () => {
    const answer = await fetchAsset(`/a/${SPACE}/${HASH}.png`, "image/png", {
      headers: { range: "bytes=2-5" },
    });
    expect(answer.status).toBe(206);
    expect(answer.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await answer.text()).toBe("2345");
  });

  it("is not there under another name or extension", async () => {
    expect((await fetchAsset(`/a/${SPACE}/${HASH}.html`, "text/html")).status).toBe(404);
    expect((await fetchAsset(`/a/${SPACE}/${HASH}.jpg`, "image/jpeg")).status).toBe(404);
  });
});
