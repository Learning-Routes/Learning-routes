// Invented creators and routes for the browser tests and a local look at the storefront
// (Platform STEP 4 §7). LOCAL ONLY: it refuses any database but the local one. Running it
// again changes nothing. Every name here is invented.
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  contentHash,
  SNAPSHOT_FORMAT,
  type Snapshot,
} from "@learning-routes/core/content/snapshot";
import pg from "pg";

const LOCAL = "postgres://lr_migrator:local-only-migrator@localhost:54318/learning_routes";
const LOCAL_HOST = /@localhost:54318\//;
const MODULE_TITLES = [
  "Primeros pasos",
  "Seguir adelante",
  "Ganar soltura",
  "Practicar en serio",
  "Ir más lejos",
  "Cerrar el círculo",
];
const NOBODY = "00000000-0000-7000-8000-000000000000";

interface Fixture {
  space: string;
  name: string;
  tagline: string;
  bio: string;
  brandColor: string;
  routes: {
    slug: string;
    title: string;
    description: string;
    topic: Snapshot["route"]["topic"];
    level: Snapshot["route"]["level"];
    priceMinor: number | null;
    lessons: number[];
    listing: "approved" | "requested" | "declined" | null;
  }[];
}

export const STOREFRONT_FIXTURES: Fixture[] = [
  {
    space: "mariana-ortega",
    name: "Mariana Ortega",
    tagline: "Habla portugués en tu próximo viaje.",
    bio: "Enseño portugués a viajeros desde hace diez años, con frases que de verdad se usan.",
    brandColor: "#127c76",
    routes: [
      {
        slug: "portugues-para-viajar",
        title: "Portugués para viajar",
        description:
          "Del aeropuerto al restaurante: lo que necesitas decir y entender en tu primer viaje.",
        topic: "idiomas",
        level: "inicial",
        priceMinor: 2900,
        lessons: [5, 5, 4],
        listing: "approved",
      },
      {
        slug: "portugues-para-el-trabajo",
        title: "Portugués para el trabajo",
        description: "Reuniones, correos y llamadas con clientes de Brasil y Portugal.",
        topic: "idiomas",
        level: "intermedio",
        priceMinor: 4900,
        lessons: [6, 5, 5, 5, 5],
        listing: "requested",
      },
    ],
  },
  {
    space: "profe-tomas",
    name: "Profe Tomás",
    tagline: "Matemáticas sin miedo.",
    bio: "Explico cálculo como me hubiera gustado que me lo explicaran a mí.",
    brandColor: "#2c5f8e",
    routes: [
      {
        slug: "calculo-sin-miedo",
        title: "Cálculo sin miedo",
        description: "Límites, derivadas e integrales, paso a paso y con ejemplos reales.",
        topic: "matematicas",
        level: "intermedio",
        priceMinor: 3900,
        lessons: [8, 7, 7, 7, 6, 6],
        listing: "approved",
      },
      {
        slug: "ruta-para-aprobar",
        title: "Ruta para aprobar",
        description: "Pidió entrar al catálogo.",
        topic: "arte",
        level: "inicial",
        priceMinor: null,
        lessons: [2],
        listing: "requested",
      },
    ],
  },
  {
    space: "andres-mora",
    name: "Andrés Mora",
    tagline: "Tu primera canción, esta semana.",
    bio: "Toco y enseño guitarra desde hace quince años.",
    brandColor: "#5a4c9e",
    routes: [
      {
        slug: "guitarra-desde-cero",
        title: "Guitarra desde cero",
        description: "De tu primer acorde a tocar canciones completas.",
        topic: "musica",
        level: "inicial",
        priceMinor: null,
        lessons: [5, 4, 5, 4],
        listing: "approved",
      },
      {
        slug: "guitarra-sin-publicar",
        title: "Borrador que nadie debe ver",
        description: "Un borrador.",
        topic: "musica",
        level: "avanzado",
        priceMinor: null,
        lessons: [],
        listing: null,
      },
    ],
  },
];

