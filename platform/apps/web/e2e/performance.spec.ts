import { expect, test } from "@playwright/test";

// The storefront's targets (Platform STEP 3 §4), in the browser itself on the built
// preview, throttled as Lighthouse's mobile profile: Slow 4G and a 4x slower CPU.
// shortcut(Platform STEP 4): this reads what Chrome reports, not Lighthouse's own runner,
// whose dependencies are younger than the 14-day rule; use Lighthouse once they age.
const TARGETS = { lcp: 1800, cls: 0.05, tbt: 50 };
const SLOW_4G = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] as number;

test("the landing meets its performance targets on a throttled phone", async ({ browser }) => {
  test.setTimeout(120_000);
  const runs: { lcp: number; cls: number; tbt: number }[] = [];
  for (let run = 0; run < 3; run++) {
    const context = await browser.newContext({
      viewport: { width: 412, height: 823 },
      deviceScaleFactor: 1.75,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", SLOW_4G);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(() => {
      const metrics = { lcp: 0, cls: 0, tbt: 0 };
      (window as unknown as { metrics: typeof metrics }).metrics = metrics;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          metrics.lcp = entry.startTime;
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
        }[]) {
          if (!entry.hadRecentInput) {
            metrics.cls += entry.value;
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          metrics.tbt += Math.max(0, entry.duration - 50);
        }
      }).observe({ type: "longtask", buffered: true });
    });
    await page.goto("/es", { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1500);
    runs.push(
      await page.evaluate(
        () => (window as unknown as { metrics: { lcp: number; cls: number; tbt: number } }).metrics,
      ),
    );
    await context.close();
  }
  const lcp = median(runs.map((run) => run.lcp));
  const cls = median(runs.map((run) => run.cls));
  const tbt = median(runs.map((run) => run.tbt));
  console.log(
    `storefront: LCP ${Math.round(lcp)} ms, CLS ${cls.toFixed(3)}, TBT ${Math.round(tbt)} ms`,
  );
  expect(lcp).toBeGreaterThan(0);
  expect(lcp).toBeLessThan(TARGETS.lcp);
  expect(cls).toBeLessThan(TARGETS.cls);
  expect(tbt).toBeLessThan(TARGETS.tbt);
});

test("the landing has what a crawler and a share need", async ({ request }) => {
  const html = await (await request.get("/es")).text();
  expect(html.match(/<h1[ >]/g)).toHaveLength(1);
  expect(html).toContain('name="description"');
  expect(html).toContain('property="og:image"');
  expect(html).toContain('rel="preload"');
  const image = await request.get("/og-es.png");
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");
});
