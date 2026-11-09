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
