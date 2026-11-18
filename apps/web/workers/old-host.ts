import type { ApiFetch } from "./api-client";

// One address (Platform STEP 19): the app moved from app.learningroutes.com to
// learningroutes.com. Every request to the old host answers 308 to the same path on the new
// one. A page opened by someone signed in there goes through one silent hand-off first, so
// nobody signs in again: the API gives a code for their session (apps/api/src/auth/handoff.ts),
// and the new host turns it back into the same session cookie.

const SESSION = /(?:^|;\s*)__Host-lr_session=/;
const HANDOFF_PATH = "/api/handoff";
const FORWARDED = ["cookie", "user-agent", "cf-connecting-ip"] as const;
/** The old host's cookie goes, so the hand-off happens once. */
const FORGET = "__Host-lr_session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax";

interface Origins {
  appOrigin: string;
  oldAppOrigin?: string;
}

/** A browser opening a page, as opposed to a script's fetch or a form's POST. */
const isPageOpen = (request: Request) =>
  request.method === "GET" && (request.headers.get("sec-fetch-mode") ?? "navigate") === "navigate";

async function handoffCode(request: Request, appOrigin: string, api: ApiFetch) {
  const headers = new Headers({ origin: appOrigin });
  for (const name of FORWARDED) {
    const value = request.headers.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }
  const answer = await api(
    new Request(`${appOrigin}${HANDOFF_PATH}`, { method: "POST", headers }),
  ).catch(() => null);
  if (!answer?.ok) {
    return null;
  }
  const { code } = (await answer.json()) as { code?: unknown };
  return typeof code === "string" ? code : null;
}

/** The answer for a request to the old app host, or null for any other host. */
export async function fromOldHost(
  request: Request,
  { appOrigin, oldAppOrigin }: Origins,
  api: ApiFetch,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!oldAppOrigin || url.host !== new URL(oldAppOrigin).host) {
    return null;
  }
  const path = `${url.pathname}${url.search}`;
  const moved = new URL(path, appOrigin);
  const code =
    isPageOpen(request) && SESSION.test(request.headers.get("cookie") ?? "")
      ? await handoffCode(request, appOrigin, api)
      : null;
  if (code === null) {
    return new Response(null, { status: 308, headers: { location: moved.toString() } });
  }
  const handoff = new URL(HANDOFF_PATH, appOrigin);
  handoff.searchParams.set("code", code);
  handoff.searchParams.set("next", path);
  return new Response(null, {
    status: 308,
    headers: {
      location: handoff.toString(),
      "set-cookie": FORGET,
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}
