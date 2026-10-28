import { describe, expect, it } from "vitest";
import { migrate, plan, TIMEOUTS } from "../../scripts/migrate";
import { query, URLS } from "./connect";

const DRIZZLE = new URL("../../drizzle", import.meta.url);

describe("planning one migration file", () => {
  it("runs a file in one transaction, with both timeouts, and records it", () => {
    const sql = "create table a (id int);\n--> statement-breakpoint\ncreate table b (id int);\n";
    expect(plan("0001_tables", sql)).toEqual([
      "begin",
      `set local lock_timeout = '${TIMEOUTS.lock}'`,
      `set local statement_timeout = '${TIMEOUTS.statement}'`,
      "create table a (id int);",
      "create table b (id int);",
      "insert into meta.migrations (tag) values ('0001_tables')",
      "commit",
    ]);
  });

  it("runs a file marked -- no-transaction outside one, for CREATE INDEX CONCURRENTLY", () => {
    const sql = "-- no-transaction\ncreate index concurrently a_id on a (id);\n";
    expect(plan("0002_index", sql)).toEqual([
      `set lock_timeout = '${TIMEOUTS.lock}'`,
      `set statement_timeout = '${TIMEOUTS.statement}'`,
      "-- no-transaction\ncreate index concurrently a_id on a (id);",
      "insert into meta.migrations (tag) values ('0002_index')",
    ]);
  });
});

describe("pnpm db:migrate on the local database", () => {
  it("applies nothing twice", async () => {
    await migrate(URLS.migrator, DRIZZLE);
    expect(await migrate(URLS.migrator, DRIZZLE)).toEqual([]);
  });

  it("creates the app schema, which lr_app may use but not create in", async () => {
    const [privileges] = await query(
      URLS.app,
      "select has_schema_privilege('app', 'usage') as usage, has_schema_privilege('app', 'create') as create",
    );
    expect(privileges).toEqual({ usage: true, create: false });
  });
});
