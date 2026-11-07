import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { isSigned, signatureOf } from "../src/signing";

// A creation's thumbnail (Platform STEP 9 §4): taken once, from the draft's own signed address.

const SPACE = "0192d3a0-0000-7000-8000-0000000000a0";
const ROUTE = "0192d3a0-0000-7000-8000-0000000000b0";
const HASH = "c".repeat(64);
const SECRET = "test-only-content-secret-0123456789abcdef";
const PATH = `/t/${SPACE}/${ROUTE}/${HASH}.webp`;
const DRAFT = `draft/${SPACE}/${ROUTE}/${HASH}.html`;
const KEPT = `thumb/${SPACE}/${ROUTE}/${HASH}.webp`;
const PICTURE = new Uint8Array([1, 2, 3]);

function world(keys: string[], answer = new Response(PICTURE)) {
  const stored = new Map<string, unknown>(keys.map((key) => [key, PICTURE]));
  const asked: { url?: string; allowRequestPattern?: string[] }[] = [];
  const env = {
    CONTENT_SIGNING_SECRET: SECRET,
    FRAME_ANCESTORS: "https://app.example.test",
    CREATIONS: {
      get: async (key: string) => (stored.has(key) ? { body: stored.get(key) } : null),
      head: async (key: string) => (stored.has(key) ? { uploaded: new Date() } : null),
      put: async (key: string, value: unknown) => {
        stored.set(key, value);
      },
    },
    BROWSER: {
      quickAction: async (
        _action: string,
        options: { url?: string; allowRequestPattern?: string[] },
      ) => {
        asked.push(options);
        return answer.clone();
      },
    },
  } as unknown as Env;
  const get = async (sign = true) => {
    const expires = Math.floor(Date.now() / 1000) + 600;
    const query = sign ? `?e=${expires}&s=${await signatureOf(SECRET, PATH, expires)}` : "";
    return worker.fetch(new Request(`https://content.example.test${PATH}${query}`) as never, env);
  };
  return { stored, asked, get };
}

describe("a creation's thumbnail", () => {
  it("is taken from the draft's signed address, kept, and not taken again", async () => {
    const { stored, asked, get } = world([DRAFT]);
    const first = await get();
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("image/webp");
    expect(first.headers.get("content-security-policy")).toContain("sandbox");
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(PICTURE);
    expect(stored.has(KEPT)).toBe(true);
    const url = new URL(String(asked[0]?.url));
    expect(url.origin).toBe("https://content.example.test");
    const now = Math.floor(Date.now() / 1000);
    expect(
      await isSigned(
        SECRET,
        url.pathname,
        Number(url.searchParams.get("e")),
        String(url.searchParams.get("s")),
        now,
      ),
    ).toBe(true);
    expect((await get()).status).toBe(200);
    expect(asked).toHaveLength(1);
  });

  it("is never taken for a creation that was not stored", async () => {
    const { asked, get } = world([]);
    expect((await get()).status).toBe(404);
    expect(asked).toHaveLength(0);
  });

  it("is never taken for a request the API did not sign, and a draft's picture is not shown", async () => {
    const { asked, get } = world([DRAFT, KEPT]);
    expect((await get(false)).status).toBe(403);
    expect(asked).toHaveLength(0);
  });

  it("lets the page load only itself and the libraries its policy allows", async () => {
    const { asked, get } = world([DRAFT]);
    await get();
    const [pattern] = asked[0]?.allowRequestPattern ?? [];
    const allowed = new RegExp(String(pattern));
    expect(allowed.test(`https://content.example.test/d/${SPACE}`)).toBe(true);
    expect(allowed.test("https://cdnjs.cloudflare.com/ajax/libs/x.js")).toBe(true);
    expect(allowed.test("https://elsewhere.example/")).toBe(false);
    expect(allowed.test("https://content.example.test.elsewhere.example/")).toBe(false);
  });

  it("is not tried again for an hour when Browser Run could not take it", async () => {
    const { stored, asked, get } = world([DRAFT], new Response("busy", { status: 429 }));
    expect((await get()).status).toBe(404);
    expect(stored.has(KEPT)).toBe(false);
    expect((await get()).status).toBe(404);
    expect(asked).toHaveLength(1);
  });
});
