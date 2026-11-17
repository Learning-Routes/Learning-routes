import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Unstable_DevWorker, unstable_dev } from "wrangler";

// The theme on <html>, set by HTMLRewriter after the edge cache (Platform STEP 16), run in workerd:
// Node has no HTMLRewriter.
let worker: Unstable_DevWorker;

beforeAll(async () => {
  worker = await unstable_dev("test/fixtures/theme-worker.ts", {
    config: "test/fixtures/theme-worker.jsonc",
    logLevel: "none",
    experimental: { disableExperimentalWarning: true },
  });
}, 60_000);

afterAll(() => worker?.stop());

const page = async (cookie?: string, path = "/") =>
  (await worker.fetch(path, cookie ? { headers: { cookie } } : {})).text();

describe("the reader's theme on the page", () => {
  it("is put on <html> from the cookie, and nothing else changes", async () => {
    const plain = await page();
    const dark = await page("a=b; lr_theme=dark");
    expect(dark).toBe(plain.replace('<html lang="es">', '<html lang="es" data-theme="dark">'));
    expect(await page("lr_theme=light")).toContain('<html lang="es" data-theme="light">');
  });

  it("is left out with no choice, or a value that is not a theme", async () => {
    expect(await page()).not.toContain("data-theme");
    expect(await page('lr_theme="><script>')).not.toContain("data-theme");
  });

  it("never touches an answer that is not a page", async () => {
    expect(await page("lr_theme=dark", "/json")).toBe('{"html":"<html>"}');
  });
});

// Platform STEP 19: the header's "Entrar" says "Mis rutas" to someone signed in, after the cache.
describe("the header's account link", () => {
  const SIGNED_IN = '<a class="nav-link" href="/mis-rutas">Mis rutas</a>';

  it("says Mis rutas to someone with a session, and nothing else changes", async () => {
    const plain = await page();
    const signedIn = await page("a=b; __Host-lr_session=abc.def");
    expect(signedIn).toBe(
      plain.replace(
        '<a class="nav-link" href="https://learningroutes.com/sign-in" data-account="Mis rutas">Entrar</a>',
        SIGNED_IN,
      ),
    );
  });

  it("stays Entrar without one, and never touches an answer that is not a page", async () => {
    expect(await page("lr_session=abc")).toContain(">Entrar</a>");
    expect(await page("__Host-lr_session=abc", "/json")).toBe('{"html":"<html>"}');
  });
});
