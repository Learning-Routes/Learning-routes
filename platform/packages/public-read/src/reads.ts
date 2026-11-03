import type { RouteLevel, RouteTopic } from "@learning-routes/core/copy/route-facts";
import type { LocaleCode } from "@learning-routes/core/locales";
import type { LocalizedText } from "@learning-routes/core/localized-text";
import pg from "pg";

// The storefront's only way into the database (Platform STEP 4 §1), through DB_PUBLIC:
// a Hyperdrive config with caching on, connecting as lr_public, which reads views and
// nothing else. Hyperdrive will not cache a query that names a STABLE or VOLATILE
// function, and it reads the query's text to tell. So every value here is a parameter,
// including any time, and these strings name no such function, not even in a comment.

export const CATALOG_PAGE_SIZE = 24;

const ROUTE_COLUMNS = `route_id, space_id, space_slug, slug, version, title, description,
  source_locale, access, pricing, modules, module_count, lesson_count, topic, level,
  price_minor, currency, space_name, space_brand_color`;

// One text per locale: the column is the page's locale, never a value from a request.
// ILIKE uses the trigram index; word_similarity forgives a typo. Both are IMMUTABLE.
function searchCatalog(titleColumn: string) {
  return `select ${ROUTE_COLUMNS} from public_catalog
           where ($1::text is null or topic = $1)
             and ($2::text is null or ${titleColumn} ilike $2 or word_similarity($3, ${titleColumn}) > 0.45)
           order by approved_at desc, route_id
           limit ${CATALOG_PAGE_SIZE + 1} offset $4`;
}

export const CATALOG_SEARCHES = {
  es: searchCatalog("title_es"),
  en: searchCatalog("title_en"),
  pt: searchCatalog("title_pt"),
  fr: searchCatalog("title_fr"),
  it: searchCatalog("title_it"),
} as const;

export const PUBLIC_READS = {
  ...CATALOG_SEARCHES,
  chosenToStart: `select ${ROUTE_COLUMNS} from public_catalog
                   where featured_position is not null order by featured_position limit 3`,
  newestToStart: `select ${ROUTE_COLUMNS} from public_catalog
                   order by approved_at desc, route_id limit 3`,
  spaceBySlug: `select id, slug, name, default_locale, locales, tagline, bio, brand_color
                  from public_spaces where slug = $1`,
  isRetired: "select 1 from public_retired_spaces where slug = $1",
  routeBySlug: `select ${ROUTE_COLUMNS} from public_routes where space_slug = $1 and slug = $2`,
  routesOfSpace: `select ${ROUTE_COLUMNS} from public_routes
                   where space_id = $1 order by published_at desc, route_id`,
} as const;

export interface PublicSpace {
  id: string;
  slug: string;
  name: LocalizedText;
  defaultLocale: string;
  locales: string[];
  tagline: LocalizedText | null;
  bio: LocalizedText | null;
  brandColor: string | null;
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
  topic: RouteTopic;
  level: RouteLevel;
  priceMinor: number | null;
  currency: string | null;
  spaceName: LocalizedText;
  spaceBrandColor: string | null;
}

export interface CatalogQuery {
  locale: LocaleCode;
  topic: RouteTopic | null;
  /** What the visitor typed, trimmed. */
  search: string | null;
  /** From 1. */
  page: number;
}

export interface CatalogPage {
  routes: PublicRoute[];
  hasNext: boolean;
}

const LIKE_SPECIAL = /[\\%_]/g;

/** What a visitor typed, as a LIKE pattern that matches it literally, anywhere. */
export function containsPattern(text: string): string {
  return `%${text.replace(LIKE_SPECIAL, "\\$&")}%`;
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
    tagline: row.tagline,
    bio: row.bio,
    brandColor: row.brand_color,
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
    topic: row.topic,
    level: row.level,
    priceMinor: row.price_minor === null ? null : Number(row.price_minor),
    currency: row.currency,
    spaceName: row.space_name,
    spaceBrandColor: row.space_brand_color,
  } as PublicRoute;
}

/** The reads, on a connection that is already open. */
export function publicRead(db: Queryable) {
  return {
    async spaceBySlug(slug: string): Promise<PublicSpace | null> {
      const { rows } = await db.query(PUBLIC_READS.spaceBySlug, [slug]);
      return rows[0] ? spaceFrom(rows[0]) : null;
    },
    /** Whether a slug was a space that is gone: 410, where an unknown one is 404. */
    async isRetired(slug: string): Promise<boolean> {
      const { rows } = await db.query(PUBLIC_READS.isRetired, [slug]);
      return rows.length > 0;
    },
    async routeBySlug(spaceSlug: string, slug: string): Promise<PublicRoute | null> {
      const { rows } = await db.query(PUBLIC_READS.routeBySlug, [spaceSlug, slug]);
      return rows[0] ? routeFrom(rows[0]) : null;
    },
    async catalog({ locale, topic, search, page }: CatalogQuery): Promise<CatalogPage> {
      const { rows } = await db.query(CATALOG_SEARCHES[locale], [
        topic,
        search === null ? null : containsPattern(search),
        search,
        (page - 1) * CATALOG_PAGE_SIZE,
      ]);
      return {
        routes: rows.slice(0, CATALOG_PAGE_SIZE).map(routeFrom),
        hasNext: rows.length > CATALOG_PAGE_SIZE,
      };
    },
    /** The landing's three: those an operator chose or, with none chosen, the newest. */
    async routesToStart(): Promise<PublicRoute[]> {
      const chosen = await db.query(PUBLIC_READS.chosenToStart, []);
      const rows =
        chosen.rows.length > 0
          ? chosen.rows
          : (await db.query(PUBLIC_READS.newestToStart, [])).rows;
      return rows.map(routeFrom);
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
