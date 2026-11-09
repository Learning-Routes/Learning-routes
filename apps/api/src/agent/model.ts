import { gate } from "@learning-routes/core/ai/gate";
import type { ModelId } from "@learning-routes/core/ai/models";
import { budgetOf, limitsOf } from "@learning-routes/core/studio/budget";
import { trimHistory } from "@learning-routes/core/studio/prompt";
import { STUDIO_TOOLS } from "@learning-routes/core/studio/studio-tools";
import type { TurnDeps } from "@learning-routes/core/studio/turn";
import { type Streamed, streamFromOpenRouter } from "../ai/openrouter";
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
  book: SpendBook,
  conversation: { id: string; system: () => string },
): TurnDeps["call"] {
  const limits = limitsOf({
    spaceMonthly: env.AGENT_SPACE_MONTHLY_MICROCENTS,
    userDaily: env.AGENT_USER_DAILY_MICROCENTS,
    daily: env.AGENT_DAILY_MICROCENTS,
  });
  if (env.OPENROUTER_API_KEY && !limits) {
    console.error(JSON.stringify({ message: "studio limits are not configured" }));
  }
  return async (model, messages, onText) => {
    const now = Date.now();
    const spent = book.spent(now);
    // No key, no limits or no month left: the assistant says so, and calls no model.
    if (
      !(env.OPENROUTER_API_KEY && limits) ||
      budgetOf(spent.month, limits.spaceMonthly) === "out"
    ) {
      return { ok: false, why: "budgetOut" };
    }
    const decision = gate(
      {
        model,
        maxTokens: MAX_TOKENS[model] ?? 1_200,
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
          ratePerMinute: limits.perMinute,
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
      return { ok: false, why: decision.reason.endsWith("budget") ? "budgetOut" : "failed" };
    }
    const streamed = await streamFromOpenRouter(
      decision,
      env.OPENROUTER_API_KEY,
      throttled(onText),
    );
    await meter(env, book, model, streamed, decision.estimateMicrocents);
    if (!streamed.ok) {
      console.error(JSON.stringify({ message: "studio call failed", status: streamed.status }));
      return { ok: false, why: "failed" };
    }
    return { ok: true, content: streamed.content, toolCalls: streamed.toolCalls };
  };
}
