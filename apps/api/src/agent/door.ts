import { STUDIO_PATH } from "@learning-routes/core/studio/session";

// What the assistant's Worker checks before it reads a session (Platform STEP 10 §1): only a
// WebSocket from the app's own pages, to the assistant's path, for a space named by its id.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const answer = (status: number, body: string | null = null) => new Response(body, { status });

/** The space asked for, or the answer to give instead. */
export function doorFor(request: Request, appOrigin: string): { spaceId: string } | Response {
  const url = new URL(request.url);
  if (url.pathname === "/health") {
    return answer(200, "ok");
  }
  if (url.pathname !== STUDIO_PATH) {
    return answer(404);
  }
  if (request.headers.get("upgrade") !== "websocket") {
    return answer(426);
  }
  // A page elsewhere cannot open the assistant with the creator's cookie.
  if (request.headers.get("origin") !== appOrigin) {
    return answer(403);
  }
  const spaceId = url.searchParams.get("space") ?? "";
  return UUID.test(spaceId) ? { spaceId } : answer(404);
}
