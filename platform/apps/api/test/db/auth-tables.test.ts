import { describe, expect, it } from "vitest";
import { query, URLS } from "./connect";

const AUTH_TABLES = ["account", "rate_limit", "session", "user", "verification"];

describe("Better Auth's tables (Platform STEP 2 §2.1)", () => {
  it("exist, generated from the auth options", async () => {
    const rows = await query(
      URLS.migrator,
      "select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1) order by 1",
      [AUTH_TABLES],
    );
    expect(rows.map((row: { table_name: string }) => row.table_name)).toEqual(AUTH_TABLES);
  });

  it("key users by uuid, made by Postgres as uuidv7", async () => {
    const [column] = await query(
      URLS.migrator,
      `select data_type, column_default from information_schema.columns
        where table_schema = 'public' and table_name = 'user' and column_name = 'id'`,
    );
    expect(column).toEqual({ data_type: "uuid", column_default: "uuidv7()" });
  });

  it("store every time as timestamptz", async () => {
    const rows = await query(
      URLS.migrator,
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public' and table_name = any($1)
          and data_type = 'timestamp without time zone'`,
      [AUTH_TABLES],
    );
    expect(rows).toEqual([]);
  });
});
