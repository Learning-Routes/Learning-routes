// What a model call costs, in integer microcents (lesson 10). The arithmetic is
// exact (BigInt fractions) and rounds half away from zero, as v1's Rational did.

const DECIMAL = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

export const MICROCENTS_PER_CENT = 10_000;

type Rate = readonly [numerator: number, denominator: number];
const cents = (value: number): Rate => [value, 1];

/** v1's prices: tokens in cents per million, characters per thousand, audio per hour. */
export const PRICING = {
  "gpt-5.2": { kind: "tokens", input: cents(175), cachedInput: [35, 2], output: cents(1400) },
  "gpt-4.1-mini": { kind: "tokens", input: cents(40), cachedInput: cents(10), output: cents(160) },
  "claude-opus-4-5": {
    kind: "tokens",
    input: cents(500),
    cachedInput: cents(50),
    cacheWrite: cents(625),
    output: cents(2500),
  },
  "claude-haiku-4-5": {
    kind: "tokens",
    input: cents(100),
    cachedInput: cents(10),
    cacheWrite: cents(125),
    output: cents(500),
  },
  "claude-sonnet-4-5": {
    kind: "tokens",
    input: cents(300),
    cachedInput: cents(30),
    cacheWrite: cents(375),
    output: cents(1500),
  },
  elevenlabs: { kind: "flat", cents: 0 },
  eleven_multilingual_v2: { kind: "characters", centsPerThousand: 10 },
  eleven_flash_v2_5: { kind: "characters", centsPerThousand: 5 },
  scribe_v2: { kind: "audio", centsPerHour: 22 },
  "gpt-image-1": {
    kind: "tokens",
    input: cents(500),
    cachedInput: cents(125),
    imageInput: cents(1000),
    output: cents(4000),
  },
  tavily: { kind: "provider_reported" },
} as const satisfies Record<string, Price>;

type Price =
  | {
      kind: "tokens";
      input: Rate;
      cachedInput: Rate;
      cacheWrite?: Rate;
      imageInput?: Rate;
      output: Rate;
    }
  | { kind: "flat"; cents: number }
  | { kind: "characters"; centsPerThousand: number }
  | { kind: "audio"; centsPerHour: number }
  | { kind: "provider_reported" };

export interface Usage {
  inputTokens?: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
  outputTokens?: number;
  imageInputTokens?: number;
  characters?: number;
  /** A decimal string or a number, as the provider reports it. */
  audioSeconds?: string | number;
}

export type UnknownCostReason =
  | "unknown_model"
  | "missing_audio_seconds"
  | "missing_characters"
  | "provider_reported_usage_required";

/** A price, or an explicit unknown: never a guessed 0 (lesson 10, ADR 0003). */
export type CostEstimate =
  | { kind: "known"; microcents: number }
  | { kind: "unknown"; reason: UnknownCostReason };

const known = (microcents: bigint): CostEstimate => ({
  kind: "known",
  microcents: toSafeNumber(microcents),
});
const unknown = (reason: UnknownCostReason): CostEstimate => ({ kind: "unknown", reason });

// An exact fraction n/d with d > 0.
type Fraction = { n: bigint; d: bigint };
const big = (value: number | undefined) => BigInt(Math.trunc(value ?? 0));
const times = (count: bigint, [n, d]: Rate): Fraction => ({ n: count * BigInt(n), d: BigInt(d) });
const plus = (a: Fraction, b: Fraction): Fraction => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });

function roundHalfAwayFromZero({ n, d }: Fraction): bigint {
  const negative = n < 0n !== d < 0n;
  const [absN, absD] = [n < 0n ? -n : n, d < 0n ? -d : d];
  const rounded = (2n * absN + absD) / (2n * absD);
  return negative ? -rounded : rounded;
}

function toSafeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < -BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${value} microcents is beyond Number.MAX_SAFE_INTEGER`);
  }
  return Number(value);
}

// Reported audio seconds as an exact fraction, or null when they are not a number.
function decimal(value: string | number | undefined): Fraction | null {
  const text = value === undefined ? "" : String(value);
  const match = DECIMAL.exec(text);
  if (!match) return null;
  const [, sign, whole, fraction = "", exponent = "0"] = match;
  let n = BigInt(`${sign}${whole}${fraction}`);
  let d = 10n ** BigInt(fraction.length);
  const e = Number(exponent);
  if (e >= 0) n *= 10n ** BigInt(e);
  else d *= 10n ** BigInt(-e);
  return { n, d };
}

/**
 * The estimated cost of a call. A call the price table cannot price (an unknown
 * model, or a usage-priced call without its quantity) is an explicit unknown,
 * never 0 and never a raise. Replaces v1 `AiOrchestrator::CostTracker.estimate_microcents`.
 */
export function estimateCost(model: string, usage: Usage): CostEstimate {
  if (!Object.hasOwn(PRICING, model)) return unknown("unknown_model");
  const price: Price = PRICING[model as keyof typeof PRICING];
  const perCent = BigInt(MICROCENTS_PER_CENT);

  switch (price.kind) {
    case "provider_reported":
      return unknown("provider_reported_usage_required");
    case "flat":
      return known(BigInt(price.cents) * perCent);
    case "characters":
      if (usage.characters === undefined) return unknown("missing_characters");
      return known(
        roundHalfAwayFromZero({
          n: big(usage.characters) * BigInt(price.centsPerThousand) * perCent,
          d: 1000n,
        }),
      );
    case "audio": {
      const seconds = decimal(usage.audioSeconds);
      if (seconds === null) return unknown("missing_audio_seconds");
      return known(
        roundHalfAwayFromZero({
          n: seconds.n * BigInt(price.centsPerHour) * perCent,
          d: seconds.d * 3600n,
        }),
      );
    }
    case "tokens": {
      // Rates are cents per million tokens: cents × 10,000 microcents ÷ 1,000,000 = ÷ 100.
      let total = times(big(usage.inputTokens), price.input);
      total = plus(total, times(big(usage.cachedTokens), price.cachedInput));
      total = plus(total, times(big(usage.cacheWriteTokens), price.cacheWrite ?? price.input));
      total = plus(total, times(big(usage.imageInputTokens), price.imageInput ?? cents(0)));
      total = plus(total, times(big(usage.outputTokens), price.output));
      return known(roundHalfAwayFromZero({ n: total.n, d: total.d * 100n }));
    }
  }
}
