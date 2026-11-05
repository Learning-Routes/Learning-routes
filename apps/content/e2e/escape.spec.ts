import { expect, type Page, test } from "@playwright/test";

// A creation runs in its own box (Platform STEP 9 §1, §5.2): in every browser engine, each way out
// is closed. The fixture tries them all and reports back. The box holds framed as the lesson frames
// it, framed with no sandbox attribute at all, and opened straight as a page.

const ATTEMPTS = [
  "read the parent page",
  "fetch the API",
  "send a beacon",
  "open a socket",
  "load a foreign image",
  "frame another page",
  "submit a form",
  "read cookies",
  "open a popup",
  "store data",
  "widen its origin",
  "navigate the top window",
];

async function hitsOf(page: Page) {
  return (await (await page.request.get("http://localhost:4310/hits")).json()) as {
    app: string[];
    foreign: string[];
  };
}

async function expectBoxed(
  page: Page,
  outcome: Record<string, string>,
  start: string,
  popups: number,
) {
  expect(outcome.origin).toBe("null");
  for (const attempt of ATTEMPTS) {
    expect(outcome[attempt], attempt).toBe("blocked");
  }
  await page.waitForTimeout(800);
  expect(page.url()).toBe(start);
  expect(popups).toBe(0);
  const hits = await hitsOf(page);
  expect(hits.app).toEqual([]);
  expect(hits.foreign).toEqual([]);
}

// Each test reads the counts its own visit made.
test.beforeEach(async ({ request }) => {
  await request.get("http://localhost:4310/hits?reset");
});

for (const [name, path] of [
  ["framed as the lesson frames it", "/"],
  ["framed with no sandbox attribute", "/unsandboxed"],
] as const) {
  test(`a creation ${name} can't reach anything outside its frame`, async ({ page }) => {
    let popups = 0;
    page.context().on("page", () => {
      popups += 1;
    });
    await page.goto(`http://localhost:4310${path}`);
    const reported = await page.waitForFunction(
      () => (window as { outcome?: object }).outcome,
      null,
      {
        timeout: 15_000,
      },
    );
    await expectBoxed(
      page,
      (await reported.jsonValue()) as Record<string, string>,
      page.url(),
      popups,
    );
  });
}

test("a creation opened straight as a page is still in its box", async ({ page }) => {
  let popups = 0;
  page.context().on("page", () => {
    popups += 1;
  });
  await page.goto("http://localhost:4310/creation");
  const start = page.url();
  const reported = await page.waitForFunction(
    () => (window as { results?: object }).results,
    null,
    {
      timeout: 15_000,
    },
  );
  await expectBoxed(page, (await reported.jsonValue()) as Record<string, string>, start, popups);
});
