// A space's monthly budget for its assistant (Platform STEP 10 §4.3), in the gate's microcents. The
// numbers live in the agent's config; this only reads them. Pure.

/** From this share left, the assistant tells the creator the month's help is running low. */
const LOW_SHARE = 0.2;

export type Budget = "ok" | "low" | "out";

export function budgetOf(spentThisMonth: number, monthly: number): Budget {
  if (!(Number.isFinite(monthly) && monthly > 0) || spentThisMonth >= monthly) {
    return "out";
  }
  return monthly - spentThisMonth <= monthly * LOW_SHARE ? "low" : "ok";
}

/** The month a spend counts in, as "YYYY-MM" in UTC. */
export function monthOf(at: number): string {
  return new Date(at).toISOString().slice(0, 7);
}

/** Model calls a space's assistant may make in a minute: a flood of messages cannot outrun it. */
export const CALLS_PER_MINUTE = 12;

export interface AgentLimits {
  /** Each space's assistant, a month. */
  spaceMonthly: number;
  /** Each creator, a day, in one space. */
  userDaily: number;
  /** Every assistant together, a day. */
  daily: number;
  perMinute: number;
}

const WHOLE = /^[1-9]\d*$/;

/** The limits from the agent's config, in microcents; null when any is missing or malformed. */
export function limitsOf(given: {
  spaceMonthly: string | undefined;
  userDaily: string | undefined;
  daily: string | undefined;
}): AgentLimits | null {
  const values = [given.spaceMonthly, given.userDaily, given.daily];
  if (!values.every((value) => value !== undefined && WHOLE.test(value))) {
    return null;
  }
  const [spaceMonthly, userDaily, daily] = values.map(Number) as [number, number, number];
  return [spaceMonthly, userDaily, daily].every(Number.isSafeInteger)
    ? { spaceMonthly, userDaily, daily, perMinute: CALLS_PER_MINUTE }
    : null;
}
