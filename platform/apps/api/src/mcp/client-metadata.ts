import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";

// How a client's metadata document is fetched (CIMD; Platform STEP 5 §2). The address comes
// from a stranger, so: https only, no redirects, a short wait and a small body. A Worker's
// fetch reaches only the public internet, which is what rules out private addresses here.

const WAIT_MS = 5000;
const MOST_BYTES = 10_000;

export function boundedMetadataFetch(fetcher: typeof fetch = fetch): ClientMetadataResourceFetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.protocol !== "https:") {
      throw new TypeError("a client's metadata document is served over https");
    }
    const response = await fetcher(url, {
      ...init,
      // Workers has no redirect: "error"; it throws on every fetch. Refused by hand instead.
      redirect: "manual",
      signal: AbortSignal.timeout(WAIT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      throw new TypeError("a client's metadata document is served without a redirect");
    }
    const body = await readAtMost(response, MOST_BYTES);
    return new Response(body, { status: response.status, headers: response.headers });
  };
}

async function readAtMost(response: Response, most: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body?.getReader();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.length;
    if (total > most) {
      await reader.cancel();
      throw new TypeError("a client's metadata document is too large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    body.set(chunk, at);
    at += chunk.length;
  }
  return body;
}
