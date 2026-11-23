import { gate } from "@learning-routes/core/ai/gate";
import type { ModelId } from "@learning-routes/core/ai/models";
import { budgetOf, limitsOf } from "@learning-routes/core/studio/budget";
import { trimHistory } from "@learning-routes/core/studio/prompt";
import { STUDIO_TOOLS } from "@learning-routes/core/studio/studio-tools";
import type { ModelAnswer, TurnDeps } from "@learning-routes/core/studio/turn";
import { anthropicFetch } from "../ai/anthropic";
import { type Streamed, streamFromOpenRouter } from "../ai/openrouter";
import { readScript, scriptedFetch } from "../ai/scripted";
import { STUDIO_SCRIPT_FILES } from "../ai/studio-scripts";
import { CONTENT_MODEL_TOOLS } from "./content-tools";
import type { AgentEnv } from "./env";

const MODEL_TOOLS = [...STUDIO_TOOLS, ...CONTENT_MODEL_TOOLS];

// The assistant's model calls (Platform STEP 10 §1.2, §4.3): every one through the gate, priced
// before it is sent, refused over the space's month or the platform's day, and metered after.

/** The strong tier writes lessons; the cheap tier only talks. */
const MAX_TOKENS: Record<string, number> = {
  "anthropic/claude-sonnet-5.5": 4_000,
  "anthropic/claude-haiku-5.5": 1_200,
};
/** The history sent with each call, in estimated tokens: the newest that fit. */
const HISTORY_TOKENS = 40_000;
/** The page gets the words at most this often while they stream. */
const STREAM_EVERY_MS = 120;

export interface SpendBook {
  /**
   * In microcents: the space's month, this creator's day in the space, and when the space's calls
   * of the last minute were made.
   */
  spent(now: number): { month: number; userToday: number; lastMinute: number[] };
  record(row: {
    model: ModelId;
    microcents: number;
    promptTokens: number;
    cachedTokens: number;
    completionTokens: number;
    /** false for a call that failed on our side: it is metered, never charged to the creator. */
    isCharged: boolean;
  }): void;
}

/** The one error a dev-only model setting refused outside development leaves in the logs. */
export const logRefusal = () =>
  console.error(JSON.stringify({ message: "dev-only model setting refused outside development" }));

/** tier: every call goes to this model instead (MODEL_TIER_OVERRIDE, development only). */
export type Provider = { apiKey: string; fetcher: typeof fetch; tier?: ModelId };

type ProviderEnv = Pick<
  AgentEnv,
  | "ENVIRONMENT"
  | "MODEL_PROVIDER"
  | "MODEL_TIER_OVERRIDE"
  | "OPENROUTER_API_KEY"
  | "ANTHROPIC_API_KEY"
>;

/** What a Provider's apiKey says when Anthropic's own API answers; the real key stays in the fetcher. */
const ANTHROPIC = "anthropic";
/** Whether Anthropic's own API answers this provider's calls: it serves only Anthropic's models. */
export const isAnthropic = (provider: Provider) => provider.apiKey === ANTHROPIC;

const isDevelopment = (env: ProviderEnv) => String(env.ENVIRONMENT) === "development";

// A provider asked for by name (MODEL_PROVIDER). "scripted" (§A1) answers from committed scripts and
// is for development only. "anthropic" is Anthropic's own API with the platform's key (ADR 0014):
// allowed anywhere, production included, so the assistant and the tutor work without OpenRouter.
// undefined: none asked for, or refused; null: asked for without its key, so no one answers.
function namedProvider(env: ProviderEnv, refused: () => void): Provider | null | undefined {
  if (env.MODEL_PROVIDER === "anthropic") {
    return env.ANTHROPIC_API_KEY
      ? { apiKey: ANTHROPIC, fetcher: anthropicFetch(env.ANTHROPIC_API_KEY) }
      : null;
  }
  if (env.MODEL_PROVIDER !== "scripted") {
    return undefined;
  }
  if (!isDevelopment(env)) {
    refused();
    return undefined;
  }
  return { apiKey: "scripted", fetcher: scriptedFetch(STUDIO_SCRIPT_FILES.map(readScript)) };
}

// "small": every call to the cheap tier, to shake out wiring before a run on the real tiers.
function tierOf(env: ProviderEnv, refused: () => void): ModelId | undefined {
  if (env.MODEL_TIER_OVERRIDE !== "small") {
    return undefined;
  }
  if (!isDevelopment(env)) {
    refused();
    return undefined;
  }
  return "anthropic/claude-haiku-5.5";
}

/**
 * Who answers the model calls: OpenRouter with its key, or the provider MODEL_PROVIDER names:
 * Anthropic anywhere, the scripted one in development only, where MODEL_TIER_OVERRIDE can also send
 * every call to the small tier. null: no one, and the assistant is not switched on. A dev-only
 * setting anywhere else is ignored, and `refused` is told so it can be logged.
 */
