import { describe, expect, it } from "vitest";
import { attempt, query, rolledBack, URLS } from "./connect";
import { newRoute, newSpace } from "./fixtures";

// Platform STEP 2 review, items 8 and 13: a position key is unique among the live
// children of one parent only, so archiving a child frees its key; and the hot
// paths have their indexes.

const UNIQUE = /duplicate key value violates unique constraint/;
const INDEX_PREFIX = /^.* USING btree /;

describe("position keys ignore archived rows", () => {
  it("lets a module, a lesson and a block take the key of an archived sibling", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const space = await newSpace(db, "positions");
      const route = await newRoute(db, space);
      const addModule =
        "insert into modules (space_id, route_id, position, title) values ($1, $2, 'V', '{\"en\": \"M\"}') returning id";
      const { rows: modules } = await db.query(addModule, [space, route]);
      const moduleId = modules[0]?.id;
      const addLesson =
        "insert into lessons (space_id, route_id, module_id, position, title) values ($1, $2, $3, 'V', '{\"en\": \"L\"}') returning id";
      const { rows: lessons } = await db.query(addLesson, [space, route, moduleId]);
      const lessonId = lessons[0]?.id;
      const addBlock =
        "insert into blocks (space_id, lesson_id, position, kind, data) values ($1, $2, 'V', 'concept', '{}')";
      await db.query(addBlock, [space, lessonId]);

      // Live siblings still collide.
      expect(await attempt(db, addModule, [space, route])).toMatch(UNIQUE);
      expect(await attempt(db, addLesson, [space, route, moduleId])).toMatch(UNIQUE);
      expect(await attempt(db, addBlock, [space, lessonId])).toMatch(UNIQUE);

      await db.query("update blocks set archived_at = now() where lesson_id = $1", [lessonId]);
      expect(await attempt(db, addBlock, [space, lessonId])).toBeNull();
      await db.query("update lessons set archived_at = now() where id = $1", [lessonId]);
      expect(await attempt(db, addLesson, [space, route, moduleId])).toBeNull();
      await db.query("update modules set archived_at = now() where id = $1", [moduleId]);
      expect(await attempt(db, addModule, [space, route])).toBeNull();
    });
  });
});

describe("the hot paths' indexes", () => {
  it("exist, with these columns in this order", async () => {
    const rows = await query(
      URLS.migrator,
      `select indexname, indexdef from pg_indexes
        where schemaname = 'public'
          and tablename in ('modules', 'lessons', 'blocks', 'lesson_prerequisites', 'enrollments')`,
    );
    const defs = rows.map((row: { indexdef: string }) => row.indexdef.replace(INDEX_PREFIX, ""));
    for (const expected of [
      '(route_id, "position") WHERE (archived_at IS NULL)',
      '(module_id, "position") WHERE (archived_at IS NULL)',
      '(lesson_id, "position") WHERE (archived_at IS NULL)',
      '(route_id, module_id, "position")',
      "(route_id)",
    ]) {
      expect(defs).toContain(expected);
    }
    const tables = await query(
      URLS.migrator,
      `select tablename from pg_indexes where schemaname = 'public' and indexdef like '% USING btree (route_id)'`,
    );
    expect(tables.map((row: { tablename: string }) => row.tablename).sort()).toEqual([
      "enrollments",
      "lesson_prerequisites",
    ]);
  });
});
