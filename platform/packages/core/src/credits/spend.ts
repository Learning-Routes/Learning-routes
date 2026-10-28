import { type CostEstimate, MICROCENTS_PER_CENT } from "./cost";

// Whether a paid call may happen. Pure: the caller passes today's spend and the
// times of the calls that used a rate slot, and stores the result (STEP 46). Every
// paid call goes through this one verdict (lesson 2).

/** v1's ceilings: 5,000¢ a day for everyone, 500¢ a day per user. */
export const V1_LIMITS = {
  dailyMicrocents: 5_000 * MICROCENTS_PER_CENT,
  userDailyMicrocents: 500 * MICROCENTS_PER_CENT,
} as const;

const RATE_LIMITS_PER_MINUTE: Record<string, number> = {
  "gpt-5.2": 60,
  "gpt-4.1-mini": 120,
  "claude-opus-4-5": 40,
  "claude-haiku-4-5": 200,
  "claude-sonnet-4-5": 80,
  elevenlabs: 20,
  "gpt-image-1": 30,
};

/** Calls a minute v1 allowed a model, or null when it set no limit. */
export function rateLimitPerMinute(model: string): number | null {
  return Object.hasOwn(RATE_LIMITS_PER_MINUTE, model)
    ? (RATE_LIMITS_PER_MINUTE[model] as number)
    : null;
}

const WINDOW_MS = 60_000;

export interface SpendLimits {
  dailyMicrocents: number;
  userDailyMicrocents: number;
  /** Calls a minute for this model, or null for none. */
  ratePerMinute: number | null;
}

export interface SpendRequest {
  limits: SpendLimits;
  /** Billable spend so far today; userToday is null when the call has no user. */
  spend: { globalToday: number; userToday: number | null };
  /** When each earlier call that consumed a rate slot happened (epoch ms). */
  consumedAt: readonly number[];
  /** The estimated cost of this call; an unknown cost is refused. */
  estimate: CostEstimate;
  now: number;
}

export type SpendReason = "unknown_cost" | "rate_limit" | "daily_budget" | "user_budget";

export interface SpendDecision {
  verdict: "allowed" | "refused";
  reason: SpendReason | null;
  /** Whether the caller must record this call against the rate window. */
  consumesRateSlot: boolean;
}

// A sliding window: the earlier calls from now - 60 s on. v1's window was fixed, so
// a burst across its edge allowed twice the limit within seconds (ADR 0003). An
// earlier call in the same millisecond as now still counts.
function callsInWindow(consumedAt: readonly number[], now: number): number {
  return consumedAt.filter((at) => at >= now - WINDOW_MS && at <= now).length;
}

/**
 * The verdict for one paid call: a call whose cost is unknown is refused first,
 * then come the rate limit, the daily ceiling and the user's. Only an allowed call
 * uses a rate slot: a refused one never reached the provider (ADR 0003). Replaces
 * v1 `AiOrchestrator::SpendGuard#call`.
 */
export function decideSpend(request: SpendRequest): SpendDecision {
  const { limits, spend, consumedAt, estimate, now } = request;
  const limited = limits.ratePerMinute !== null;
  const refuse = (reason: SpendReason): SpendDecision => ({
    verdict: "refused",
    reason,
    consumesRateSlot: false,
  });

  if (estimate.kind === "unknown") return refuse("unknown_cost");
  if (limited && callsInWindow(consumedAt, now) + 1 > (limits.ratePerMinute as number)) {
    return refuse("rate_limit");
  }

  if (spend.globalToday >= limits.dailyMicrocents) return refuse("daily_budget");
  if (spend.userToday !== null && spend.userToday >= limits.userDailyMicrocents)
    return refuse("user_budget");
  return { verdict: "allowed", reason: null, consumesRateSlot: limited };
}
