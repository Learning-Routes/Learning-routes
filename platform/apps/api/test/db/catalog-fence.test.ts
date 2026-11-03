import { RESERVED_SLUGS } from "@learning-routes/core/reserved-slugs";
import type pg from "pg";
import { describe, expect, it } from "vitest";
import { actAs, attempt, newUser, rolledBack, URLS } from "./connect";
import { newRoute, newSpace } from "./fixtures";

// The second fence for the catalog (Platform STEP 4 §2.3–§2.5), as raw SQL under lr_app:
// it holds whatever the actions in core decide.

const RESERVED_CHECK = /spaces_slug_not_reserved/;
const FORGED = /only an operator/;
const DUPLICATE = /duplicate key/;
const REFUSED = /row-level security|permission denied/;

async function operator(db: pg.Client): Promise<string> {
  const userId = await newUser(db);
  await db.query("insert into platform_roles (user_id, is_operator) values ($1, true)", [userId]);
  return userId;
}

async function ownedRoute(db: pg.Client) {
  const spaceId = await newSpace(db, "catalog-fence");
  const routeId = await newRoute(db, spaceId);
  const owner = await newUser(db);
  await db.query("insert into memberships (space_id, user_id, role) values ($1, $2, 'owner')", [
    spaceId,
    owner,
  ]);
  return { spaceId, routeId, owner };
}

const REQUEST =
  "insert into catalog_listings (route_id, space_id, status) values ($1, $2, 'requested')";

describe("a catalog listing", () => {
  it("an owner may ask, and not approve their own", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const { spaceId, routeId, owner } = await ownedRoute(db);
      await actAs(db, owner);
      expect(
        await attempt(
          db,
          "insert into catalog_listings (route_id, space_id, status) values ($1, $2, 'approved')",
          [routeId, spaceId],
        ),
      ).toMatch(REFUSED);
      expect(await attempt(db, REQUEST, [routeId, spaceId])).toBeNull();
      const approve = await db.query(
        "update catalog_listings set status = 'approved' where route_id = $1 and false",
        [routeId],
      );
      expect(approve.rowCount).toBe(0);
      expect(
        await attempt(db, "update catalog_listings set status = 'approved' where route_id = $1", [
          routeId,
        ]),
      ).toMatch(REFUSED);
      expect(
        await attempt(db, "update catalog_listings set status = 'withdrawn' where route_id = $1", [
          routeId,
        ]),
      ).toBeNull();
    });
  });

  it("a member who is not the owner may not ask, and a stranger sees nothing", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const { spaceId, routeId } = await ownedRoute(db);
      const student = await newUser(db);
      const stranger = await newUser(db);
      await db.query(
        "insert into memberships (space_id, user_id, role) values ($1, $2, 'student')",
        [spaceId, student],
      );
      await db.query(
        "insert into catalog_listings (route_id, space_id, status) values ($1, $2, 'requested')",
        [routeId, spaceId],
      );
      await actAs(db, student);
      expect(await attempt(db, REQUEST, [routeId, spaceId])).toMatch(REFUSED);
      await db.query("reset role");
      await actAs(db, stranger);
      expect((await db.query("select 1 from catalog_listings")).rows).toEqual([]);
      await db.query("reset role");
      await actAs(db, null);
      expect((await db.query("select 1 from catalog_listings")).rows).toEqual([]);
    });
  });

  it("an operator decides, and one active row per route holds", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const { spaceId, routeId } = await ownedRoute(db);
      const op = await operator(db);
      await db.query(REQUEST, [routeId, spaceId]);
      await actAs(db, op);
      expect(
        await attempt(db, "update catalog_listings set status = 'approved' where route_id = $1", [
          routeId,
        ]),
      ).toBeNull();
      await db.query("reset role");
      expect(await attempt(db, REQUEST, [routeId, spaceId])).toMatch(DUPLICATE);
    });
  });
});

