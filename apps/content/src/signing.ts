// A draft's address is signed and short-lived (Platform STEP 9 §1): the draft preview gets one,
// and nobody else can. The API signs with the same secret; a vector both
// sides must agree on, in test/content.test.ts.

const ENCODER = new TextEncoder();
/** The longest a signed address may live, whatever it says. */
export const LONGEST_S = 3600;

async function keyOf(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    ENCODER.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

const base64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const message = (path: string, expires: number) => ENCODER.encode(`draft:${path}:${expires}`);

export async function signatureOf(secret: string, path: string, expires: number) {
  return base64url(await crypto.subtle.sign("HMAC", await keyOf(secret), message(path, expires)));
}

const fromBase64url = (text: string) => {
  try {
    const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
};

/** Too short a secret signs nothing: it is the one thing between a draft and everyone. */
const SHORTEST_SECRET = 32;

/** Whether this path's signature is ours, and still in time. The platform's own check compares. */
export async function isSigned(
  secret: string,
  path: string,
  expires: number,
  signature: string,
  nowS: number,
) {
  if (secret.length < SHORTEST_SECRET) {
    throw new Error("CONTENT_SIGNING_SECRET is too short to sign anything");
  }
  if (!Number.isInteger(expires) || expires < nowS || expires > nowS + LONGEST_S) {
    return false;
  }
  const bytes = fromBase64url(signature);
  return (
    bytes !== null &&
    crypto.subtle.verify("HMAC", await keyOf(secret), bytes, message(path, expires))
  );
}
