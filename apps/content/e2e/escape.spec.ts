import { expect, test } from "@playwright/test";

// A creation runs in its own box (Platform STEP 9 §1, §5.2): in every browser engine, each way out
// is closed. The fixture tries them all and reports back through the one channel it has.

const ATTEMPTS = [
  "read the parent page",
  "fetch the API",
  "read cookies",
  "open a popup",
  "store data",
  "navigate the top window",
];

test("a creation can't reach anything outside its frame", async ({ page }) => {
  let popups = 0;
  page.context().on("page", () => {
    popups += 1;
  });
  await page.goto("http://localhost:4310/");
  const results = await page.waitForFunction(() => (window as { outcome?: object }).outcome, null, {
    timeout: 15_000,
  });
  const outcome = (await results.jsonValue()) as Record<string, string>;
  for (const attempt of ATTEMPTS) {
    expect(outcome[attempt], attempt).toBe("blocked");
  }
  await page.waitForTimeout(500);
  expect(page.url()).toBe("http://localhost:4310/");
  expect(popups).toBe(0);
});
