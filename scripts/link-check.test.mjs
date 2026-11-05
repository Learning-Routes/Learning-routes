import assert from "node:assert/strict";
import { test } from "node:test";
import { crawl, linksIn } from "./link-check.mjs";

const APP = "app.example.test";
const answer = (body, init = {}) =>
  new Response(body, { headers: { "content-type": "text/html" }, status: 200, ...init });
const to = (location) => () => new Response(null, { status: 302, headers: { location } });

const site = (pages) => async (address) => {
  const page = pages[address];
  if (page === undefined) {
    return answer("gone", { status: 404 });
  }
  if (page instanceof Error) {
    throw page;
  }
  return typeof page === "string" ? answer(page) : page();
};

const run = (pages, starts = ["https://example.test/"]) =>
  crawl({ starts, appHost: APP, fetcher: site(pages) });

test("reads links, forms and assets, and leaves out what is no page", () => {
  const html = `<a href="/a?x=1&amp;y=2#top">a</a><a href="#here">b</a><a href="mailto:x@y.z">c</a>
    <form method="post" action="/send"></form><img alt="" src='/i.png'><link rel="canonical" href="/c">`;
  assert.deepEqual(
    linksIn(html, "https://example.test/").map((link) => link.url),
    [
      "https://example.test/a?x=1&y=2",
      "https://example.test/send",
      "https://example.test/i.png",
      "https://example.test/c",
    ],
  );
});

test("passes a clean site, and walks it to the end", async () => {
  const result = await run({
    "https://example.test/": `<a href="/b">b</a>`,
    "https://example.test/b": `<a href="https://app.example.test/sign-in">in</a>`,
    "https://app.example.test/sign-in": `<a href="https://example.test/">home</a>`,
  });
  assert.deepEqual(result.problems, []);
  assert.equal(result.pages, 3);
});

test("fails on a 404, a 5xx, a redirect loop and a DNS error", async () => {
  const dns = Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
  const { problems } = await run({
    "https://example.test/": `<a href="/gone">1</a><a href="/broken">2</a><a href="/loop">3</a><a href="https://nope.example.test/">4</a>`,
    "https://example.test/broken": () => new Response("x", { status: 500 }),
    "https://example.test/loop": to("/loop2"),
    "https://example.test/loop2": to("/loop"),
    "https://nope.example.test/": dns,
  });
  assert.equal(problems.length, 4);
  assert.ok(problems.some((problem) => problem.startsWith("404 at https://example.test/gone")));
  assert.ok(problems.some((problem) => problem.startsWith("500 at")));
  assert.ok(problems.some((problem) => problem.startsWith("redirect loop")));
  assert.ok(problems.some((problem) => problem.startsWith("DNS error")));
});

test("fails on an app page linked off the app's host, and on a host that isn't live", async () => {
  const { problems } = await run({
    "https://example.test/": `<a href="/mis-rutas">1</a><a href="http://localhost:4174/x">2</a><script>"https://abc.workers.dev"</script>`,
    "https://example.test/mis-rutas": to("https://app.example.test/mis-rutas"),
    "https://app.example.test/mis-rutas": `ok`,
    "http://localhost:4174/x": new TypeError("fetch failed"),
  });
  assert.ok(problems.some((problem) => problem.includes("belongs on app.example.test")));
  assert.ok(problems.some((problem) => problem.includes("names http://localhost:4174")));
  assert.ok(problems.some((problem) => problem.includes("names https://abc.workers.dev")));
});

test("asks another site once, and doesn't follow its links", async () => {
  const result = await run({
    "https://example.test/": `<a href="https://other.test/">o</a>`,
    "https://other.test/": `<a href="https://other.test/gone">x</a>`,
  });
  assert.deepEqual(result.problems, []);
  assert.equal(result.pages, 1);
});

test("stops at its limit instead of walking forever", async () => {
  let page = 0;
  const { problems } = await crawl({
    starts: ["https://example.test/"],
    appHost: APP,
    maxPages: 5,
    fetcher: async () => {
      page += 1;
      return answer(`<a href="/p${page}">n</a>`);
    },
  });
  assert.ok(problems.some((problem) => problem.startsWith("stopped at 5")));
});
