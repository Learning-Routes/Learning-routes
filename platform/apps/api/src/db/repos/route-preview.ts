import { sql } from "drizzle-orm";
import type { Db } from "./shared";

/** What /empezar says about a route before anyone has signed in: the public view, as nobody. */
export async function routePreview(db: Db, routeId: string) {
  const { rows } = await db.execute<{
    title: unknown;
    creator: unknown;
    access: string;
    source_locale: string;
  }>(
    sql`select title, space_name as creator, access, source_locale
          from public_routes where route_id = ${routeId}`,
  );
  const [route] = rows;
  return route === undefined
    ? null
    : {
        title: route.title,
        creator: route.creator,
        sourceLocale: route.source_locale,
        isOpen: route.access === "open",
      };
}
