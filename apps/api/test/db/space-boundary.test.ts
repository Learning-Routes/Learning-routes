import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as content from "../../src/db/schema/content";
import * as learning from "../../src/db/schema/learning";
import * as log from "../../src/db/schema/log";
import * as tenancy from "../../src/db/schema/tenancy";
import * as versions from "../../src/db/schema/versions";

// No foreign key crosses spaces (ADR 0006): between two tables that both carry
// space_id, a foreign key includes space_id on both sides, so a child's space can
// never differ from its parent's.

const TABLES = [content, learning, log, tenancy, versions].flatMap((module) =>
  Object.values(module).filter((value): value is PgTable => is(value, PgTable)),
);

const hasSpace = (table: PgTable) =>
  getTableConfig(table).columns.some((column) => column.name === "spaceId");

describe("foreign keys stay inside a space (ADR 0006)", () => {
  it("include space_id whenever both tables carry it", () => {
    const crossing = TABLES.flatMap((table) =>
      getTableConfig(table)
        .foreignKeys.filter((foreignKey) => {
          const { columns, foreignColumns, foreignTable } = foreignKey.reference();
          if (!(hasSpace(table) && hasSpace(foreignTable))) {
            return false;
          }
          const pairs = columns.map((column, i) => [column.name, foreignColumns[i]?.name]);
          return !pairs.some(([local, foreign]) => local === "spaceId" && foreign === "spaceId");
        })
        .map((foreignKey) => foreignKey.getName()),
    );
    expect(crossing).toEqual([]);
  });
});
