-- The roles of the local database, mirroring PlanetScale's (ADR 0005). Runs once,
-- as the image's superuser, when the volume is first created; CI runs it on its
-- service container. LOCAL ONLY: the passwords are fixed development values.

-- PlanetScale's default role: bypasses RLS, owns the schema, runs the migrations.
-- Tests never connect as it, except to migrate and to prove what it cannot do.
create role lr_migrator login bypassrls password 'local-only-migrator';

-- The Worker's role. It bypasses nothing, owns nothing and inherits no role: in
-- particular not pg_read_all_data or pg_write_all_data, which grant every table and
-- which a per-table revoke cannot take back. Only the migrations' per-table grants
-- give it anything.
create role lr_app login noinherit password 'local-only-app';

alter database learning_routes owner to lr_migrator;
revoke all on database learning_routes from public;
grant connect on database learning_routes to lr_app;

alter schema public owner to lr_migrator;
revoke create on schema public from public;
grant usage on schema public to lr_app;
