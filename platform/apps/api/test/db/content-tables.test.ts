import type pg from "pg";
import { describe, expect, it } from "vitest";
import { attempt, rolledBack, URLS } from "./connect";

const CHECK = /violates check constraint/;
const UNIQUE = /duplicate key value violates unique constraint/;
const FOREIGN_KEY = /violates foreign key constraint/;
const RESTRICT = /violates RESTRICT setting of foreign key constraint/;

async function newSpace(db: pg.Client, slug: string): Promise<string> {
  const { rows } = await db.query(
    `insert into spaces (slug, name, default_locale, locales)
     values ($1, '{"en": "A space"}', 'en', '{en}') returning id`,
    [slug],
  );
  return rows[0]?.id;
}

async function newRoute(db: pg.Client, spaceId: string, slug = "first-route"): Promise<string> {
  const { rows } = await db.query(
    `insert into routes (space_id, slug, title, source_locale, access, pricing)
     values ($1, $2, '{"en": "A route"}', 'en', 'open', 'free') returning id`,
    [spaceId, slug],
  );
  return rows[0]?.id;
}

describe("the content tables (Platform STEP 2 §2.6–§2.8)", () => {
  it("routes: a slug unique per space, localized text, a draft revision from 0, no fork link", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const a = await newSpace(db, "space-a");
      const b = await newSpace(db, "space-b");
      await newRoute(db, a);
      expect(
        await attempt(
          db,
          "insert into routes (space_id, slug, title, source_locale, access, pricing) values ($1, 'first-route', '{\"en\": \"x\"}', 'en', 'open', 'free')",
          [a],
        ),
      ).toMatch(UNIQUE);
      const other = await newRoute(db, b);
      const { rows } = await db.query(
        "select draft_revision, latest_published_version from routes where id = $1",
        [other],
      );
      expect(rows).toEqual([{ draft_revision: "0", latest_published_version: null }]);
      const bad =
        "insert into routes (space_id, slug, title, source_locale, access, pricing) values ($1, $2, $3, $4, $5, $6)";
      expect(await attempt(db, bad, [a, "r1", { de: "x" }, "en", "open", "free"])).toMatch(CHECK);
      expect(await attempt(db, bad, [a, "r2", { en: "x" }, "de", "open", "free"])).toMatch(CHECK);
      expect(await attempt(db, bad, [a, "r3", { en: "x" }, "en", "public", "free"])).toMatch(CHECK);
      expect(await attempt(db, bad, [a, "r4", { en: "x" }, "en", "open", "cheap"])).toMatch(CHECK);
      // Provenance is plain columns: a fork may name a route in another space.
      const fork = `insert into routes (space_id, slug, title, source_locale, access, pricing,
                      forked_from_space_id, forked_from_route_id, forked_from_version)
                    values ($1, 'fork', '{"en": "x"}', 'en', 'open', 'free', $2, $3, 1)`;
      expect(await attempt(db, fork, [a, b, other])).toBeNull();
    });
  });

  it("modules, lessons and blocks: a child's space always matches its parent's", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const a = await newSpace(db, "space-a");
      const b = await newSpace(db, "space-b");
      const route = await newRoute(db, a);
      const addModule =
        'insert into modules (space_id, route_id, position, title) values ($1, $2, $3, \'{"en": "M"}\') returning id';
      expect(await attempt(db, addModule, [b, route, "V"])).toMatch(FOREIGN_KEY);
      const { rows: modules } = await db.query(addModule, [a, route, "V"]);
      const moduleId = modules[0]?.id;
      expect(await attempt(db, addModule, [a, route, "V"])).toMatch(UNIQUE);

      const addLesson =
        'insert into lessons (space_id, module_id, position, title) values ($1, $2, $3, \'{"en": "L"}\') returning id';
      expect(await attempt(db, addLesson, [b, moduleId, "V"])).toMatch(FOREIGN_KEY);
      const { rows: lessons } = await db.query(addLesson, [a, moduleId, "V"]);
      const lessonId = lessons[0]?.id;

      const addBlock =
        "insert into blocks (space_id, lesson_id, position, kind, data) values ($1, $2, $3, 'concept', '{}')";
      expect(await attempt(db, addBlock, [b, lessonId, "V"])).toMatch(FOREIGN_KEY);
      expect(await attempt(db, addBlock, [a, lessonId, "V"])).toBeNull();
      expect(await attempt(db, addBlock, [a, lessonId, "V"])).toMatch(UNIQUE);
    });
  });

  it("positions compare byte by byte, as core's keys expect", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const { rows } = await db.query(
        `select collation_name from information_schema.columns
          where table_name in ('modules', 'lessons', 'blocks') and column_name = 'position'`,
      );
      expect(rows).toEqual([
        { collation_name: "C" },
        { collation_name: "C" },
        { collation_name: "C" },
      ]);
    });
  });

  it("lesson_prerequisites: a pair is stored once, never a lesson on itself, never across spaces", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const a = await newSpace(db, "space-a");
      const b = await newSpace(db, "space-b");
      const route = await newRoute(db, a);
      const otherRoute = await newRoute(db, b);
      const { rows: modules } = await db.query(
        "insert into modules (space_id, route_id, position, title) values ($1, $2, 'V', '{\"en\": \"M\"}') returning id",
        [a, route],
      );
      const lesson = async (position: string) =>
        (
          await db.query(
            'insert into lessons (space_id, module_id, position, title) values ($1, $2, $3, \'{"en": "L"}\') returning id',
            [a, modules[0]?.id, position],
          )
        ).rows[0]?.id;
      const first = await lesson("G");
      const second = await lesson("V");
      const add =
        "insert into lesson_prerequisites (space_id, route_id, lesson_id, requires_lesson_id) values ($1, $2, $3, $4)";
      expect(await attempt(db, add, [a, route, second, first])).toBeNull();
      expect(await attempt(db, add, [a, route, second, first])).toMatch(UNIQUE);
      expect(await attempt(db, add, [a, route, first, first])).toMatch(CHECK);
      expect(await attempt(db, add, [b, otherRoute, first, second])).toMatch(FOREIGN_KEY);
    });
  });

  it("a route with content cannot be deleted: it is archived instead", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const a = await newSpace(db, "space-a");
      const route = await newRoute(db, a);
      await db.query(
        "insert into modules (space_id, route_id, position, title) values ($1, $2, 'V', '{\"en\": \"M\"}')",
        [a, route],
      );
      expect(await attempt(db, "delete from routes where id = $1", [route])).toMatch(RESTRICT);
    });
  });
});
