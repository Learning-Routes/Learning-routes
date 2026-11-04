import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { describe, expect, it } from "vitest";
import { underSavepoint } from "../../src/db/repos/shared";
import { rolledBack, URLS } from "./connect";

describe("underSavepoint", () => {
  it("undoes all its own work when it throws after an inner one was rolled back", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const orm = drizzle(db);
      await db.query("create temp table written (n int) on commit drop");
      await expect(
        underSavepoint(orm, async () => {
          await orm.execute(sql`insert into written values (1)`);
          await underSavepoint(orm, () => Promise.reject(new Error("inner"))).catch(() => null);
          throw new Error("outer");
        }),
      ).rejects.toThrow("outer");
      const { rows } = await db.query("select count(*)::int as n from written");
      expect(rows[0]?.n).toBe(0);
    });
  });
});
