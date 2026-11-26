import { VOICE_FILE } from "@learning-routes/core/voice";

// A phrase's recording, from the bucket (see core's voice.ts). The address is the hash of what it
// says, so a file never changes: browsers and the edge keep it for a year. A phrase nobody
// recorded answers 404, briefly kept, and the player falls back to the browser's voice.

const YEAR = "public, max-age=31536000, immutable";
const MISSING = "public, max-age=300";

interface Bucket {
  get(key: string): Promise<{ body: ReadableStream; size: number } | null>;
}

/** The recording a request asks for, or null when the request is for something else. */
export async function voiceFile(request: Request, bucket: Bucket): Promise<Response | null> {
  const found = VOICE_FILE.exec(new URL(request.url).pathname);
  if (!found) {
    return null;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const file = await bucket.get(`${found[1]}.mp3`);
  if (file === null) {
    return new Response(null, { status: 404, headers: { "cache-control": MISSING } });
  }
  return new Response(request.method === "HEAD" ? null : file.body, {
    headers: {
      "content-type": "audio/mpeg",
      "content-length": String(file.size),
      "cache-control": YEAR,
    },
  });
}
