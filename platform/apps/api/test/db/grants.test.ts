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
  // Only user.erase, as the migrator, deletes a user.
  user: ["INSERT", "SELECT", "UPDATE"],
  verification: READ_WRITE,
  // Tenancy. RLS (§3) narrows each to the rows a user may see.
  // A space and its first owner are made by the seed, as the migrator.
  memberships: ["INSERT", "SELECT"],
  platform_roles: ["SELECT"],
  spaces: ["SELECT", "UPDATE"],
  user_profiles: ["INSERT", "SELECT", "UPDATE"],
  // A route's draft: archived, never deleted. UPDATE is granted column by column.
  blocks: ["INSERT", "SELECT"],
  lesson_prerequisites: ["DELETE", "INSERT", "SELECT"],
  lessons: ["INSERT", "SELECT"],
  modules: ["INSERT", "SELECT"],
  routes: ["INSERT", "SELECT"],
  // Append-only, enforced by triggers too.
  route_versions: ["INSERT", "SELECT"],
  // Learning: a student's own rows.
  // Learning: a student's own rows. An enrollment is made and changed only
  // through security definer functions (§3).
  cards: ["INSERT", "SELECT"],
  enrollments: ["SELECT"],
  progress: ["INSERT", "SELECT"],
  reviews: ["INSERT", "SELECT"],
  // The record of who did what: append-only.
  action_log: ["INSERT", "SELECT"],
};

// The columns lr_app may update where it has no table-wide UPDATE. Never an id, a
// space, a parent, a route's revision or published version, or whose row it is.
const UPDATABLE_COLUMNS: Record<string, string[]> = {
  blocks: ["archived_at", "data", "kind", "position", "updated_at"],
  cards: [
    "difficulty",
    "due_at",
    "fsrs_params_version",
    "lapses",
    "last_review_at",
    "reps",
    "stability",
    "state",
    "updated_at",
  ],
  lessons: ["archived_at", "position", "title", "updated_at"],
  modules: ["archived_at", "position", "title", "updated_at"],
  progress: ["blocks", "completed_at", "status", "updated_at"],
  routes: [
    "access",
    "archived_at",
    "description",
    "pricing",
    "slug",
    "source_locale",
    "title",
    "updated_at",
  ],
};

describe("lr_app's column privileges", () => {
  it("allow UPDATE on exactly these columns", async () => {
    const rows = await query(
      URLS.migrator,
      `select table_name, array_agg(column_name::text order by column_name) as columns
         from information_schema.column_privileges
        where grantee = 'lr_app' and privilege_type = 'UPDATE'
          and table_name not in (
            select table_name from information_schema.role_table_grants
             where grantee = 'lr_app' and privilege_type = 'UPDATE')
        group by table_name`,
    );
    const actual = Object.fromEntries(
      rows.map((row: { table_name: string; columns: string[] }) => [row.table_name, row.columns]),
    );
    expect(actual).toEqual(UPDATABLE_COLUMNS);
  });
});

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
