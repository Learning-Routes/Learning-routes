import { pgTenancy } from "../db/tenancy";
import { type Database, transactionAs } from "../db/with-db";
import { storeAfterCommit } from "../files";
import { fetchAsset } from "./fetch-asset";
import { failed, type Tool } from "./tool";

// The steps around an upload's action (Platform STEP 9 §2): what is fetched before it, and what is
// written to R2 after its commit. Neither ever runs inside the transaction.

/**
 * An asset from an address is taken before the transaction: no outside call runs inside one.
 * Only for an editor of the space: nobody else makes the server fetch anything.
 */
export async function withAsset(db: Database, userId: string, input: unknown) {
  const { source_url: address, space_id: spaceId } = input as {
    source_url?: string;
    space_id?: string;
  };
  if (!address) {
    return { input };
  }
  const scope = await transactionAs(db, userId, (tx) =>
    pgTenancy(tx).scopeOf({ kind: "space", id: String(spaceId) }, userId),
  );
  if (!(scope?.role === "owner" || scope?.role === "coeditor")) {
    return { refusal: failed("not_found: there is no such thing in your spaces.") };
  }
  const taken = await fetchAsset(address);
  return taken.ok
    ? { input: { ...(input as object), fetched: taken.bytes } }
    : { refusal: failed(`Nothing was stored: ${taken.why}.`) };
}

/** The committed action's files, in R2; a refusal to give when they did not save. */
export async function filesStored(
  env: Env,
  tool: Tool,
  action: string,
  input: unknown,
  output: unknown,
) {
  try {
    await storeAfterCommit(env, action, input, output);
    return null;
  } catch (error) {
    console.error(
      JSON.stringify({ message: "storing a file failed", tool: tool.name, error: String(error) }),
    );
    return failed(
      action === "route.publish"
        ? "The route was published, but one of its interactive creations could not be put online, so it will not open for students yet. Tell the person, and upload that creation again before the next publish."
        : "Nothing is lost, but the file did not save. Send the same file again: nothing will be doubled.",
    );
  }
}
