import { describe, expect, it } from "vitest";
import { query, URLS } from "./connect";

// The database fence is no looser than core's permission table (Platform STEP 2
// review, item 1). Each statement runs as lr_app and must be refused for lack of
// privilege, whatever rows it would touch; `where false` keeps it from touching any.

const PERMISSION_DENIED = /permission denied/;

const LOCKED_COLUMNS: Record<string, string[]> = {
  routes: [
    "id",
    "space_id",
    "draft_revision",
    "latest_published_version",
    "forked_from_space_id",
    "forked_from_route_id",
    "forked_from_version",
  ],
  modules: ["id", "space_id", "route_id"],
  lessons: ["id", "space_id", "route_id", "module_id"],
  blocks: ["id", "space_id", "lesson_id"],
  progress: ["space_id", "enrollment_id", "user_id", "lesson_id"],
  cards: ["id", "space_id", "user_id", "item_id"],
  enrollments: ["space_id", "route_id", "user_id", "pinned_version", "status"],
  memberships: ["space_id", "user_id", "role"],
};

const REFUSED = [
  "insert into spaces (slug, name, default_locale, locales) select 'x', '{}', 'en', '{en}' where false",
  "insert into enrollments (space_id, route_id, user_id, pinned_version, status) select uuidv7(), uuidv7(), uuidv7(), 1, 'active' where false",
  "delete from memberships where false",
];

describe("lr_app cannot change what only a security definer path may", () => {
  for (const [table, columns] of Object.entries(LOCKED_COLUMNS)) {
    for (const column of columns) {
      it(`refuses UPDATE of ${table}.${column}`, async () => {
        await expect(
          query(URLS.app, `update ${table} set ${column} = ${column} where false`),
        ).rejects.toThrow(PERMISSION_DENIED);
      });
    }
  }

  for (const statement of REFUSED) {
    it(`refuses ${statement.split(" ").slice(0, 3).join(" ")}`, async () => {
      await expect(query(URLS.app, statement)).rejects.toThrow(PERMISSION_DENIED);
    });
  }
});
