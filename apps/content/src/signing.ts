// A draft's address is signed and short-lived (Platform STEP 9 §1): the draft preview gets one,
// and nobody else can. The API signs with the same secret; test/signing.test.ts holds a vector both
// sides must agree on.

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

/** Whether this path's signature is ours, and still in time. */
export async function isSigned(
  secret: string,
  path: string,
  expires: number,
  signature: string,
  nowS: number,
) {
  if (!Number.isInteger(expires) || expires < nowS || expires > nowS + LONGEST_S) {
    return false;
  }
  const expected = await signatureOf(secret, path, expires);
  // The same length, then every character: no early exit that says how much matched.
  if (expected.length !== signature.length) {
    return false;
  }
  let differs = 0;
  for (let at = 0; at < expected.length; at++) {
    differs |= expected.charCodeAt(at) ^ signature.charCodeAt(at);
  }
  return differs === 0;
}
