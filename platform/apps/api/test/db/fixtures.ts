import type pg from "pg";

// Rows the database tests build on, inside the caller's transaction.

export async function newSpace(db: pg.Client, slug: string): Promise<string> {
  const { rows } = await db.query(
    `insert into spaces (slug, name, default_locale, locales)
     values ($1, '{"en": "A space"}', 'en', '{en}') returning id`,
    [slug],
  );
  return rows[0]?.id;
}

export async function newRoute(
  db: pg.Client,
  spaceId: string,
  slug = "first-route",
): Promise<string> {
  const { rows } = await db.query(
    `insert into routes (space_id, slug, title, source_locale, access, pricing)
     values ($1, $2, '{"en": "A route"}', 'en', 'open', 'free') returning id`,
    [spaceId, slug],
  );
  return rows[0]?.id;
}

const HASH = "0".repeat(64);

export async function newVersion(db: pg.Client, spaceId: string, routeId: string, version = 1) {
  const { rows } = await db.query(
    `insert into route_versions (space_id, route_id, version, snapshot, snapshot_format, content_hash, published_by_user_id)
     values ($1, $2, $3, '{}', 1, $4, uuidv7()) returning id`,
    [spaceId, routeId, version, HASH],
  );
  return rows[0]?.id as string;
}
