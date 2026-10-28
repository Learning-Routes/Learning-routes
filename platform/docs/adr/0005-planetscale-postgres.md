# ADR 0005: PlanetScale Postgres instead of Neon

**Status:** accepted, 28 October 2026 (owner decision).

## Decision

The platform's database is **PlanetScale Postgres**, reached from Workers through **Hyperdrive** with **Drizzle** and `pg`.

- **Engine:** Postgres 18. Not Vitess, PlanetScale's MySQL engine.
- **Connection:** Hyperdrive with the `pg` driver, the same way any Postgres is reached. Not PlanetScale's serverless driver: the code stays plain Postgres.
- **Roles:** no superuser.
  - PlanetScale's default role has `BYPASSRLS`. It runs the migrations and nothing else.
  - The Worker connects as its own role. That role inherits no predefined data role (no `pg_write_all_data`), owns no table, and gets grants table by table. Platform STEP 2 defines them.
- **Caching:** Hyperdrive's query cache never serves anything a write must invalidate, such as sessions, permissions or a draft being edited. The Worker's Hyperdrive configuration has caching off; a cached read path, if one is ever needed, gets a configuration of its own.
- **The database is regional:** the Worker that talks to it carries a placement hint for the database's region, so a request does not cross an ocean for every query.
- **No scale to zero and no free branches:** CI runs against a local Postgres 18, and only staging and production run on PlanetScale.

## Why

PlanetScale runs Postgres with steady latency and a path to high availability, which the platform needs for heavy traffic. Nothing in the code depended on Neon: the switch costs only documents.

## What would make us move

A dump, a restore elsewhere and a new Hyperdrive configuration. Drizzle, `pg`, the migrations and the code stay the same, because nothing here uses a PlanetScale-only feature or driver.

## What it supersedes

- ADR 0001, "Postgres on Neon, reached through Hyperdrive, with Drizzle as the query layer", and "Neon and Hyperdrive keep Postgres, which v1 already uses, without running it ourselves."
- ADR 0004, "Shared data (spaces, routes, enrollments, the credit ledger) is in Postgres on Neon."

`docs/architecture/2026-10-architecture-study.md` still says Neon. It is a dated record and stays as written.
