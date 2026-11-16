import type { RouterContextProvider } from "react-router";
import { pageContext } from "./context";

// How an app page's loader or action reaches the API (Platform STEP 4 §6): through the
// service binding, with the visitor's cookie. It sends the app's own Origin, which the API
// requires of a write, so a caller answering a POST checks the browser's first.

export interface ApiAnswer<T> {
  status: number;
  body: T | null;
  /** A renewed or dead session cookie, to pass on. */
  cookies: string[];
}

type Context = Readonly<RouterContextProvider>;

export async function askApi<T>(
  context: Context,
  request: Request,
  path: string,
  body?: unknown,
): Promise<ApiAnswer<T>> {
  const { appOrigin, runtime, timing } = context.get(pageContext);
  const headers = new Headers({ origin: appOrigin });
  const cookie = request.headers.get("cookie");
  if (cookie) {
    headers.set("cookie", cookie);
  }
  for (const name of ["cf-connecting-ip", "accept-language"]) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  if (body !== undefined) {
    headers.set("content-type", "application/json");
  }
  // Named by the action, or by the path's last part: "api-lesson.play", "api-get-session".
  const phase = `api-${path.startsWith("/api/a/") ? path.slice("/api/a/".length) : path.split("/").at(-1)}`;
  const response = await timing.measure(phase, () =>
    runtime.api(
      new Request(`${appOrigin}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers,
        redirect: "manual",
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    ),
  );
  timing.addFrom(phase, response.headers.get("server-timing"));
  const parsed = (await response.json().catch(() => null)) as T | null;
  return { status: response.status, body: parsed, cookies: response.headers.getSetCookie() };
}

interface ActionAnswer<O> {
  ok: boolean;
  output?: O;
  code?: string;
}

export function runApiAction<O>(context: Context, request: Request, name: string, input: unknown) {
  return askApi<ActionAnswer<O>>(context, request, `/api/a/${name}`, input);
}

/**
 * A creator's page is the same site as the app, so SameSite=Lax alone would let a form
 * there post here: a write must come from the app's own origin (Platform STEP 2 §5.5).
 */
export function isFromTheApp(request: Request, context: Context): boolean {
  return request.headers.get("origin") === context.get(pageContext).appOrigin;
}

/**
 * Whether this GET was opened from the platform's own sites, not from anyone else's. In
 * production a creator's host is the same site as the app; on localhost it is not, so
 * their host is also recognised by the Referer, which a page cannot forge.
 */
export function isOurOwnNavigation(request: Request, context: Context): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site === null || site === "same-origin" || site === "same-site" || site === "none") {
    return true;
  }
  const referer = URL.parse(request.headers.get("referer") ?? "")?.host ?? "";
  return referer.endsWith(`.${context.get(pageContext).creatorDomain}`);
}

export function cookieHeaders(cookies: string[]): Headers {
  const headers = new Headers();
  for (const cookie of cookies) {
    headers.append("Set-Cookie", cookie);
  }
  return headers;
}

/** Whether the signed-in person builds anywhere (Platform STEP 14): what the gate screens read. */
export type CreatorAccess = "creator" | "none";

/** From a space.list answer the page already has, so it costs no second call. */
export const creatorAccessOf = (spaces: readonly { role: string }[] | null | undefined) =>
  // Core's isCreatorRole, which browser-side code may not import.
  (spaces?.some((space) => space.role === "owner" || space.role === "coeditor")
    ? "creator"
    : "none") satisfies CreatorAccess;

/** For a page that has no space.list of its own; signed out, it does not ask. */
export async function askCreatorAccess(context: Context, request: Request): Promise<CreatorAccess> {
  if (!request.headers.get("cookie")) {
    return "none";
  }
  const owned = await runApiAction<{ role: string }[]>(context, request, "space.list", {});
  return creatorAccessOf(owned.body?.output);
}
