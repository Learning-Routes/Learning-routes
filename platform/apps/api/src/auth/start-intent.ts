import { secretsEqual } from "../security/secrets-equal";

// "Empezar" before signing in (Platform STEP 4 §6.1). The route waits in a signed cookie
// for an hour, on this browser only: the email's link never carries it, and whoever opens
// a forwarded link joins nothing. __Host- pins it to the app's origin.

const START_COOKIE = "__Host-lr_start";
export const DEAD_START_COOKIE = `${START_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
const AN_HOUR_S = 3600;

async function signatureOf(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`start-intent:${payload}`));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function startIntentCookie(
  secret: string,
  routeId: string,
  now: number,
): Promise<string> {
  const payload = `${routeId}.${now + AN_HOUR_S * 1000}`;
  const value = `${payload}.${await signatureOf(secret, payload)}`;
  return `${START_COOKIE}=${value}; Max-Age=${AN_HOUR_S}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

/** The route in a Cookie header's start cookie, or null unless it is ours and in time. */
export async function readStartIntent(
  secret: string,
  cookieHeader: string | null | undefined,
  now: number,
): Promise<string | null> {
  const entry = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${START_COOKIE}=`));
  const [routeId, expires, signature] = entry?.slice(START_COOKIE.length + 1).split(".") ?? [];
  if (routeId === undefined || expires === undefined || signature === undefined) {
    return null;
  }
  const isOurs = await secretsEqual(signature, await signatureOf(secret, `${routeId}.${expires}`));
  return isOurs && Number(expires) > now ? routeId : null;
}
