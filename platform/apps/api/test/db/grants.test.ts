import { describe, expect, it } from "vitest";
import { query, URLS } from "./connect";

// lr_app's privileges, table by table (Platform STEP 2 §1.1, §2): exactly these,
// granted by migrations. A table missing here, or a privilege added, fails.
const READ_WRITE = ["DELETE", "INSERT", "SELECT", "UPDATE"];
const EXPECTED: Record<string, string[]> = {
  // Better Auth's tables, used only by src/auth/.
  account: READ_WRITE,
  rate_limit: READ_WRITE,
  session: READ_WRITE,
  user: READ_WRITE,
  verification: READ_WRITE,
  // Tenancy. RLS (§3) narrows each to the rows a user may see.
  memberships: READ_WRITE,
  platform_roles: ["SELECT"],
  spaces: ["INSERT", "SELECT", "UPDATE"],
  user_profiles: ["INSERT", "SELECT", "UPDATE"],
  // A route's draft: archived, never deleted.
  blocks: ["INSERT", "SELECT", "UPDATE"],
  lesson_prerequisites: ["DELETE", "INSERT", "SELECT"],
  lessons: ["INSERT", "SELECT", "UPDATE"],
  modules: ["INSERT", "SELECT", "UPDATE"],
  routes: ["INSERT", "SELECT", "UPDATE"],
  // Append-only, enforced by triggers too.
  route_versions: ["INSERT", "SELECT"],
};

describe("lr_app's table privileges", () => {
  it("are exactly the ones the migrations grant", async () => {
    const rows = await query(
      URLS.migrator,
      `select table_name, array_agg(privilege_type::text order by privilege_type) as privileges
         from information_schema.role_table_grants
        where grantee = 'lr_app'
        group by table_name`,
    );
    const actual = Object.fromEntries(
      rows.map((row: { table_name: string; privileges: string[] }) => [
        row.table_name,
        row.privileges,
      ]),
    );
    expect(actual).toEqual(EXPECTED);
  });
});
