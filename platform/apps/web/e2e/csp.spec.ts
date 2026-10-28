import { expect, type Page, test } from "@playwright/test";

const POLICY =
  /^default-src 'self'; script-src 'self' 'nonce-([A-Za-z0-9+/=]{24})'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'$/;
const PAGES = ["/es", "/studio"];

function nonceOf(policy: string | undefined): string {
  const match = POLICY.exec(policy ?? "");
  expect(match, `policy was: ${policy}`).not.toBeNull();
  return (match as RegExpExecArray)[1] as string;
}

async function violations(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      const w = window as unknown as { __csp?: string[] };
      w.__csp = [...(w.__csp ?? []), `${e.violatedDirective} ${e.blockedURI}`];
    });
  });
});

for (const path of PAGES) {
  test(`${path} carries the strict policy with a fresh nonce`, async ({ request }) => {
    const first = nonceOf((await request.get(path)).headers()["content-security-policy"]);
    const second = nonceOf((await request.get(path)).headers()["content-security-policy"]);
    expect(first).not.toBe(second);
  });

  test(`${path} loads with no policy violation`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await violations(page)).toEqual([]);
  });

  test(`${path} has no inline script without this response's nonce`, async ({ request }) => {
    const response = await request.get(path);
    const nonce = nonceOf(response.headers()["content-security-policy"]);
    const inline = [...(await response.text()).matchAll(/<script(?![^>]*\ssrc=)([^>]*)>/g)];
    for (const [, attributes] of inline) expect(attributes).toContain(`nonce="${nonce}"`);
  });
}

test("the browser refuses an inline script without the nonce, and runs one with it", async ({
  page,
}) => {
  await page.route("**/studio", async (route) => {
    const response = await route.fetch();
    const nonce = nonceOf(response.headers()["content-security-policy"]);
    const body = (await response.text()).replace(
      "</body>",
      `<script>window.__unsigned = true</script><script nonce="${nonce}">window.__signed = true</script></body>`,
    );
    await route.fulfill({ response, body });
  });
  await page.goto("/studio");

  expect(await page.evaluate(() => "__unsigned" in window)).toBe(false);
  expect(await page.evaluate(() => "__signed" in window)).toBe(true);
  expect((await violations(page)).some((v) => v.startsWith("script-src"))).toBe(true);
});
