# ADR 0006: No foreign key crosses spaces

**Status:** accepted, 28 October 2026 (Platform STEP 2).

## Decision

Every row that belongs to a space carries `space_id`, and a foreign key between two such tables names the space on both sides.

- Each parent has `unique (id, space_id)`, or a wider unique key that includes `space_id`.
- Each child references it with a composite key: `(route_id, space_id) references routes (id, space_id)`.
- A key that is not a relationship stays a plain column with no foreign key. A fork's `forked_from_*` columns, which may name a route in another space, are like this, and so are the actor of an action log entry and the publisher of a version.

`test/db/space-boundary.test.ts` reads the Drizzle schema and fails on any foreign key between two tables with `space_id` that leaves it out.

## Why

Many creators share one database, so a row in the wrong space is a data leak. With a composite key, a child's space can never disagree with its parent's: the database refuses the row, whatever the code above it does. Tenancy's two fences (`core`'s permission check and Postgres's row-level security) can then trust `space_id` on every row.

## What it costs

- Composite keys are wider, and each parent carries one more unique index.
- Moving content between spaces is not an update. It is a fork: a copy into the other space, with provenance kept in plain columns.
