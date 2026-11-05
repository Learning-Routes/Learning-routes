# ADR 0010: Neon's free plan until the first paid student

Status: accepted, 5 November 2026 (owner decision). It sets [ADR 0005](0005-planetscale-postgres.md) aside until the first paid student, and leaves it in force after that.

## Context

The owner wants to test the MCP and the public pages live before paying for a database. PlanetScale can't be used yet. Neon's free plan costs nothing and needs no card, and it is plain Postgres 18 with `pg_trgm`.

## Decision

Production runs on a Neon free project in AWS us-east-1, the region the Workers' placement hint already names, until the first paid student. Before that student, it moves to PlanetScale.

- **The code doesn't change.** The Workers reach the database through Hyperdrive with `pg`, so the move is a dump, a restore and new Hyperdrive connections.
- **The roles are the same.** `lr_migrator`, `lr_app` and `lr_public` are made with SQL. Neon gives a role made with SQL no membership of `neon_superuser`, so `lr_app` and `lr_public` bypass nothing and inherit nothing. Neon's own default role, `lr_owner`, isn't used by anything we run.
- **TLS stays strict.** Both Hyperdrive configs use `verify-full` with ISRG Root X1, the root Neon's certificate chains to.

## What we accept until then

| Limit on the free plan | What it means |
|---|---|
| Restore history of 6 hours, limited to 1 GB of changes | A mistake noticed later than that can't be undone. No real student's data belongs here |
| 100 compute hours a month | If they run out, the compute stops until the next month, and the site can't read or write |
| 5 GB of network transfer a month | The same: the compute stops until the next month |
| 1 GB of storage | Writes are blocked past it |
| Scales to zero after 5 minutes, and can't be turned off | The first query after a pause waits for the compute to start |
| No uptime promise | Fine for testing, not for people who paid |

## Consequences

- The move to PlanetScale comes before charging anyone. `docs/runbooks/database.md` has the steps.
- ADR 0005's reasons against Neon still hold for a paying product, which is why this is temporary.
