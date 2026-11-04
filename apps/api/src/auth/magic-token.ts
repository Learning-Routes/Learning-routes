const PADDING = /=+$/;

/** How Better Auth stores a token when storeToken is "hashed". */
export async function identifierOf(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(PADDING, "");
}

const INTENT_PREFIX = "magic-link-intent:";

/**
 * Where a sign-in link's token returns to (Platform STEP 7 §3). It is kept on the server, under
 * the token's hash, so the link works on whichever device opens it. The link itself still carries
 * only the token.
 */
export const intentIdentifier = async (token: string) =>
  `${INTENT_PREFIX}${await identifierOf(token)}`;
