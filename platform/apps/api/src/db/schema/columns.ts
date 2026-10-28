import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

// Columns every table shares (Platform STEP 2 §2): uuidv7 ids made by Postgres,
// and times as timestamptz. Column names come from the keys, in snake_case.
export const id = () => uuid().primaryKey().default(sql`uuidv7()`);
const time = () => timestamp({ withTimezone: true });
export const createdAt = () => time().notNull().defaultNow();
/** Set by the repository on every change; the default covers the insert. */
export const updatedAt = () => time().notNull().defaultNow();
export const archivedAt = () => time();

/** A SQL list of string literals, for a check against one of core's enums. */
export const oneOf = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", "));
