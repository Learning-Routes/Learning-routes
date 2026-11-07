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
export async function withFrames(
  env: Pick<Env, "CONTENT_ORIGIN" | "CONTENT_SIGNING_SECRET">,
  name: string,
  output: unknown,
  nowS = Math.floor(Date.now() / 1000),
) {
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
