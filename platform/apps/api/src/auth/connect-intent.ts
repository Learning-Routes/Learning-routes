import { AUTH_PATH } from "./shared";

// An assistant asking to connect before its person has signed in (Platform STEP 5 §2). The
// request waits on this browser in a cookie the sign-in page sets; Better Auth signed it, and
// checks that again when it comes back, so all this does is send them to the same place.

const CONNECT_COOKIE = "__Host-lr_connect";
export const DEAD_CONNECT_COOKIE = `${CONNECT_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;

/** Where to go after signing in, or null when this browser is not connecting anything. */
export function readConnectIntent(cookieHeader: string | null | undefined): string | null {
  const entry = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CONNECT_COOKIE}=`));
  const query = entry?.slice(CONNECT_COOKIE.length + 1);
  return query ? `${AUTH_PATH}/oauth2/authorize?${decodeURIComponent(query)}` : null;
}
