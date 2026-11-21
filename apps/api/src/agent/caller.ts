import { secretsEqual } from "../security/secrets-equal";

// The MCP's generate_image (Platform STEP 20 §B) asks the agent Worker over their service binding,
// for the person the MCP's OAuth token named. That person travels signed for a minute, with a key
// derived from the secret both Workers hold for this one use, never with the secret itself. The
// signature names the purpose, the person, the expiry and the request's body, so a signature seen
// once cannot carry a different request. The agent Worker has no public address, and the web
// Worker passes on none of this path, but neither is relied on: the request must also look like
// one made over the binding.

/** The address the MCP Worker gives its requests over the binding: no public host has it. */
export const CALLER_ORIGIN = "https://agent";
export const CALLER_IMAGES_PATH = "/internal/images";
export const CALLER_HEADER = "x-lr-caller";

const PURPOSE = "image.generate";
/** HKDF's info: this key signs callers to the agent Worker and nothing else. */
const KEY_LABEL = "learning-routes/agent-caller/v1";
/** How long a signed caller is good for. */
const LIFETIME_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

/** The HMAC key for callers, derived from the shared secret with HKDF-SHA-256. */
async function callerKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: encoder.encode(KEY_LABEL) },
    material,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
}

/** What is signed: the purpose, the person, the expiry and the body's SHA-256, one per line. */
export async function callerMessage(userId: string, expiresAt: number, body: string) {
  const bodyHash = hex(await crypto.subtle.digest("SHA-256", encoder.encode(body)));
  return [PURPOSE, userId, String(expiresAt), bodyHash].join("\n");
}

async function signature(secret: string, userId: string, expiresAt: number, body: string) {
  const message = await callerMessage(userId, expiresAt, body);
  return hex(await crypto.subtle.sign("HMAC", await callerKey(secret), encoder.encode(message)));
}

/** The header the MCP sends for this person and this exact body, good for a minute from now. */
export async function signedCaller(secret: string, userId: string, body: string, now = Date.now()) {
  const expiresAt = now + LIFETIME_MS;
  return `${userId}.${expiresAt}.${await signature(secret, userId, expiresAt, body)}`;
}

/** The person a signed header names for this body, or null: missing, expired, or not ours. */
export async function callerOf(
  header: string | null,
  secret: string,
  body: string,
  now = Date.now(),
) {
  const [userId = "", at = "", given = ""] = (header ?? "").split(".");
  const expiresAt = Number(at);
  const live =
    Number.isSafeInteger(expiresAt) && now <= expiresAt && expiresAt - now <= LIFETIME_MS;
  if (!(UUID.test(userId) && live)) {
    return null;
  }
  const expected = await signature(secret, userId, expiresAt, body);
  return (await secretsEqual(given, expected)) ? userId : null;
}

/**
 * Whether a request came over a service binding: only the MCP gives its requests this address. The
 * agent Worker has no route, custom domain, workers.dev or preview address (test/agent/caller.test.ts
 * holds its config to that), so a request from the Internet can only reach it through the web
 * Worker, which passes on the app's own host and never this path.
 */
export function overBinding(request: Request): boolean {
  return new URL(request.url).origin === CALLER_ORIGIN;
}