function snapshotOf(routeId: string, route: Fixture["routes"][number]): Snapshot {
  const modules = route.lessons.map((_, index) => ({
    id: uuidFrom(`${routeId}:module:${index}`),
    position: positionOf(index),
    title: { es: MODULE_TITLES[index] ?? `Parte ${index + 1}` },
  }));
  const lessons = route.lessons.flatMap((count, moduleIndex) =>
    Array.from({ length: count }, (_, index) => ({
      id: uuidFrom(`${routeId}:lesson:${moduleIndex}:${index}`),
      moduleId: uuidFrom(`${routeId}:module:${moduleIndex}`),
      position: positionOf(index),
      title: { es: `Tema ${index + 1}` },
    })),
  );
  return {
    route: {
      id: routeId,
      slug: route.slug,
      title: { es: route.title },
      description: { es: route.description },
      sourceLocale: "es",
      access: "open",
      pricing: "free",
      topic: route.topic,
      level: route.level,
      priceMinor: route.priceMinor,
      currency: route.priceMinor === null ? null : "EUR",
    },
    modules,
    lessons,
    prerequisites: [],
    blocks: [],
  };
}

// keyBetween's alphabet, in order: enough for a fixture's few siblings.
const positionOf = (index: number) => `V${"123456789ABCDEFGHIJ"[index]}`;

/** The same uuid every run, so running the seed again changes nothing. */
function uuidFrom(text: string): string {
  let hex = "";
  for (let round = 0; hex.length < 32; round++) {
    let hash = 2_166_136_261 ^ round;
    for (const character of text) {
      hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 16_777_619);
    }
    hex += (hash >>> 0).toString(16).padStart(8, "0");
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function seedSpace(db: pg.Client, fixture: Fixture): Promise<string> {
  const id = uuidFrom(`space:${fixture.space}`);
  await db.query(
    `insert into spaces (id, slug, name, default_locale, locales, tagline, bio, brand_color)
     values ($1, $2, $3, 'es', '{es}', $4, $5, $6) on conflict (id) do nothing`,
    [
      id,
      fixture.space,
      { es: fixture.name },
      { es: fixture.tagline },
      { es: fixture.bio },
      fixture.brandColor,
    ],
  );
  return id;
}

/** Back to where the browser tests expect to start, on every run. */
async function resetWhatTestsChange(db: pg.Client) {
  const tomas = uuidFrom("space:profe-tomas");
  await db.query("update catalog_listings set featured_position = null");
  await db.query(
    `update catalog_listings set status = 'requested', note = null, decided_at = null,
            decided_by = null, decided_version = null
      where route_id = $1`,
    [uuidFrom(`route:${tomas}:ruta-para-aprobar`)],
  );
  // A member with an address, so the tests can see that no public page ever shows one.
  const { rows } = await db.query(
    `insert into "user" (name, email) values ('Mariana Ortega', 'mariana.ortega@example.com')
     on conflict (email) do update set name = excluded.name returning id`,
  );
  await db.query(
    `insert into memberships (space_id, user_id, role) values ($1, $2, 'owner') on conflict do nothing`,
    [uuidFrom("space:mariana-ortega"), rows[0].id],
  );
  await db.query("delete from creator_applications");
  await db.query(
    `insert into creator_applications (name, email, teaches, link, locale)
     values ('Lucía Vega', 'lucia.vega@example.com', 'Inglés para el trabajo', 'https://example.com/lucia', 'es')`,
  );
  await db.query(
    `insert into creator_applications (name, email, teaches, locale, status, decided_at)
     values ('Diego Ramos', 'diego.ramos@example.com', 'Programación web', 'es', 'invited', timestamptz '2026-10-02')`,
  );
}

/** What must never show: an edit nobody published, an archived route, a closed space. */
async function seedHidden(db: pg.Client) {
  const andres = uuidFrom("space:andres-mora");
  await db.query(
    `update routes set title = '{"es": "Título que nadie publicó"}'
      where id = $1`,
    [uuidFrom(`route:${andres}:guitarra-desde-cero`)],
  );
  await seedRoute(db, andres, {
    slug: "ruta-archivada",
    title: "Ruta archivada",
    description: "Nadie la ve.",
    topic: "arte",
    level: "inicial",
    priceMinor: null,
    lessons: [1],
    listing: "approved",
  });
  await db.query("update routes set archived_at = timestamptz '2026-10-02' where id = $1", [
    uuidFrom(`route:${andres}:ruta-archivada`),
  ]);
  const closed = await seedSpace(db, {
    space: "espacio-cerrado",
    name: "Espacio cerrado",
    tagline: "Ya no está.",
    bio: "Ya no está.",
    brandColor: "#5a4c9e",
    routes: [],
  });
  await seedRoute(db, closed, {
    slug: "su-ruta",
    title: "Su ruta",
    description: "Nadie la ve.",
    topic: "arte",
    level: "inicial",
    priceMinor: null,
    lessons: [1],
    listing: null,
  });
  await db.query("update spaces set archived_at = timestamptz '2026-10-02' where id = $1", [
    closed,
  ]);
}

async function seedRoute(db: pg.Client, spaceId: string, route: Fixture["routes"][number]) {
  const routeId = uuidFrom(`route:${spaceId}:${route.slug}`);
  const snapshot = snapshotOf(routeId, route);
  const created = await db.query(
    `insert into routes (id, space_id, slug, title, description, source_locale, access, pricing, topic, level, price_minor, currency)
     values ($1, $2, $3, $4, $5, 'es', 'open', 'free', $6, $7, $8, $9) on conflict (id) do nothing`,
    [
      routeId,
      spaceId,
      route.slug,
      snapshot.route.title,
      snapshot.route.description,
      route.topic,
      route.level,
      route.priceMinor,
      snapshot.route.currency,
    ],
  );
  if (created.rowCount === 0 || route.lessons.length === 0) {
    return;
  }
  await db.query(
    `insert into route_versions (space_id, route_id, version, snapshot, snapshot_format, content_hash, published_by_user_id)
     values ($1, $2, 1, $3, $4, $5, $6)`,
    [
      spaceId,
      routeId,
      JSON.stringify(snapshot),
      SNAPSHOT_FORMAT,
      await contentHash(snapshot),
      NOBODY,
    ],
  );
  await db.query("update routes set latest_published_version = 1 where id = $1", [routeId]);
  if (route.listing !== null) {
    await db.query(
      `insert into catalog_listings (route_id, space_id, status, decided_at, decided_version)
       values ($1, $2, $3, case when $3 = 'requested' then null else timestamptz '2026-10-01' end,
               case when $3 = 'requested' then null else 1 end)`,
      [routeId, spaceId, route.listing],
    );
  }
}

/** Makes a signed-in address the operator: the browser tests' admin. */
async function makeOperator(url: string, email: string) {
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    await db.query(
      `insert into platform_roles (user_id, is_operator)
       select id, true from "user" where email = $1
       on conflict (user_id) do update set is_operator = true`,
      [email],
    );
  } finally {
    await db.end();
  }
}

