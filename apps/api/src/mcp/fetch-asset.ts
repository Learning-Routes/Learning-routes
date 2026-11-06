import { ASSET_MOST_BYTES } from "@learning-routes/core/content/creations";
import { readAtMost } from "./read-at-most";

// An asset taken from an address a model gave (Platform STEP 9 §2): a stranger's address, so
// https only, a few redirects each checked again, a short wait, and never more bytes than the
// largest asset. No cookie or credential goes with it. A Worker's fetch reaches only the public
// internet, which is what rules out private addresses here.

const WAIT_MS = 10_000;
const MOST_REDIRECTS = 3;
const MOST_BYTES = Math.max(...Object.values(ASSET_MOST_BYTES));

/** The bytes at the address, or why there are none: in words a model can pass on. */
export async function fetchAsset(
  address: string,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; why: string }> {
  let url = new URL(address);
  for (let hop = 0; hop <= MOST_REDIRECTS; hop += 1) {
    if (url.protocol !== "https:" || url.username || url.password) {
      return { ok: false, why: "source_url must be a plain https address" };
    }
    const response = await fetcher(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(WAIT_MS),
    }).catch(() => null);
    if (response === null) {
      return { ok: false, why: "source_url did not answer in time" };
    }
    const next = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && next) {
      await response.body?.cancel();
      url = new URL(next, url);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, why: `source_url answered ${response.status}` };
    }
    if (Number(response.headers.get("content-length")) > MOST_BYTES) {
      await response.body?.cancel();
      return { ok: false, why: "the file at source_url is larger than 25 MB" };
    }
    const bytes = await readAtMost(response, MOST_BYTES);
    return bytes === null
      ? { ok: false, why: "the file at source_url is larger than 25 MB" }
      : { ok: true, bytes };
  }
  return { ok: false, why: "source_url redirects too many times" };
}
