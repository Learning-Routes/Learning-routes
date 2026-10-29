import { ACTOR_KINDS } from "@learning-routes/core/actions/actor";
import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, oneOf } from "./columns";
import { spaces } from "./tenancy";

// The record of who did what (Platform STEP 2 §2.15). runAction writes it in the
// action's own transaction. Append-only, and a log: never derive state from it.

export const actionLog = pgTable(
  "action_log",
  {
    id: id(),
    spaceId: uuid()
      .notNull()
      .references(() => spaces.id),
    // No foreign key, so erasing the user leaves the record whole.
    actorUserId: uuid().notNull(),
    actorVia: text().notNull(),
    agentRunId: uuid(),
    action: text().notNull(),
    // Secrets and free text are redacted by core before the insert.
    input: jsonb().notNull(),
    outcome: text().notNull(),
    routeRevision: bigint({ mode: "number" }),
    at: createdAt(),
  },
  (t) => [
    index("action_log_space_id_at_idx").on(t.spaceId, t.at),
    check("action_log_actor_via", sql`${t.actorVia} in (${oneOf(ACTOR_KINDS)})`),
  ],
);
