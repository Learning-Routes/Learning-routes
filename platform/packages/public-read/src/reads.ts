import type { LocalizedText } from "@learning-routes/core/localized-text";
import pg from "pg";

// The storefront's only way into the database (Platform STEP 4 §1), through DB_PUBLIC:
// a Hyperdrive config with caching on, connecting as lr_public, which reads views and
// nothing else. Hyperdrive will not cache a query that names a STABLE or VOLATILE
// function, and it reads the query's text to tell. So every value here is a parameter,
// including any time, and these strings name no such function, not even in a comment.

export const PUBLIC_READS = {
  spaceBySlug: `select id, slug, name, default_locale, locales
                  from public_spaces where slug = $1`,
  routeBySlug: `select route_id, space_id, space_slug, slug, version, title, description,
                       source_locale, access, pricing, modules, module_count, lesson_count
                  from public_routes where space_slug = $1 and slug = $2`,
  routesOfSpace: `select route_id, space_id, space_slug, slug, version, title, description,
                         source_locale, access, pricing, modules, module_count, lesson_count
                    from public_routes where space_id = $1 order by published_at desc, route_id`,
} as const;

export interface PublicSpace {
  id: string;
  slug: string;
  name: LocalizedText;
  defaultLocale: string;
  locales: string[];
}

export interface PublicRoute {
  routeId: string;
  spaceId: string;
  spaceSlug: string;
  slug: string;
  version: number;
  title: LocalizedText;
  description: LocalizedText | null;
  sourceLocale: string;
  access: "open" | "closed";
  pricing: "free" | "paid";
  modules: { id: string; title: LocalizedText; lessons: LocalizedText[] }[];
  moduleCount: number;
  lessonCount: number;
}

interface Queryable {
  query(text: string, values: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

function spaceFrom(row: Record<string, unknown>): PublicSpace {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    defaultLocale: row.default_locale,
    locales: row.locales,
  } as PublicSpace;
}

function routeFrom(row: Record<string, unknown>): PublicRoute {
  return {
    routeId: row.route_id,
    spaceId: row.space_id,
    spaceSlug: row.space_slug,
    slug: row.slug,
    version: row.version,
    title: row.title,
    description: row.description,
    sourceLocale: row.source_locale,
    access: row.access,
    pricing: row.pricing,
    modules: row.modules,
    moduleCount: row.module_count,
    lessonCount: row.lesson_count,
  } as PublicRoute;
}

/** The reads, on a connection that is already open. */
export function publicRead(db: Queryable) {
  return {
    async spaceBySlug(slug: string): Promise<PublicSpace | null> {
      const { rows } = await db.query(PUBLIC_READS.spaceBySlug, [slug]);
      return rows[0] ? spaceFrom(rows[0]) : null;
    },
    async routeBySlug(spaceSlug: string, slug: string): Promise<PublicRoute | null> {
      const { rows } = await db.query(PUBLIC_READS.routeBySlug, [spaceSlug, slug]);
      return rows[0] ? routeFrom(rows[0]) : null;
    },
    async routesOfSpace(spaceId: string): Promise<PublicRoute[]> {
      const { rows } = await db.query(PUBLIC_READS.routesOfSpace, [spaceId]);
      return rows.map(routeFrom);
    },
  };
}

export type PublicRead = ReturnType<typeof publicRead>;

/**
 * One request's reads. The client is made per request, from Hyperdrive, and never kept
 * in a module variable; only closing it goes to ctx.waitUntil.
 */
export async function withPublicRead<T>(
  env: { DB_PUBLIC: { connectionString: string } },
  ctx: { waitUntil(promise: Promise<unknown>): void },
  fn: (reads: PublicRead) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: env.DB_PUBLIC.connectionString });
  try {
    await client.connect();
    return await fn(publicRead(client));
  } finally {
    ctx.waitUntil(client.end());
  }
}
