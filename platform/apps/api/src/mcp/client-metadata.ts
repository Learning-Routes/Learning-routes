import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";
import { readAtMost } from "./read-at-most";

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
      redirect: "error",
      signal: AbortSignal.timeout(WAIT_MS),
    });
    const body = await readAtMost(response, MOST_BYTES);
    if (body === null) {
      throw new TypeError("a client's metadata document is too large");
    }
    return new Response(body, { status: response.status, headers: response.headers });
  };
}
