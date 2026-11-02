// The per-address sign-in limit's key (Platform STEP 2 review, owner's answer 4): an
// HMAC of the lower-cased address with the auth secret, so the rate-limit table
// holds no address in plain text. user.erase computes the same key to remove it.

const BASE64_PADDING = /=+$/;

export async function emailRateKey(secret: string, email: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(email.toLowerCase())),
  );
  const base64 = btoa(String.fromCharCode(...mac));
  const url = base64.replaceAll("+", "-").replaceAll("/", "_").replace(BASE64_PADDING, "");
  return `magic-link-email:${url}`;
}
