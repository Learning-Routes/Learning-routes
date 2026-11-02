import { describe, expect, it } from "vitest";
import { query, URLS } from "./connect";

// The second fence (Platform STEP 2 §3.4–§3.7): row-level security on every table
// with space_id or user_id, Better Auth's apart.
const TENANT_TABLES = [
  "action_log",
  "blocks",
  "cards",
  "enrollments",
  "lesson_prerequisites",
  "lessons",
  "memberships",
  "modules",
  "platform_roles",
  "progress",
  "reviews",
  "route_versions",
  "routes",
  "spaces",
  "user_profiles",
];

describe("row-level security", () => {
  it("covers every table with space_id or user_id, apart from Better Auth's", async () => {
    const rows = await query(
      URLS.migrator,
      `select distinct table_name from information_schema.columns
        where table_schema = 'public' and column_name in ('space_id', 'user_id')
          and table_name not in ('session', 'account')
        union select 'spaces' order by 1`,
    );
    expect(rows.map((row: { table_name: string }) => row.table_name)).toEqual(TENANT_TABLES);
  });

  it("is enabled and forced on each, except memberships, which the member helper reads", async () => {
    const rows = await query(
      URLS.migrator,
      `select relname, relrowsecurity, relforcerowsecurity from pg_class
        where relnamespace = 'public'::regnamespace and relname = any($1) order by relname`,
      [TENANT_TABLES],
    );
    for (const row of rows) {
      expect([row.relname, row.relrowsecurity, row.relforcerowsecurity]).toEqual([
        row.relname,
        true,
        row.relname !== "memberships",
      ]);
    }
    expect(rows).toHaveLength(TENANT_TABLES.length);
  });

  it("gives every policy USING and WITH CHECK where its command takes them", async () => {
    const policies = await query(
      URLS.migrator,
      "select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname = 'public'",
    );
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      const needsUsing = policy.cmd !== "INSERT";
      const needsCheck = policy.cmd === "INSERT" || policy.cmd === "UPDATE" || policy.cmd === "ALL";
      expect([policy.policyname, needsUsing ? policy.qual !== null : true]).toEqual([
        policy.policyname,
        true,
      ]);
      expect([policy.policyname, needsCheck ? policy.with_check !== null : true]).toEqual([
        policy.policyname,
        true,
      ]);
    }
  });

  it("reads memberships through one hardened helper: security definer, pinned search_path, lr_app only", async () => {
    const [helper] = await query(
      URLS.migrator,
      `select p.prosecdef, p.provolatile, p.proconfig, pg_get_userbyid(p.proowner) as owner,
              has_function_privilege('lr_app', p.oid, 'execute') as app,
              has_function_privilege('public', p.oid, 'execute') as everyone
         from pg_proc p where p.oid = 'app.member_space_ids(text[])'::regprocedure`,
    );
    expect(helper).toEqual({
      prosecdef: true,
      provolatile: "s",
      proconfig: ["search_path=pg_catalog, public"],
      owner: "lr_migrator",
      app: true,
      everyone: false,
    });
  });
});