/** wrangler dev's one client address: its per-client counts, and nobody else's. */
async function clearLimits(url: string) {
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    await db.query(
      `delete from rate_limit where key like '0000:0000:0000:0000:0000:0000:0000:0000|%'
          or key = 'apply-client:::1' or key = 'magic-link-peek:::1'`,
    );
  } finally {
    await db.end();
  }
}

export async function seedStorefront(url: string): Promise<void> {
  if (!LOCAL_HOST.test(url)) {
    throw new Error("the storefront's fixtures go only in the local database");
  }
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    for (const fixture of STOREFRONT_FIXTURES) {
      const spaceId = await seedSpace(db, fixture);
      for (const route of fixture.routes) {
        await seedRoute(db, spaceId, route);
      }
    }
    await seedHidden(db);
    await resetWhatTestsChange(db);
  } finally {
    await db.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL_MIGRATOR ?? LOCAL;
  if (!LOCAL_HOST.test(url)) {
    throw new Error("the storefront's fixtures go only in the local database");
  }
  const { values } = parseArgs({
    options: { operator: { type: "string" }, "clear-limits": { type: "boolean" } },
  });
  if (values.operator) {
    await makeOperator(url, values.operator);
  } else if (values["clear-limits"]) {
    await clearLimits(url);
  } else {
    await seedStorefront(url);
    console.log(JSON.stringify({ message: "storefront fixtures seeded" }));
  }
}
