import { dayOf, monthOf, type Seat } from "./conversation";
import type { SpendBook } from "./model";

// What a space's assistant has spent (Platform STEP 10 §4.3), in the object's own SQLite: the
// space's month, this creator's day in it, and the space's calls of the last minute.

/** The object's tagged-template SQL. */
export type Sql = <T = Record<string, string | number | boolean | null>>(
  strings: TemplateStringsArray,
  ...values: (string | number | boolean | null)[]
) => T[];

export function spendBook(sql: Sql, seat: Seat): SpendBook {
  return {
    spent: (now) => {
      const [row] = sql<{ month: number; userToday: number }>`select
        coalesce(sum(case when month = ${monthOf(now)} and is_charged = 1 then microcents end), 0) as month,
        coalesce(sum(case when day = ${dayOf(now)} and is_charged = 1 and conversation_id in
          (select id from conversations where user_id = ${seat.userId}) then microcents end), 0) as userToday
        from spend`;
      const lastMinute = sql<{ at: number }>`select at from spend where at > ${now - 60_000}`.map(
        (call) => call.at,
      );
      return { month: row?.month ?? 0, userToday: row?.userToday ?? 0, lastMinute };
    },
    record: (row) => {
      const now = Date.now();
      sql`insert into spend (at, month, day, conversation_id, model, prompt_tokens, cached_tokens,
        completion_tokens, microcents, is_charged) values (${now}, ${monthOf(now)}, ${dayOf(now)},
        ${seat.conversationId}, ${row.model}, ${row.promptTokens}, ${row.cachedTokens},
        ${row.completionTokens}, ${row.microcents}, ${row.isCharged ? 1 : 0})`;
      console.log(JSON.stringify({ message: "studio model call", ...row }));
    },
  };
}
