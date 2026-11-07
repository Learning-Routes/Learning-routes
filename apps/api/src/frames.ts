// A lesson's interactive blocks, as addresses on the content host (Platform STEP 9 §3). A published
// creation's is public; a draft's is signed and short-lived, the same way the content host checks it
// (apps/content/src/signing.ts, and the vector both tests share).

const ENCODER = new TextEncoder();
/** Long enough to read a draft through; the content host refuses anything past an hour. */
const DRAFT_LIVES_S = 1800;
/** Only a creation's own path, as the content host reads it: nothing else gets signed. */
const FRAME = /^\/(p|d)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f]{64}\.html$/;

export async function signatureOf(secret: string, path: string, expires: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    ENCODER.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign("HMAC", key, ENCODER.encode(`draft:${path}:${expires}`));
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

type Frames = { blocks: { frame?: string }[] } | null | undefined;

/** The views of lesson.read and route.preview, with each frame a whole address. */
type Signer = Pick<Env, "CONTENT_ORIGIN" | "CONTENT_SIGNING_SECRET">;
const HALF_HOUR_S = 1800;
const HASH = /^[0-9a-f]{64}$/;

/**
 * A creation's thumbnail, at its signed address (Platform STEP 9 §4). The expiry is rounded to the
 * half hour, so a card's address stays the same, and cached, for that long: always under the hour
 * the content host allows.
 */
export async function thumbnailAddress(
  env: Signer,
  where: { spaceId: string; routeId: string; hash: string },
  nowS = Math.floor(Date.now() / 1000),
) {
  const path = `/t/${where.spaceId}/${where.routeId}/${where.hash}.webp`;
  const expires = (Math.floor(nowS / HALF_HOUR_S) + 2) * HALF_HOUR_S;
  const signature = await signatureOf(env.CONTENT_SIGNING_SECRET, path, expires);
  return `${env.CONTENT_ORIGIN}${path}?e=${expires}&s=${signature}`;
}

type Draft = {
  spaceId: string;
  route: { id: string };
  blocks: { id: string; kind: string; data: Record<string, unknown> }[];
  thumbnails?: Record<string, string>;
};

/** route.get, for the app: each interactive block's thumbnail, by block id. */
async function withThumbnails(env: Signer, draft: Draft, nowS: number) {
  draft.thumbnails = {};
  for (const block of draft.blocks) {
    const hash = String(block.data.creation);
    if (block.kind === "interactive" && HASH.test(hash)) {
      const where = { spaceId: draft.spaceId, routeId: draft.route.id, hash };
      draft.thumbnails[block.id] = await thumbnailAddress(env, where, nowS);
    }
  }
}

export async function withFrames(
  env: Signer,
  name: string,
  output: unknown,
  nowS = Math.floor(Date.now() / 1000),
) {
  if (name === "route.get") {
    await withThumbnails(env, output as Draft, nowS);
    return output;
  }
  const view = (
    name === "lesson.read"
      ? output
      : name === "route.preview"
        ? (output as { view: Frames }).view
        : null
  ) as Frames;
  for (const block of view?.blocks ?? []) {
    if (block.frame !== undefined && !FRAME.test(block.frame)) {
      block.frame = undefined;
    } else if (block.frame?.startsWith("/d/")) {
      const expires = nowS + DRAFT_LIVES_S;
      const signature = await signatureOf(env.CONTENT_SIGNING_SECRET, block.frame, expires);
      block.frame = `${env.CONTENT_ORIGIN}${block.frame}?e=${expires}&s=${signature}`;
    } else if (block.frame) {
      block.frame = `${env.CONTENT_ORIGIN}${block.frame}`;
    }
  }
  return output;
}
