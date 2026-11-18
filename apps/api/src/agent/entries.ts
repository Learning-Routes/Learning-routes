import { negotiateLocale } from "@learning-routes/core/locales";
import { IMAGES_PATH, TUTOR_PATH } from "@learning-routes/core/studio/entries";
import { withClient } from "../db/with-db";
import { readSessions } from "./auth";
import { CALLER_HEADER, CALLER_IMAGES_PATH, callerOf } from "./caller";
import type { Asked } from "./entry-ctx";
import type { AgentEnv } from "./env";
import { makeImage } from "./images";
import { askTutor } from "./tutor";

// The agent Worker's two HTTP entry points (Platform STEP 20): the learner's tutor and route images.
// Each is checked as the API checks its own routes before anything is read: the app's host, the
// app's Origin on the POST (as security/app-origin.ts), then the session, read by the same Better
// Auth options, secret and cookie as the API's (agent/auth.ts), with no cookie cache.

const status = (code: number, headers?: HeadersInit) =>
  new Response(null, { status: code, ...(headers ? { headers } : {}) });

/** The answer to a request for one of the entry points, or null when it is for neither. */
export function entryFor(
  request: Request,
  env: AgentEnv,
  ctx: ExecutionContext,
  fetcher: typeof fetch = fetch,
): Promise<Response> | null {
  const url = new URL(request.url);
  if (url.pathname !== TUTOR_PATH && url.pathname !== IMAGES_PATH) {
    return null;
  }
  const app = new URL(env.APP_ORIGIN);
  if (url.host !== app.host) {
    return Promise.resolve(status(404));
  }
  if (request.method !== "POST") {
    return Promise.resolve(status(405, { allow: "POST" }));
  }
  // A page elsewhere cannot spend the person's questions or images with their cookie.
  if (request.headers.get("origin") !== app.origin) {
    return Promise.resolve(status(403));
  }
  const handle = url.pathname === TUTOR_PATH ? askTutor : makeImage;
  return answered(request, env, ctx, fetcher, handle);
}

/** The MCP's generate_image, for the person its signed header names (caller.ts); null elsewhere. */
export function fromMcp(
  request: Request,
  env: AgentEnv,
  ctx: ExecutionContext,
  fetcher: typeof fetch = fetch,
): Promise<Response> | null {
  if (new URL(request.url).pathname !== CALLER_IMAGES_PATH) {
    return null;
  }
  if (request.method !== "POST") {
    return Promise.resolve(status(405, { allow: "POST" }));
  }
  return (async () => {
    const userId = await callerOf(request.headers.get(CALLER_HEADER), env.BETTER_AUTH_SECRET);
    if (userId === null) {
      return status(401);
    }
    const body = await bodyOf(request);
    const locale = negotiateLocale(request.headers.get("accept-language"));
    return withClient(env, ctx, (db) =>
      makeImage(
        { request, env, ctx, db, person: { id: userId, name: "" }, locale, body, fetcher },
        "mcp",
      ),
    );
  })();
}

async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  const parsed: unknown = await request.json().catch(() => null);
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

async function answered(
  request: Request,
  env: AgentEnv,
  ctx: ExecutionContext,
  fetcher: typeof fetch,
  handle: (asked: Asked) => Promise<Response>,
): Promise<Response> {
  const body = await bodyOf(request);
  return withClient(env, ctx, async (db) => {
    const session = await readSessions(env, db).api.getSession({ headers: request.headers });
    if (session === null) {
      return Response.json({ ok: false, code: "unauthenticated" }, { status: 401 });
    }
    const person = { id: session.user.id, name: session.user.name };
    const locale = negotiateLocale(request.headers.get("accept-language"));
    return handle({ request, env, ctx, db, person, locale, body, fetcher });
  });
}
