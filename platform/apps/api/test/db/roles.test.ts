import { describe, expect, it } from "vitest";
import { query, URLS } from "./connect";

// Platform STEP 2 §1.1: the local roles mirror PlanetScale's. The migrator bypasses
// RLS and owns the schema; the Worker's role bypasses nothing, owns nothing and
// inherits no predefined role, so only per-table grants give it anything.
const PERMISSION_DENIED = /permission denied/;

describe("the local database's roles", () => {
  it("lr_app bypasses no RLS and is no superuser", async () => {
    const [role] = await query(
      URLS.app,
      "select rolbypassrls, rolsuper, rolcreaterole, rolcreatedb from pg_roles where rolname = current_user",
    );
    expect(role).toEqual({
      rolbypassrls: false,
      rolsuper: false,
      rolcreaterole: false,
      rolcreatedb: false,
    });
  });

  it("lr_app inherits no role, in particular not pg_read_all_data or pg_write_all_data", async () => {
    const rows = await query(
      URLS.app,
      `select r.rolname from pg_auth_members m
         join pg_roles r on r.oid = m.roleid
         join pg_roles u on u.oid = m.member
        where u.rolname = current_user`,
    );
    expect(rows).toEqual([]);
  });

  it("lr_app owns nothing", async () => {
    const rows = await query(
      URLS.app,
      `select c.relname from pg_class c join pg_roles r on r.oid = c.relowner
        where r.rolname = current_user
       union all
       select n.nspname from pg_namespace n join pg_roles r on r.oid = n.nspowner
        where r.rolname = current_user`,
    );
    expect(rows).toEqual([]);
  });

  it("lr_app cannot create objects in the public schema", async () => {
    await expect(query(URLS.app, "create table app_should_not_create (id int)")).rejects.toThrow(
      PERMISSION_DENIED,
    );
  });

  it("lr_migrator bypasses RLS, is no superuser, and owns the public schema", async () => {
    const [role] = await query(
      URLS.migrator,
      `select rolbypassrls, rolsuper,
              (select nspowner::regrole::text from pg_namespace where nspname = 'public') as public_owner
         from pg_roles where rolname = current_user`,
    );
    expect(role).toEqual({ rolbypassrls: true, rolsuper: false, public_owner: "lr_migrator" });
  });

  it("a new table gives lr_app nothing until a migration grants it", async () => {
    const rows = await query(
      URLS.migrator,
      `create temp table default_privileges_probe (id int);
       select has_table_privilege('lr_app', 'default_privileges_probe', 'select, insert, update, delete') as granted`,
    );
    expect(rows).toEqual([{ granted: false }]);
  });
});