describe("an application to teach", () => {
  const APPLY =
    "insert into creator_applications (name, email, teaches, locale) values ('Ana', 'ana@example.com', 'guitarra', 'es')";

  it("anyone may send one, and nobody but an operator reads or decides it", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const someone = await newUser(db);
      await actAs(db, null);
      expect(await attempt(db, APPLY)).toBeNull();
      expect((await db.query("select 1 from creator_applications")).rows).toEqual([]);
      await db.query("reset role");
      await actAs(db, someone);
      expect((await db.query("select 1 from creator_applications")).rows).toEqual([]);
      const decided = await db.query("update creator_applications set status = 'invited'");
      expect(decided.rowCount).toBe(0);
      await db.query("reset role");
      await actAs(db, await operatorOutside(db));
      expect((await db.query("select 1 from creator_applications")).rows).toHaveLength(1);
      expect((await db.query("update creator_applications set status = 'invited'")).rowCount).toBe(
        1,
      );
    });
  });

  it("an applicant cannot mark their own as decided", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      await actAs(db, null);
      expect(
        await attempt(
          db,
          "insert into creator_applications (name, email, teaches, locale, status) values ('Ana', 'ana@example.com', 'guitarra', 'es', 'invited')",
        ),
      ).toMatch(REFUSED);
    });
  });

  it("is refused to lr_app with no acting user as well", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      await db.query(APPLY);
      await actAs(db, null);
      expect((await db.query("select 1 from creator_applications")).rows).toEqual([]);
    });
  });
});

/** A new operator, made as the migrator from inside lr_app's turn. */
async function operatorOutside(db: pg.Client): Promise<string> {
  await db.query("reset role");
  return operator(db);
}

describe("the decision record (Platform STEP 4 review, fix 1)", () => {
  const FORGERIES: [string, string][] = [
    ["note", "note = 'approved by nobody'"],
    ["decided_at", "decided_at = now()"],
    ["decided_by", "decided_by = uuidv7()"],
    ["decided_version", "decided_version = 7"],
    ["featured_position", "featured_position = 1"],
  ];

  async function listedByOwner(db: pg.Client, status: string, featured: number | null = null) {
    const fixture = await ownedRoute(db);
    await db.query(
      "insert into catalog_listings (route_id, space_id, status, featured_position) values ($1, $2, $3, $4)",
      [fixture.routeId, fixture.spaceId, status, featured],
    );
    return fixture;
  }

  it.each(FORGERIES)("an owner cannot write %s, even while withdrawing", async (_, change) => {
    await rolledBack(URLS.migrator, async (db) => {
      const { routeId, owner } = await listedByOwner(db, "requested");
      await actAs(db, owner);
      expect(
        await attempt(
          db,
          `update catalog_listings set status = 'withdrawn', ${change} where route_id = $1`,
          [routeId],
        ),
      ).toMatch(FORGED);
    });
  });

  it("an owner can still withdraw, which leaves the record as it was", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const { routeId, owner } = await listedByOwner(db, "requested");
      await actAs(db, owner);
      expect(
        await attempt(db, "update catalog_listings set status = 'withdrawn' where route_id = $1", [
          routeId,
        ]),
      ).toBeNull();
    });
  });

  it("withdrawing takes a route off the landing, and that is all it may do to its place", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const { routeId, owner } = await listedByOwner(db, "approved", 2);
      await actAs(db, owner);
      expect(
        await attempt(
          db,
          "update catalog_listings set status = 'withdrawn', featured_position = null where route_id = $1",
          [routeId],
        ),
      ).toBeNull();
    });
  });

  it("an operator can still decide, and write every one of them", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const { routeId } = await listedByOwner(db, "requested");
      const op = await operator(db);
      await actAs(db, op);
      expect(
        await attempt(
          db,
          `update catalog_listings
              set status = 'approved', note = 'Todo en orden', decided_at = now(),
                  decided_by = $2, decided_version = 1, featured_position = 3
            where route_id = $1`,
          [routeId, op],
        ),
      ).toBeNull();
    });
  });
});

describe("a space's address (Platform STEP 4 review, fix 2)", () => {
  it.each(RESERVED_SLUGS)("the database refuses %s", async (slug) => {
    await rolledBack(URLS.migrator, async (db) => {
      expect(
        await attempt(
          db,
          `insert into spaces (slug, name, default_locale, locales) values ($1, '{"en": "S"}', 'en', '{en}')`,
          [slug],
        ),
      ).toMatch(RESERVED_CHECK);
    });
  });
});