export function providerFetch(
  env: ProviderEnv,
  refused: () => void = () => undefined,
): Provider | null {
  const tier = tierOf(env, refused);
  const named = namedProvider(env, refused);
  // A provider asked for never falls back to OpenRouter's key: the bill would go elsewhere.
  const provider =
    named !== undefined
      ? named
      : env.OPENROUTER_API_KEY
        ? { apiKey: env.OPENROUTER_API_KEY, fetcher: fetch }
        : null;
  return provider && tier ? { ...provider, tier } : provider;
}

function throttled(onText: (text: string) => void) {
  let last = 0;
  return (text: string) => {
    const now = Date.now();
    if (now - last >= STREAM_EVERY_MS) {
      last = now;
      onText(text);
    }
  };
}

/**
 * What a call cost, in the space's book and the platform's day. A call that reached a model but
 * came back without its cost is booked at the gate's worst case, so no call is ever free to the budget.
 */
async function meter(
  env: AgentEnv,
  book: SpendBook,
  model: ModelId,
  streamed: Streamed,
  worstCase: number,
) {
  const usage = streamed.usage;
  const known = usage?.cost.kind === "known" ? usage.cost.microcents : null;
  if (known === null && !(streamed.ok || streamed.reached)) {
    return;
  }
  const microcents = known ?? worstCase;
  book.record({
    model,
    microcents,
    promptTokens: usage?.promptTokens ?? 0,
    cachedTokens: usage?.cachedTokens ?? 0,
    completionTokens: usage?.completionTokens ?? 0,
    isCharged: streamed.ok || known === null,
  });
  await env.LEDGER.get(env.LEDGER.idFromName("global")).add(microcents);
}

export function modelCall(
  env: AgentEnv,
  provider: Provider | null,
  book: SpendBook,
  conversation: { id: string; system: () => string },
): TurnDeps["call"] {
  const limits = limitsOf({
    spaceMonthly: env.AGENT_SPACE_MONTHLY_MICROCENTS,
    userDaily: env.AGENT_USER_DAILY_MICROCENTS,
    daily: env.AGENT_DAILY_MICROCENTS,
    perMinute: env.AGENT_CALLS_PER_MINUTE,
  });
  if (provider && !limits) {
    console.error(JSON.stringify({ message: "studio limits are not configured" }));
  }
  return async (asked, messages, onText) => {
    const now = Date.now();
    const spent = book.spent(now);
    // No key, no limits or no month left: the assistant says so, and calls no model.
    if (!(provider && limits) || budgetOf(spent.month, limits.spaceMonthly) === "out") {
      return { ok: false, why: "budgetOut" };
    }
    // The small tier keeps the asked tier's room to write: a lesson cut short proves nothing.
    const model = provider.tier ?? asked;
    const decision = gate(
      {
        model,
        maxTokens: MAX_TOKENS[asked] ?? 1_200,
        promptCache: true,
        // Never a user id: the conversation's own id keeps its calls on one provider's cache.
        sessionId: `studio-${conversation.id}`,
        system: conversation.system(),
        messages: trimHistory(messages, HISTORY_TOKENS),
        tools: MODEL_TOOLS,
        stream: true,
      },
      {
        limits: {
          dailyMicrocents: limits.daily,
          userDailyMicrocents: limits.userDaily,
          // The minute's cap meets the creator's words, never a tool round of a turn already
          // started: that turn finishes, and MAX_CALLS_PER_TURN bounds it. Every call still counts.
          ratePerMinute: messages.at(-1)?.role === "user" ? limits.perMinute : null,
        },
        spend: {
          globalToday: await env.LEDGER.get(env.LEDGER.idFromName("global")).today(),
          userToday: spent.userToday,
        },
        consumedAt: spent.lastMinute,
        now,
      },
    );
    if (decision.verdict === "refused") {
      console.error(JSON.stringify({ message: "studio call refused", reason: decision.reason }));
      return { ok: false, why: whyRefused(decision.reason) };
    }
    const streamed = await streamFromOpenRouter(
      decision,
      provider.apiKey,
      throttled(onText),
      provider.fetcher,
    );
    await meter(env, book, model, streamed, decision.estimateMicrocents);
    return answerOf(streamed);
  };
}

/** What the creator hears of a refused call: too fast, out of budget, or our failure. */
function whyRefused(reason: string): "tooFast" | "budgetOut" | "failed" {
  if (reason === "rate_limit") {
    return "tooFast";
  }
  return reason.endsWith("budget") ? "budgetOut" : "failed";
}

/** What the turn hears of a call: its answer, a pause for the provider's credit, or a failure. */
function answerOf(streamed: Streamed): ModelAnswer {
  if (streamed.ok) {
    return { ok: true, content: streamed.content, toolCalls: streamed.toolCalls };
  }
  if (streamed.isCreditOut) {
    // No ids: which space hit it says nothing about the fix, which is the platform's credit.
    console.error(JSON.stringify({ message: "provider credit out", status: streamed.status }));
    return { ok: false, why: "paused" };
  }
  console.error(JSON.stringify({ message: "studio call failed", status: streamed.status }));
  return { ok: false, why: "failed" };
}
