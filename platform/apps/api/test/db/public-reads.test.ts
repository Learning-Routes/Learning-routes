import { PUBLIC_READS, publicRead } from "@learning-routes/public-read/reads";
import type pg from "pg";
import { describe, expect, it } from "vitest";
import { attempt, newUser, query, rolledBack, URLS } from "./connect";
import { newRoute, newSpace } from "./fixtures";

// The storefront's own way into the database (Platform STEP 4 §1): a role that reads
// views and nothing else, so a stranger's page can show only what a stranger may see.

const PUBLIC_VIEW = /\bfrom public_(spaces|routes|catalog)\b/;
const HASH = "0".repeat(64);
const PERMISSION_DENIED = /permission denied/;
// Hyperdrive does not cache a query that names a STABLE or VOLATILE function, and it
// looks at the text, comments included.
const UNCACHEABLE =
  /\b(now|current_setting|current_timestamp|current_date|current_time|localtime|localtimestamp|timeofday|random|uuidv7|gen_random_uuid|clock_timestamp|statement_timestamp|transaction_timestamp|nextval|currval|lastval|set_config)\b/i;

const modulesOf = (title: string) => [
  {
    id: crypto.randomUUID(),
    position: "a0",
    title: { es: `${title}, módulo 1` },
  },
];

function snapshotOf(routeId: string, slug: string, title: string, secret = "the answer") {
  const modules = modulesOf(title);
  const lessonId = crypto.randomUUID();
  return {
    route: {
      id: routeId,
      slug,
      title: { es: title },
      description: { es: `Sobre ${title}` },
      sourceLocale: "es",
      access: "open",
      pricing: "free",
    },
    modules,
    lessons: [
      { id: lessonId, moduleId: modules[0]?.id, position: "a0", title: { es: "Primer tema" } },
    ],
    prerequisites: [],
    blocks: [
      {
        id: crypto.randomUUID(),
        lessonId,
        position: "a0",
        kind: "prose",
        data: { text: secret },
      },
    ],
  };
}

async function publish(
  db: pg.Client,
  spaceId: string,
  routeId: string,
  version: number,
  snapshot: unknown,
) {
  await db.query(
    `insert into route_versions (space_id, route_id, version, snapshot, snapshot_format, content_hash, published_by_user_id)
     values ($1, $2, $3, $4, 1, $5, uuidv7())`,
    [spaceId, routeId, version, JSON.stringify(snapshot), HASH],
  );
  await db.query("update routes set latest_published_version = $2 where id = $1", [
    routeId,
    version,
  ]);
}

const slugOf = async (db: pg.Client, spaceId: string) =>
  (await db.query("select slug from spaces where id = $1", [spaceId])).rows[0]?.slug as string;

/** Everything a stranger may read of one published route, as the storefront's role. */
async function asStranger<T>(db: pg.Client, read: () => Promise<T>): Promise<T> {
  await db.query("set local role lr_public");
  try {
    return await read();
  } finally {
    await db.query("reset role");
  }
}

