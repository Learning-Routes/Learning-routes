import { expect, test } from "@playwright/test";

const ALTERNATE = /<link rel="alternate" hrefLang="([^"]+)" href="([^"]+)"\/?>/g;
const LINES = {
  es: "Aprende lo que quieras, bien.",
  en: "Learn anything, and learn it well.",
  pt: "Aprenda o que quiser, e aprenda bem.",
  fr: "Apprenez ce que vous voulez, et apprenez bien.",
  it: "Impara ciò che vuoi, e imparalo bene.",
} as const;

for (const [locale, line] of Object.entries(LINES)) {
  test(`/${locale} is the storefront home in its language, linked to every other one`, async ({
    request,
    baseURL,
  }) => {
    const response = await request.get(`/${locale}`);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain(`<html lang="${locale}"`);
    expect(html).toContain(line);

    // Reciprocal: every page lists the same set, itself included, by full URL.
    const links = [...html.matchAll(ALTERNATE)].map(([, lang, href]) => [lang, href]);
    expect(links).toEqual([
      ...Object.keys(LINES).map((l) => [l, `${baseURL}/${l}`]),
      ["x-default", `${baseURL}/`],
    ]);
  });
}

test("a segment that is not a locale has no page and no alternate link", async ({ request }) => {
  const response = await request.get("/xx");
  expect(response.status()).toBe(404);
  expect(await response.text()).not.toContain('rel="alternate"');
});

test("x-default sends people to the source locale", async ({ request }) => {
  const response = await request.get("/", { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  expect(response.headers().location).toBe("/es");
});
