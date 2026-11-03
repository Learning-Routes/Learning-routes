// Purging the storefront's edge cache by tag (Platform STEP 4 §1.4). A committed change
// queues its tags; the queue's consumer calls Cloudflare's API, retrying when limited.
// Nothing here runs inside a transaction, and a purge that never lands costs only
// staleness: a page expires from the edge within five minutes anyway.

export interface PurgeMessage {
  tags: string[];
}

/** Cloudflare accepts at most 100 operations per purge request, on every plan. */
export const MAX_TAGS_PER_PURGE = 100;

// A page rendered right after the commit could still read Hyperdrive's cached rows
// (60 s, plus 15 s stale), and the purge would then keep that stale page. So wait them out.
const HYPERDRIVE_WINDOW_SECONDS = 75;
const RETRY_SECONDS = 60;

export async function queuePurge(env: Env, tags: string[]): Promise<void> {
  if (tags.length === 0) {
    return;
  }
  try {
    await env.PURGE_QUEUE.send({ tags }, { delaySeconds: HYPERDRIVE_WINDOW_SECONDS });
  } catch (error) {
    console.error(JSON.stringify({ message: "purge not queued", tags, error: String(error) }));
  }
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

async function purged(env: Env, tags: string[], fetcher: Fetcher): Promise<boolean> {
  const response = await fetcher(
    `https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/purge_cache`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.CLOUDFLARE_PURGE_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ tags }),
    },
  );
  const body = (await response.json().catch(() => null)) as { success?: boolean } | null;
  return response.ok && body?.success === true;
}

export async function purgeBatch(
  batch: MessageBatch<PurgeMessage>,
  env: Env,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const tags = [...new Set(batch.messages.flatMap((message) => message.body.tags))];
  if (String(env.ENVIRONMENT) === "development") {
    console.log(JSON.stringify({ message: "purge skipped in a local run", tags }));
    batch.ackAll();
    return;
  }
  try {
    for (let start = 0; start < tags.length; start += MAX_TAGS_PER_PURGE) {
      if (!(await purged(env, tags.slice(start, start + MAX_TAGS_PER_PURGE), fetcher))) {
        throw new Error("the purge was refused");
      }
    }
    batch.ackAll();
  } catch (error) {
    console.error(JSON.stringify({ message: "purge failed", tags, error: String(error) }));
    batch.retryAll({ delaySeconds: RETRY_SECONDS });
  }
}