describe("the storefront's role", () => {
  it("bypasses nothing, owns nothing and inherits no role", async () => {
    const [role] = await query(
      URLS.public,
      "select rolbypassrls, rolsuper, rolcreaterole, rolcreatedb, rolinherit from pg_roles where rolname = current_user",
    );
    expect(role).toEqual({
      rolbypassrls: false,
      rolsuper: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolinherit: false,
    });
    expect(
      await query(
        URLS.public,
        `select r.rolname from pg_auth_members m join pg_roles r on r.oid = m.roleid
          join pg_roles u on u.oid = m.member where u.rolname = current_user`,
      ),
    ).toEqual([]);
  });

  it("holds SELECT on views only, and on no table", async () => {
    const grants = await query(
      URLS.migrator,
      `select g.table_name, g.privilege_type, t.table_type
         from information_schema.role_table_grants g
         join information_schema.tables t using (table_schema, table_name)
        where g.grantee = 'lr_public'
        order by g.table_name`,
    );
    expect(grants.length).toBeGreaterThan(0);
    for (const grant of grants) {
      expect(grant, grant.table_name).toMatchObject({
        privilege_type: "SELECT",
        table_type: "VIEW",
      });
    }
  });

  it("is refused every table in the database", async () => {
    const tables = await query(
      URLS.migrator,
      `select schemaname, tablename from pg_tables where schemaname in ('public', 'app', 'meta')`,
    );
    expect(tables.length).toBeGreaterThan(15);
    for (const { schemaname, tablename } of tables) {
      await expect(
        query(URLS.public, `select 1 from "${schemaname}"."${tablename}" limit 1`),
        `${schemaname}.${tablename}`,
      ).rejects.toThrow(PERMISSION_DENIED);
    }
  });

  it("is refused every write, through a view too", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      await db.query("set local role lr_public");
      expect(await attempt(db, "update public_spaces set slug = 'taken'")).toMatch(
        PERMISSION_DENIED,
      );
      expect(await attempt(db, "delete from public_routes")).not.toBeNull();
    });
  });

  it("every view is a security barrier, owned by the migrator", async () => {
    const views = await query(
      URLS.migrator,
      `select c.relname, r.rolname, c.reloptions from pg_class c
         join pg_roles r on r.oid = c.relowner
         join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'v' and n.nspname = 'public'`,
    );
    expect(views.map((view: { relname: string }) => view.relname)).toEqual(
      expect.arrayContaining(["public_catalog", "public_routes", "public_spaces"]),
    );
    for (const view of views) {
      expect(view.rolname, view.relname).toBe("lr_migrator");
      expect(view.reloptions, view.relname).toContain("security_barrier=true");
    }
  });
});

describe("what a stranger can read", () => {
  it("a route's latest published version, never its draft or its blocks", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const spaceId = await newSpace(db, "public-read");
      const routeId = await newRoute(db, spaceId, "guitarra");
      await publish(db, spaceId, routeId, 1, snapshotOf(routeId, "guitarra", "Guitarra uno"));
      await publish(db, spaceId, routeId, 2, snapshotOf(routeId, "guitarra", "Guitarra dos"));
      // An edit nobody published.
      await db.query(`update routes set title = '{"en": "A draft title"}' where id = $1`, [
        routeId,
      ]);
      const slug = await slugOf(db, spaceId);
      const route = await asStranger(db, () => publicRead(db).routeBySlug(slug, "guitarra"));
      expect(route).toMatchObject({
        routeId,
        spaceId,
        version: 2,
        title: { es: "Guitarra dos" },
        moduleCount: 1,
        lessonCount: 1,
      });
      expect(route?.modules[0]).toMatchObject({
        title: { es: "Guitarra dos, módulo 1" },
        lessons: [{ es: "Primer tema" }],
      });
      expect(JSON.stringify(route)).not.toContain("A draft title");
      expect(JSON.stringify(route)).not.toContain("the answer");
    });
  });

  it("no column of a view holds a block, a member or an address", async () => {
    const columns = await query(
      URLS.migrator,
      `select table_name, column_name from information_schema.columns
        where table_name in ('public_spaces', 'public_routes', 'public_catalog')`,
    );
    const names = columns.map((column: { column_name: string }) => column.column_name);
    for (const refused of ["snapshot", "blocks", "email", "user_id", "published_by_user_id"]) {
      expect(names).not.toContain(refused);
    }
  });

  it("a route nobody published does not exist", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const spaceId = await newSpace(db, "public-read");
      await newRoute(db, spaceId, "borrador");
      const slug = await slugOf(db, spaceId);
      expect(await asStranger(db, () => publicRead(db).routeBySlug(slug, "borrador"))).toBeNull();
      expect(await asStranger(db, () => publicRead(db).routesOfSpace(spaceId))).toEqual([]);
    });
  });

  it("an archived route, or any route of an archived space, does not exist", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const spaceId = await newSpace(db, "public-read");
      const kept = await newRoute(db, spaceId, "kept");
      const gone = await newRoute(db, spaceId, "gone");
      await publish(db, spaceId, kept, 1, snapshotOf(kept, "kept", "Kept"));
      await publish(db, spaceId, gone, 1, snapshotOf(gone, "gone", "Gone"));
      await db.query("update routes set archived_at = now() where id = $1", [gone]);
      const slug = await slugOf(db, spaceId);
      const listed = await asStranger(db, () => publicRead(db).routesOfSpace(spaceId));
      expect(listed.map((route) => route.slug)).toEqual(["kept"]);
      expect(await asStranger(db, () => publicRead(db).routeBySlug(slug, "gone"))).toBeNull();

      await db.query("update spaces set archived_at = now() where id = $1", [spaceId]);
      expect(await asStranger(db, () => publicRead(db).spaceBySlug(slug))).toBeNull();
      expect(await asStranger(db, () => publicRead(db).routeBySlug(slug, "kept"))).toBeNull();
    });
  });

  it("a space shows its public fields, and never who belongs to it", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const spaceId = await newSpace(db, "public-read");
      const member = await newUser(db);
      await db.query("insert into memberships (space_id, user_id, role) values ($1, $2, 'owner')", [
        spaceId,
        member,
      ]);
      const slug = await slugOf(db, spaceId);
      const space = await asStranger(db, () => publicRead(db).spaceBySlug(slug));
      expect(space).toMatchObject({ id: spaceId, slug, locales: ["en"] });
      expect(JSON.stringify(space)).not.toContain(member);
      expect(JSON.stringify(space)).not.toContain("@example.com");
    });
  });
});

