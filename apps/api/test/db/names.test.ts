import { is } from "drizzle-orm";
import { toSnakeCase } from "drizzle-orm/casing";
import {
  boolean,
  getTableConfig,
  integer,
  PgTable,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as content from "../../src/db/schema/content";
import * as learning from "../../src/db/schema/learning";
import * as log from "../../src/db/schema/log";
import * as tenancy from "../../src/db/schema/tenancy";
import * as versions from "../../src/db/schema/versions";

// Database names follow FOUNDATIONS.md §4b (Platform STEP 2 §2.17): tables are
// snake_case plural nouns, foreign keys <entity>_id, times <event>_at, booleans
// is_<state>. Better Auth's own tables (schema/auth.ts) are exempt.

const SNAKE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const FOREIGN_KEY = /_id$/;
const VERSION_REFERENCE = /_version$/;
const TIME = /^([a-z0-9_]+_)?at$/;
const BOOLEAN = /^is_[a-z0-9_]+$/;
// Mass nouns, which have no plural: one table holds all of the progress, or the log.
const MASS_NOUNS = new Set(["progress", "action_log"]);

function violations(table: PgTable): string[] {
  const { name, columns, foreignKeys } = getTableConfig(table);
  const found: string[] = [];
  if (!(SNAKE.test(name) && (name.endsWith("s") || MASS_NOUNS.has(name)))) {
    found.push(`table ${name}: not a snake_case plural noun`);
  }
  for (const column of columns) {
    const columnName = toSnakeCase(column.name);
    if (!SNAKE.test(columnName)) {
      found.push(`${name}.${columnName}: not snake_case`);
    }
    if (column.columnType === "PgTimestamp" && !TIME.test(columnName)) {
      found.push(`${name}.${columnName}: a time not named <event>_at`);
    }
    if (column.columnType === "PgBoolean" && !BOOLEAN.test(columnName)) {
      found.push(`${name}.${columnName}: a boolean not named is_<state>`);
    }
  }
  for (const foreignKey of foreignKeys) {
    const { columns: local, foreignColumns } = foreignKey.reference();
    local.forEach((column, i) => {
      const columnName = toSnakeCase(column.name);
      const target = toSnakeCase(foreignColumns[i]?.name ?? "");
      const expected = target === "version" ? VERSION_REFERENCE : FOREIGN_KEY;
      if (!expected.test(columnName)) {
        found.push(`${name}.${columnName}: a foreign key not named <entity>_id`);
      }
    });
  }
  return found;
}

const TABLES = [content, learning, log, tenancy, versions].flatMap((module) =>
  Object.values(module).filter((value): value is PgTable => is(value, PgTable)),
);

describe("database names (FOUNDATIONS.md §4b)", () => {
  it("reads every table of the schema", () => {
    expect(TABLES.length).toBeGreaterThanOrEqual(15);
  });

  it("finds each kind of bad name", () => {
    const parents = pgTable("parents", { id: uuid().primaryKey() });
    const bad = pgTable("Child", {
      parent: uuid().references(() => parents.id),
      started: timestamp(),
      enabled: boolean(),
      count: integer(),
    });
    expect(violations(bad)).toEqual([
      "table Child: not a snake_case plural noun",
      "Child.started: a time not named <event>_at",
      "Child.enabled: a boolean not named is_<state>",
      "Child.parent: a foreign key not named <entity>_id",
    ]);
  });

  it("finds none in the schema", () => {
    expect(TABLES.flatMap(violations)).toEqual([]);
  });
});
