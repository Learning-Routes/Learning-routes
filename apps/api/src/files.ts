import { creationKey } from "@learning-routes/core/content/creations";

// The files behind an upload or a publish (Platform STEP 9 §2), written to R2 after the action's
// commit, never inside it. Every key carries the file's SHA-256, so writing one again writes the
// same bytes: a retry is always safe.

type Uploaded = { key: string; contentType?: string };
type Published = { spaceId: string; routeId: string; creations?: string[] };

/** Writes what the committed action stored. Throws when R2 refuses: the caller says so. */
export async function storeAfterCommit(
  env: { CREATIONS: R2Bucket },
  action: string,
  input: unknown,
  output: unknown,
) {
  if (action === "creation.upload") {
    const { key } = output as Uploaded;
    await env.CREATIONS.put(key, (input as { source: string }).source, {
      httpMetadata: { contentType: "text/html; charset=utf-8" },
    });
  }
  if (action === "asset.upload") {
    const { key, contentType } = output as Uploaded;
    await env.CREATIONS.put(key, (input as { file: Uint8Array }).file, {
      httpMetadata: { contentType: String(contentType) },
    });
  }
  if (action === "route.publish") {
    // A publish is not repeated for its files (the same draft is refused), so they get retries.
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await publishCreations(env.CREATIONS, output as Published);
      } catch (error) {
        if (attempt === 3) {
          throw error;
        }
      }
    }
  }
}

/** A published route's creations, copied from the draft's place to the public one. */
async function publishCreations(bucket: R2Bucket, { spaceId, routeId, creations = [] }: Published) {
  for (const hash of creations) {
    const published = creationKey("pub", spaceId, routeId, hash);
    if (await bucket.head(published)) {
      continue;
    }
    const draft = await bucket.get(creationKey("draft", spaceId, routeId, hash));
    if (draft === null) {
      throw new Error("a published creation's draft file is missing");
    }
    // At most 2 MB: read whole, since R2 takes a stream only of a known length.
    await bucket.put(published, await draft.arrayBuffer(), { httpMetadata: draft.httpMetadata });
  }
}

/** The same, for the app's actions: a failure is logged, since the commit already answered. */
export async function storeQuietly(
  env: { CREATIONS: R2Bucket },
  action: string,
  input: unknown,
  output: unknown,
) {
  await storeAfterCommit(env, action, input, output).catch((error: unknown) => {
    console.error(
      JSON.stringify({ message: "storing a file failed", action, error: String(error) }),
    );
  });
}
