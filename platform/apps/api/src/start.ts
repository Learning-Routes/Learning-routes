import { sql } from "drizzle-orm";
import type { Hono } from "hono";
import * as z from "zod";
import { startIntentCookie } from "./auth/start-intent";
import { withDb } from "./db/with-db";

// What /empezar needs before anyone has signed in (Platform STEP 4 §6.1): which route a
// person is joining, read as nobody from the public view, and a cookie that remembers it
// through the sign-in link.

const RouteId = z.uuid();

export function startRoutes(app: Hono<{ Bindings: Env }>) {
  app.get("/api/start/preview", async (c) => {
    c.header("Cache-Control", "no-store");
    const routeId = RouteId.safeParse(c.req.query("ruta"));
    if (!routeId.success) {
      return c.json({ code: "not_found" }, 404);
    }
    const rows = await withDb(c.env, c.executionCtx, null, (tx) =>
      tx.execute<{ title: unknown; creator: unknown; access: string; source_locale: string }>(
        sql`select title, space_name as creator, access, source_locale
              from public_routes where route_id = ${routeId.data}`,
      ),
    );
    const [route] = rows.rows;
    return route === undefined
      ? c.json({ code: "not_found" }, 404)
      : c.json({
          title: route.title,
          creator: route.creator,
          sourceLocale: route.source_locale,
          isOpen: route.access === "open",
        });
  });

  app.post("/api/start/intent", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { routeId?: unknown } | null;
    const routeId = RouteId.safeParse(body?.routeId);
    if (!routeId.success) {
      return c.json({ code: "invalid_input" }, 400);
    }
    c.header(
      "Set-Cookie",
      await startIntentCookie(c.env.BETTER_AUTH_SECRET, routeId.data, Date.now()),
    );
    return c.body(null, 204);
  });
}
