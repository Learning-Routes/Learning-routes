import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { query, rolledBack, URLS } from "./connect";

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
  // The OAuth provider's, in the MCP Worker (Platform STEP 5 §2).
  jwks: READ_WRITE,
  oauth_client: READ_WRITE,
  oauth_resource: READ_WRITE,
  oauth_client_resource: READ_WRITE,
  oauth_refresh_token: READ_WRITE,
  oauth_access_token: READ_WRITE,
  oauth_consent: READ_WRITE,
  oauth_client_assertion: READ_WRITE,
  connection_uses: READ_WRITE,
  // Read as nobody by /empezar, to name a route before signing in.
  public_routes: ["SELECT"],
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
  // Requests are made here; only an operator or a withdrawing owner changes one (RLS).
  catalog_listings: ["INSERT", "SELECT"],
  // Anyone may apply, with no account; only an operator reads or decides (RLS).
  creator_applications: ["INSERT", "SELECT"],
  enrollments: ["SELECT"],
  progress: ["INSERT", "SELECT"],
  reviews: ["INSERT", "SELECT"],
  // A space's files on the content host: kept, never changed (Platform STEP 9 §2).
  stored_files: ["INSERT", "SELECT"],
  // The record of who did what: append-only.
  action_log: ["INSERT", "SELECT"],
};

// The columns lr_app may update where it has no table-wide UPDATE. Never an id, a
// space, a parent, a route's revision or published version, or whose row it is.
const UPDATABLE_COLUMNS: Record<string, string[]> = {
  blocks: ["archived_at", "data", "kind", "position", "updated_at"],
  catalog_listings: [
    "decided_at",
    "decided_by",
    "decided_version",
    "featured_position",
    "note",
    "status",
  ],
  creator_applications: ["decided_at", "status"],
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
    "currency",
    "description",
    "level",
    "price_minor",
    "pricing",
    "slug",
    "source_locale",
    "title",
    "topic",
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

// The runbook re-runs this file after a restore, which resets lr_app's grants.
const GRANTS_FILES = [
  "0013_app_grants",
  "0016_catalog_grants",
  "0023_start_grants",
  "0025_create_space_grants",
  "0027_oauth_grants",
  "0031_invitation_grants",
  "0036_stored_files_grants",
].map((tag) => new URL(`../../drizzle/${tag}.sql`, import.meta.url));
const PRIVILEGES = `select coalesce(string_agg(entry, ',' order by entry), '')
                      as all
                 from (select format('%s %s %s', table_name, column_name, privilege_type) as entry
                         from information_schema.column_privileges
                        where grantee = 'lr_app'
                       union all
                       select format('%s %s', routine_name, privilege_type) from information_schema.routine_privileges
                        where grantee = 'lr_app') as granted`;

describe("the grants file", () => {
  it("revokes everything from lr_app and grants the same set again, however often it runs", async () => {
    const sql = GRANTS_FILES.map((file) =>
      readFileSync(file, "utf8").replaceAll("--> statement-breakpoint", ""),
    ).join("\n");
    const before = (await query(URLS.migrator, PRIVILEGES))[0]?.all;
    await rolledBack(URLS.migrator, async (db) => {
      await db.query("revoke all on all tables in schema public from lr_app");
      await db.query(sql);
      await db.query(sql);
      const { rows } = await db.query(PRIVILEGES);
      expect(rows[0]?.all).toBe(before);
    });
  });
});
