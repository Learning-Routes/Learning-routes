// The Open Graph image for each locale, from the hero's SVG, at build time (Platform
// STEP 3 §4). Runs after the build, in the installed Chrome.
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LANDING_TEXT } from "@learning-routes/core/copy/landing";
import { LOCALES } from "@learning-routes/core/locales";
import { chromium } from "@playwright/test";
import { renderToStaticMarkup } from "react-dom/server";
import { RouteMapFigure } from "../app/landing/route-map-figure";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOKENS = resolve(WEB, "../../packages/design-tokens");
const WIDTH = 1200;
const HEIGHT = 630;
const SCENE = {
  panel: 0,
  mobile: false,
  width: WIDTH,
  height: HEIGHT,
  done: 0,
  framing: { sx: 0.34, sy: -0.3 },
};

const css = [
  readFileSync(resolve(TOKENS, "tokens.css"), "utf8").replaceAll(
    "./fonts/",
    `file://${TOKENS}/fonts/`,
  ),
  readFileSync(resolve(WEB, "app/landing/landing.css"), "utf8"),
  `body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: var(--gradient-stage);
     font-family: var(--font-sans); color: var(--color-txt); }
   .og-map { position: absolute; inset: 0; width: 100%; height: 100%; }
   .og-text { position: absolute; left: 64px; top: 64px; width: 560px; margin: 0; font-size: 76px;
     font-weight: var(--weight-display); font-stretch: var(--stretch-display);
     letter-spacing: var(--tracking-display); line-height: var(--leading-display); }`,
].join("\n");

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
const scratch = resolve(WEB, "build/og.html");
for (const locale of LOCALES) {
  const words = LANDING_TEXT[locale];
  const map = renderToStaticMarkup(
    <RouteMapFigure scene={SCENE} words={words} className="og-map" title={false} />,
  );
  writeFileSync(
    scratch,
    `<!doctype html><html data-theme="light"><meta charset="utf-8"><style>${css}</style><body>${map}<h1 class="og-text">${words.headline}</h1></body></html>`,
  );
  await page.goto(`file://${scratch}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: resolve(WEB, `build/client/og-${locale}.png`),
    animations: "disabled",
  });
}
await browser.close();
rmSync(scratch);
