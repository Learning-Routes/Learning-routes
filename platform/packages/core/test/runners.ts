import { parseLesson } from "../src/content/parser";
import { type CostEstimate, estimateCost } from "../src/credits/cost";
import {
  decideSpend,
  rateLimitPerMinute,
  type SpendDecision,
  V1_LIMITS,
} from "../src/credits/spend";
import { type Card, FsrsDomainError, interval, retrievability, review } from "../src/learning/fsrs";
import type { Locale } from "../src/text";

// Each golden case, run through the port and answered in v1's output shape. The
// port tests compare these answers with the fixtures; when an ADR 0003 fix changes
// an answer on purpose, the same runner produces the new output that is recorded.

const DAY = 86_400_000;
export const FROZEN = Date.parse("2026-10-26T12:00:00Z");

// ── fsrs.json ──────────────────────────────────────────────────────

interface Start {
  fsrs_state?: string;
  fsrs_reps?: number;
  fsrs_lapses?: number;
  fsrs_stability?: number;
  fsrs_difficulty?: number;
  days_ago?: number | null;
}

function cardFrom(start: Start | null): Card {
  return {
    state: start?.fsrs_state ? (start.fsrs_state.replace("fsrs_", "") as Card["state"]) : null,
    reps: start?.fsrs_reps ?? 0,
    lapses: start?.fsrs_lapses ?? 0,
    stability: start?.fsrs_stability ?? 0,
    difficulty: start?.fsrs_difficulty ?? 0,
    lastReviewAt: start?.days_ago != null ? FROZEN - start.days_ago * DAY : null,
  };
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

export function runFsrs(input: unknown): unknown {
  const { kind } = input as { kind: string };
  if (kind === "next_interval") return interval((input as { stability: number }).stability);
  if (kind === "retrievability") {
    const { stability, elapsed_days } = input as { stability: number; elapsed_days: number | null };
    return retrievability(cardFrom({ fsrs_stability: stability, days_ago: elapsed_days }), FROZEN);
  }

  const { start, reviews } = input as {
    start: Start | null;
    reviews: { elapsed_days: number; rating: number }[];
  };
  let card = cardFrom(start);
  let now = FROZEN;
  const results: unknown[] = [];
  for (const step of reviews) {
    now += step.elapsed_days * DAY;
    const before = retrievability(card, now);
    try {
      const next = review(card, step.rating, now);
      results.push({
        fsrs_stability: next.card.stability,
        fsrs_difficulty: next.card.difficulty,
        fsrs_reps: next.card.reps,
        fsrs_lapses: next.card.lapses,
        fsrs_state: `fsrs_${next.card.state}`,
        fsrs_last_review_at: iso(next.card.lastReviewAt),
        fsrs_next_review_at: iso(next.nextReviewAt),
        fsrs_elapsed_days: next.elapsedDays,
        fsrs_scheduled_days: next.scheduledDays,
        retrievability_before: before,
      });
      card = next.card;
    } catch (error) {
      if (!(error instanceof FsrsDomainError)) throw error;
      results.push({ error: "FloatDomainError", message: error.message });
      break;
    }
  }
  return results;
}

// ── cost_estimate.json ─────────────────────────────────────────────

interface CostInput {
  model: string;
  input_tokens?: number;
  cached_tokens?: number;
  cache_write_tokens?: number;
  output_tokens?: number;
  image_input_tokens?: number;
  characters?: number;
  audio_seconds?: string | number;
}

const usageOf = (input: CostInput) => ({
  inputTokens: input.input_tokens,
  cachedTokens: input.cached_tokens,
  cacheWriteTokens: input.cache_write_tokens,
  outputTokens: input.output_tokens,
  imageInputTokens: input.image_input_tokens,
  characters: input.characters,
  audioSeconds: input.audio_seconds,
});

// v1's shape for a known cost is the number; an unknown cost is its own answer.
export function runCost(raw: unknown): unknown {
  const input = raw as CostInput;
  const estimate = estimateCost(input.model, usageOf(input));
  return estimate.kind === "known" ? estimate.microcents : estimate;
}

// ── spend_limits.json ──────────────────────────────────────────────
// The fixture records SpendGuard against rows in a database. This plays the
// caller STEP 46 will write: it turns v1's rows into today's totals, and keeps the
// times of the calls that consumed a rate slot.

const NOISE = 1_000_000;
// Noise rows billable today; the others (yesterday, unpriced, cached, failed) are not.
const COUNTS_GLOBALLY = new Set(["midnight_today", "other_user_today"]);
const COUNTS_FOR_USER = new Set(["midnight_today"]);

// v1's messages: the presentation of each refusal, translated in the app, not in core.
const MESSAGES: Record<string, (model: string) => string> = {
  daily_budget: () =>
    "We have reached today's limit for generating new content. Nothing has gone wrong — this resets tomorrow.",
  user_budget: () =>
    "You have reached your daily limit for generating new content. It resets tomorrow.",
  rate_limit: (model) => `Too many requests to ${model} right now. Please try again in a minute.`,
};

interface SpendInput {
  limit: string;
  usage?: CostInput;
  delta_microcents?: number;
  noise?: string;
  model?: string;
  calls?: number;
  pause_seconds?: number | null;
  /** Added by the sliding-window fix: groups of calls, each at its own time. */
  bursts?: { at_seconds: number; calls: number }[];
  daily_over?: boolean;
}

const limitsFor = (model: string) => ({ ...V1_LIMITS, ratePerMinute: rateLimitPerMinute(model) });

// v1's guard never read a call's cost, so a known cost of 0 is the right reading
// of every situation the fixture recorded (confirmed by the owner, ADR 0003).
const V1_ESTIMATE: CostEstimate = { kind: "known", microcents: 0 };

function v1Verdict(decision: SpendDecision, model: string) {
  if (decision.verdict === "allowed") return { allowed: true };
  const message = MESSAGES[decision.reason as string];
  return message
    ? { allowed: false, kind: decision.reason, message: message(model) }
    : { allowed: false, kind: decision.reason };
}

// Added by the unknown-cost fix: the gate is given the call's real estimate.
function unknownCostCase(input: SpendInput) {
  const model = input.model as string;
  const estimate = estimateCost(model, usageOf({ ...(input.usage ?? {}), model }));
  const decision = decideSpend({
    limits: limitsFor(model),
    spend: { globalToday: input.daily_over ? V1_LIMITS.dailyMicrocents : 0, userToday: null },
    consumedAt: [],
    estimate,
    now: FROZEN,
  });
  return v1Verdict(decision, model);
}

function budgetCase(input: SpendInput) {
  const delta = input.delta_microcents as number;
  const noise = input.noise as string;
  const model = "gpt-4.1-mini";
  const decide = (globalToday: number, userToday: number | null) =>
    v1Verdict(
      decideSpend({
        limits: limitsFor(model),
        spend: { globalToday, userToday },
        consumedAt: [],
        estimate: V1_ESTIMATE,
        now: FROZEN,
      }),
      model,
    );

  if (input.limit === "daily_budget") {
    return decide(
      V1_LIMITS.dailyMicrocents + delta + (COUNTS_GLOBALLY.has(noise) ? NOISE : 0),
      null,
    );
  }
  const spent = V1_LIMITS.userDailyMicrocents + delta;
  let globalToday = spent + (COUNTS_GLOBALLY.has(noise) ? NOISE : 0);
  if (noise === "daily_also_over") globalToday += V1_LIMITS.dailyMicrocents;
  const userToday = noise === "no_user" ? null : spent + (COUNTS_FOR_USER.has(noise) ? NOISE : 0);
  return decide(globalToday, userToday);
}

function rateCase(input: SpendInput) {
  const model = input.model as string;
  const globalToday = input.daily_over ? V1_LIMITS.dailyMicrocents : 0;
  const consumedAt: number[] = [];
  const call = (now: number) => {
    const decision = decideSpend({
      limits: limitsFor(model),
      spend: { globalToday, userToday: null },
      consumedAt,
      estimate: V1_ESTIMATE,
      now,
    });
    if (decision.consumesRateSlot) consumedAt.push(now);
    return decision.verdict === "allowed" ? "allowed" : (decision.reason as string);
  };

  const bursts = input.bursts ?? [
    { at_seconds: 0, calls: input.calls as number },
    ...(input.pause_seconds != null ? [{ at_seconds: input.pause_seconds, calls: 1 }] : []),
  ];
  const kinds = bursts.flatMap(({ at_seconds, calls }) =>
    Array.from({ length: calls }, () => call(FROZEN + at_seconds * 1000)),
  );

  const firstRefused = kinds.findIndex((kind) => kind !== "allowed");
  const runs: [string, number][] = [];
  for (const kind of kinds) {
    const last = runs.at(-1);
    if (last && last[0] === kind) last[1] += 1;
    else runs.push([kind, 1]);
  }
  return { first_refused_call: firstRefused === -1 ? null : firstRefused + 1, runs };
}

export function runSpend(input: unknown): unknown {
  const spend = input as SpendInput;
  if (spend.limit === "unknown_cost") return unknownCostCase(spend);
  return spend.limit === "rate_limit" ? rateCase(spend) : budgetCase(spend);
}

// ── lesson_parser.json ─────────────────────────────────────────────

// v1 recorded no locale: every recorded lesson belongs to a route taught in Spanish
// (golden/README.md), so a case without one is es.
export function runParser(input: unknown): unknown {
  const { body, knowledge_checks, audio_url, locale } = input as {
    body: string | null;
    knowledge_checks: unknown;
    audio_url: string | null;
    locale?: Locale;
  };
  return parseLesson(body, {
    locale: locale ?? "es",
    knowledgeChecks: knowledge_checks,
    audioUrl: audio_url,
  });
}
