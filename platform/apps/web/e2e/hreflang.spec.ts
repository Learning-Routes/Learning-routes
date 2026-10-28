import { expect, test } from "@playwright/test";

const ALTERNATE = /<link rel="alternate" hrefLang="([^"]+)" href="([^"]+)"\/?>/g;

test("a page links its locales with text, itself and x-default, by full URL", async ({
  request,
  baseURL,
}) => {
  const html = await (await request.get("/es")).text();
  const links = [...html.matchAll(ALTERNATE)].map(([, lang, href]) => [lang, href]);

  expect(links).toEqual([
    ["es", `${baseURL}/es`],
    ["x-default", `${baseURL}/`],
  ]);
});

for (const path of ["/en", "/xx"]) {
  test(`${path}: a locale without text has no page and no alternate link`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain('rel="alternate"');
  });
}

test("x-default sends people to the source locale", async ({ request }) => {
  const response = await request.get("/", { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  expect(response.headers().location).toBe("/es");
});
