import { secretsEqual } from "../security/secrets-equal";

// The MCP's generate_image (Platform STEP 20 §B) asks the agent Worker over their service binding,
// for the person the MCP's OAuth token named. That person travels signed with the secret both
// Workers already hold, for a minute: the agent Worker is reachable only through service bindings,
// and the web Worker passes on none of this path, but the signature does not rely on either.

export const CALLER_IMAGES_PATH = "/internal/images";
export const CALLER_HEADER = "x-lr-caller";

/** How long a signed caller is good for. */
const FRESH_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function signature(secret: string, userId: string, at: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`image-caller:${userId}:${at}`),
  );
  return [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The header the MCP sends for this person, now. */
export async function signedCaller(secret: string, userId: string, at = Date.now()) {
  return `${userId}.${at}.${await signature(secret, userId, at)}`;
}

/** The person a signed header names, or null when it is missing, stale or not signed by us. */
export async function callerOf(header: string | null, secret: string, now = Date.now()) {
  const [userId = "", at = "", given = ""] = (header ?? "").split(".");
  const issued = Number(at);
  if (!(UUID.test(userId) && Number.isSafeInteger(issued) && Math.abs(now - issued) <= FRESH_MS)) {
    return null;
  }
  return (await secretsEqual(given, await signature(secret, userId, issued))) ? userId : null;
}
