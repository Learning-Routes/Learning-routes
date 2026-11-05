// The live site's links (Platform STEP 7 §7): walks every page reachable from each start, checks
// every link, form action and asset with a GET, and reports what a person would hit. It sends no
// credentials and no POST, so a form's action is only checked to exist.

const ATTRIBUTE =
  /<(a|area|form|link|script|img|source|iframe)\b[^>]*?\s(href|action|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const OPEN_GRAPH = /<meta\b[^>]*?property="og:(?:url|image)"[^>]*?content="([^"]*)"/gi;
/** Hosts a live page must never name, anywhere in its HTML. */
const NOT_LIVE =
  /(?:https?:)?\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|[a-z0-9.-]+\.(?:workers\.dev|pages\.dev))\b[^"'\s<]*/gi;
/** The same paths as apps/web/workers/hosts.ts: pages that exist only on the app's host. */
const APP_ONLY =
  /^\/(api|empezar|mis-rutas|quiero-ensenar|ser-creador|creador|invitacion|salir|admin|conectar|ensenar|mcp)(\/|$)/;
const SITE_HEADER = /class="site-header"/;
const STYLESHEET = /<link\b[^>]*?rel="stylesheet"[^>]*?href="([^"]+)"/gi;
const NOT_A_PAGE = /^(?:mailto:|tel:|sms:|javascript:|data:|blob:|#)/i;
const REDIRECTS_AT_MOST = 10;
const AT_ONCE = 6;
const GIVE_UP_AFTER_MS = 20_000;

const decode = (text) =>
  text
    .replaceAll("&amp;", "&")
    .replaceAll("&#38;", "&")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"');

/** Every address a page points to, with what points to it, fragments dropped. */
export function linksIn(html, base) {
  const links = [];
  const add = (raw, tag) => {
    const address = decode(raw.trim());
    if (address === "" || NOT_A_PAGE.test(address)) {
      return;
    }
    try {
      const url = new URL(address, base);
      url.hash = "";
      links.push({ url: url.href, tag });
    } catch {
      links.push({ url: address, tag, invalid: true });
    }
  };
  for (const match of html.matchAll(ATTRIBUTE)) {
    add(match[3] ?? match[4] ?? "", match[1].toLowerCase());
  }
  for (const match of html.matchAll(OPEN_GRAPH)) {
    add(match[1] ?? "", "meta");
  }
  return links;
}

/** The chain of one address: its final answer, or what went wrong. */
async function follow(address, fetcher) {
  const seen = new Set();
  let current = address;
  for (let hop = 0; hop <= REDIRECTS_AT_MOST; hop++) {
    if (seen.has(current)) {
      return { problem: `redirect loop at ${current}` };
    }
    seen.add(current);
    let response;
    try {
      response = await fetcher(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(GIVE_UP_AFTER_MS),
      });
    } catch (error) {
      const code = error?.cause?.code ?? error?.code ?? "";
      const dns = code === "ENOTFOUND" || code === "EAI_AGAIN";
      return { problem: `${dns ? "DNS error" : "no answer"} for ${current}: ${code || error}` };
    }
    const next = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && next) {
      await response.body?.cancel();
      current = new URL(next, current).href;
      continue;
    }
    return { response, final: current };
  }
  return { problem: `more than ${REDIRECTS_AT_MOST} redirects from ${address}` };
}

/** What a page's raw HTML gets wrong, whatever its links answer. */
function problemsInPage(html, page, appHost) {
  const problems = [];
  for (const [named] of html.matchAll(NOT_LIVE)) {
    problems.push(`${page} names ${named}`);
  }
  for (const link of linksIn(html, page)) {
    if (link.invalid) {
      problems.push(`${page} has an invalid address: ${link.url}`);
      continue;
    }
    const url = new URL(link.url);
    if (url.host !== appHost && APP_ONLY.test(url.pathname) && isOurs(url.host, appHost)) {
      problems.push(`${page} links to ${link.url}, which belongs on ${appHost}`);
    }
  }
  return problems;
}

const domainOf = (appHost) => appHost.slice(appHost.indexOf(".") + 1);
const isOurs = (host, appHost) => {
  const domain = domainOf(appHost);
  return host === domain || host.endsWith(`.${domain}`);
};

/** A page with no shared header or no design tokens is a placeholder that got out. */
function frameChecker(fetcher, problems) {
  const sheets = new Map();
  const hasTokens = (href) => {
    if (!sheets.has(href)) {
      sheets.set(
        href,
        fetcher(href)
          .then((answer) => answer.text())
          .then((css) => css.includes("--color-accent"))
          .catch(() => false),
      );
    }
    return sheets.get(href);
  };
  return async (html, page) => {
    if (!SITE_HEADER.test(html)) {
      problems.add(`${page} has no shared header`);
    }
    const hrefs = [...html.matchAll(STYLESHEET)].map((match) => new URL(match[1], page).href);
    const found = await Promise.all(hrefs.map(hasTokens));
    if (!found.includes(true)) {
      problems.add(`${page} loads no stylesheet with the design tokens`);
    }
  };
}

/**
 * Walks from the starts. Our pages are read and followed; anything else is asked once and not
 * followed, and only a DNS error, a 404 or a 5xx counts against another site.
 */
export async function crawl({ starts, appHost, fetcher = fetch, maxPages = 500, frame = false }) {
  const problems = new Set();
  const asked = new Map(starts.map((start) => [start, { from: "start", tag: "a" }]));
  const queue = [...starts];
  let pages = 0;

  const checkFrame = frameChecker(fetcher, problems);

  const enqueue = (html, page) => {
    for (const link of linksIn(html, page)) {
      if (link.invalid || asked.has(link.url)) {
        continue;
      }
      if (asked.size >= maxPages) {
        problems.add(`stopped at ${maxPages} addresses: raise the limit or find the loop`);
        return;
      }
      asked.set(link.url, { from: page, tag: link.tag });
      queue.push(link.url);
    }
  };

  async function visit(address) {
    const { from, tag } = asked.get(address);
    const { problem, response, final } = await follow(address, fetcher);
    if (problem) {
      problems.add(`${problem} (linked from ${from})`);
      return;
    }
    const { status } = response;
    // A form may post to a path with no GET; it exists if the answer says so.
    const missing = status === 404 || status >= 500;
    if (missing) {
      problems.add(`${status} at ${address} (linked from ${from})`);
    }
    const isPage = response.headers.get("content-type")?.includes("text/html") ?? false;
    if (missing || tag !== "a" || !isPage || !isOurs(new URL(final).host, appHost)) {
      await response.body?.cancel();
      return;
    }
    pages += 1;
    const html = await response.text().catch((error) => {
      problems.add(`${final} stopped answering: ${error}`);
      return "";
    });
    for (const found of problemsInPage(html, final, appHost)) {
      problems.add(found);
    }
    if (frame) {
      await checkFrame(html, final);
    }
    enqueue(html, final);
  }

  while (queue.length > 0) {
    await Promise.all(queue.splice(0, AT_ONCE).map(visit));
  }
  return { pages, addresses: asked.size, problems: [...problems].sort() };
}
