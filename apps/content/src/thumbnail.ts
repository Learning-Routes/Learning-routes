import { signatureOf } from "./signing";

// A creation's thumbnail (Platform STEP 9 §4): one picture of how it opens, taken once by Browser Run
// from the draft's own signed address, so it runs under the same policy as for a student, and kept
// in R2 beside it. The caller has already checked the thumbnail's own signature, which only the API
// makes: nobody else can make Browser Run work, and a draft's picture leaves only with its address.

/** The picture's size: small enough for a card, and the shape most creations have. */
const VIEWPORT = { width: 800, height: 600 };
/** A moment for the creation to draw itself after it loads. */
const SETTLE_MS = 800;
const SIGNED_FOR_S = 120;
/** A screenshot that failed is not tried again for this long. */
const RETRY_AFTER_MS = 3_600_000;
/** All the page may load: itself, and the libraries and fonts its policy allows. */
const HOSTS = [
  "cdnjs\\.cloudflare\\.com",
  "cdn\\.jsdelivr\\.net",
  "unpkg\\.com",
  "fonts\\.googleapis\\.com",
  "fonts\\.gstatic\\.com",
];

const escaped = (host: string) => host.replaceAll(".", "\\.");

/** Browser Run's picture of the draft, or null when it could not take one. */
async function shoot(env: Env, origin: string, path: string) {
  const expires = Math.floor(Date.now() / 1000) + SIGNED_FOR_S;
  const signature = await signatureOf(env.CONTENT_SIGNING_SECRET, path, expires);
  const own = escaped(new URL(origin).host);
  try {
    const shot = await env.BROWSER.quickAction("screenshot", {
      url: `${origin}${path}?e=${expires}&s=${signature}`,
      viewport: VIEWPORT,
      gotoOptions: { waitUntil: "load", timeout: 15_000 },
      waitForTimeout: SETTLE_MS,
      // A creation that sends the page elsewhere gets nothing there.
      allowRequestPattern: [`^https://(${[own, ...HOSTS].join("|")})/`, "^data:", "^blob:"],
      screenshotOptions: { type: "webp", quality: 70 },
    });
    if (shot.ok) {
      return await shot.arrayBuffer();
    }
    console.error(`thumbnail ${path}: Browser Run answered ${shot.status}`);
  } catch (error) {
    console.error(`thumbnail ${path}: ${String(error)}`);
  }
  return null;
}

export async function thumbnail(
  env: Env,
  origin: string,
  space: string,
  route: string,
  hash: string,
) {
  const key = `thumb/${space}/${route}/${hash}.webp`;
  const kept = await env.CREATIONS.get(key);
  if (kept !== null) {
    return kept.body;
  }
  const failed = await env.CREATIONS.head(`${key}.failed`);
  if (failed !== null && Date.now() - failed.uploaded.getTime() < RETRY_AFTER_MS) {
    return null;
  }
  if ((await env.CREATIONS.head(`draft/${space}/${route}/${hash}.html`)) === null) {
    return null;
  }
  const bytes = await shoot(env, origin, `/d/${space}/${route}/${hash}.html`);
  if (bytes === null) {
    await env.CREATIONS.put(`${key}.failed`, "");
    return null;
  }
  await env.CREATIONS.put(key, bytes, { httpMetadata: { contentType: "image/webp" } });
  return bytes;
}

/** A thumbnail, served like an asset: nothing in it runs, and only who has the address sees it. */
export function picture(request: Request, body: ReadableStream | ArrayBuffer) {
  return new Response(request.method === "HEAD" ? null : body, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