describe("the catalog", () => {
  async function listed(db: pg.Client, status: string) {
    const spaceId = await newSpace(db, "public-read");
    const routeId = await newRoute(db, spaceId, "listed");
    await publish(db, spaceId, routeId, 1, snapshotOf(routeId, "listed", "Listed"));
    await db.query(
      "insert into catalog_listings (route_id, space_id, status) values ($1, $2, $3)",
      [routeId, spaceId, status],
    );
    return routeId;
  }

  it.each(["requested", "declined", "withdrawn"])("never shows a %s route", async (status) => {
    await rolledBack(URLS.migrator, async (db) => {
      const routeId = await listed(db, status);
      await db.query("set local role lr_public");
      const { rows } = await db.query("select 1 from public_catalog where route_id = $1", [
        routeId,
      ]);
      expect(rows).toEqual([]);
    });
  });

  it("shows an approved route, and keeps its newer version listed", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const routeId = await listed(db, "approved");
      const { rows: owners } = await db.query("select space_id from routes where id = $1", [
        routeId,
      ]);
      await publish(db, owners[0]?.space_id, routeId, 2, snapshotOf(routeId, "listed", "Newer"));
      await db.query("set local role lr_public");
      const { rows } = await db.query(
        "select version, title, topic, price_minor from public_catalog where route_id = $1",
        [routeId],
      );
      expect(rows).toEqual([
        { version: 2, title: { es: "Newer" }, topic: "otros", price_minor: null },
      ]);
    });
  });

  it("a stranger cannot read who applied to teach", async () => {
    await expect(query(URLS.public, "select * from creator_applications")).rejects.toThrow(
      PERMISSION_DENIED,
    );
  });
});

describe("the storefront's queries", () => {
  it("name no function that would keep Hyperdrive from caching them", () => {
    expect(Object.keys(PUBLIC_READS).length).toBeGreaterThan(0);
    for (const [name, text] of Object.entries(PUBLIC_READS)) {
      expect(text, name).not.toMatch(UNCACHEABLE);
      expect(text, name).not.toContain("--");
      expect(text, name).not.toContain("/*");
    }
  });

  it("read only the public views", () => {
    for (const text of Object.values(PUBLIC_READS)) {
      expect(text).toMatch(PUBLIC_VIEW);
    }
  });
});
