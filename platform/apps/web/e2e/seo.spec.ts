import { expect, test } from "@playwright/test";

const H1 = /<h1[ >]/g;

test("the landing has what a crawler and a share need", async ({ request }) => {
  const html = await (await request.get("/es")).text();
  expect(html.match(H1)).toHaveLength(1);
  expect(html).toContain('name="description"');
  expect(html).toContain('property="og:image"');
  expect(html).toContain('rel="preload"');
  const image = await request.get("/og-es.png");
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");
});
