import { VOICE_FILE } from "@learning-routes/core/voice";

// What lessons and routes show and say, from the bucket.
// A phrase's recording (see core's voice.ts) is addressed by the hash of what it says, so a file
// never changes: browsers and the edge keep it for a year. A phrase nobody recorded answers 404,
// briefly kept, and the player falls back to the browser's voice.
// A lesson's picture is addressed by the hash of its bytes: like a recording, it never changes.
// A route's cover is addressed by the route's id and can be replaced, so it is kept an hour. A
// route with no cover answers one clear pixel, so the page keeps the cover it draws and no
// browser logs a missing file for every route that has no picture yet.
// A lesson's video and its captions are addressed by the hash of the video's bytes. A video
// answers a part of itself when asked for one: Safari plays nothing it cannot ask for in parts.

const YEAR = "public, max-age=31536000, immutable";
const HOUR = "public, max-age=3600, stale-while-revalidate=86400";
const MISSING = "public, max-age=300";
const PICTURE_FILE = /^\/imagen\/([a-f0-9]{64})\.webp$/;
const VIDEO_FILE = /^\/video\/([a-f0-9]{64})\.(mp4|vtt)$/;
const COVER_FILE =
  /^\/portada\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.webp$/;

/** One transparent pixel, as WebP. */
const CLEAR_PIXEL = Uint8Array.from(
  atob("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=="),
  (letter) => letter.charCodeAt(0),
);

/** The part of a file the bucket gave: from an offset, or its last bytes. */
interface Part {
  offset?: number;
  length?: number;
  suffix?: number;
}

interface Bucket {
  get(
    key: string,
    options?: { range: Headers },
  ): Promise<{ body: ReadableStream; size: number; range?: Part } | null>;
}

interface Kept {
  key: string;
  type: string;
  cache: string;
  /** Whether a part of it can be asked for. */
  inParts?: boolean;
}

function keptAt(pathname: string): Kept | null {
  const voice = VOICE_FILE.exec(pathname);
  if (voice) {
    return { key: `${voice[1]}.mp3`, type: "audio/mpeg", cache: YEAR };
  }
  const picture = PICTURE_FILE.exec(pathname);
  if (picture) {
    return { key: `img/${picture[1]}.webp`, type: "image/webp", cache: YEAR };
  }
  const video = VIDEO_FILE.exec(pathname);
  if (video) {
    const isCaptions = video[2] === "vtt";
    return {
      key: `video/${video[1]}.${video[2]}`,
      type: isCaptions ? "text/vtt; charset=utf-8" : "video/mp4",
      cache: YEAR,
      inParts: !isCaptions,
    };
  }
  const cover = COVER_FILE.exec(pathname);
  return cover ? { key: `cover/${cover[1]}.webp`, type: "image/webp", cache: HOUR } : null;
}

/** The file a request asks for, or null when the request is for something else. */
export async function voiceFile(request: Request, bucket: Bucket): Promise<Response | null> {
  const kept = keptAt(new URL(request.url).pathname);
  if (!kept) {
    return null;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const asksPart = kept.inParts === true && request.headers.has("range");
  const file = await bucket.get(kept.key, asksPart ? { range: request.headers } : undefined);
  if (file === null && kept.cache === HOUR) {
    return new Response(CLEAR_PIXEL, {
      headers: { "content-type": kept.type, "cache-control": MISSING },
    });
  }
  if (file === null) {
    return new Response(null, { status: 404, headers: { "cache-control": MISSING } });
  }
  return found(request, kept, file, asksPart);
}

/** The answer for a file that is there: whole, or the part the bucket gave. */
function found(
  request: Request,
  kept: Kept,
  file: { body: ReadableStream; size: number; range?: Part },
  asksPart: boolean,
): Response {
  const suffix = file.range?.suffix;
  const offset = suffix === undefined ? (file.range?.offset ?? 0) : file.size - suffix;
  const length = file.range?.length ?? file.size - offset;
  const isPart = asksPart && length < file.size;
  const headers = new Headers({
    "content-type": kept.type,
    "content-length": String(length),
    "cache-control": kept.cache,
  });
  if (kept.inParts) {
    headers.set("accept-ranges", "bytes");
  }
  if (isPart) {
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${file.size}`);
  }
  return new Response(request.method === "HEAD" ? null : file.body, {
    status: isPart ? 206 : 200,
    headers,
  });
}
