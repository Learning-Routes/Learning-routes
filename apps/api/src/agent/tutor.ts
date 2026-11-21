import { type ActionResult, runAction } from "@learning-routes/core/actions/define";
import { ENTRY_ACTIONS } from "@learning-routes/core/actions/entries";
import { gate } from "@learning-routes/core/ai/gate";
import type { ModelId } from "@learning-routes/core/ai/models";
import { TUTOR_TEXT } from "@learning-routes/core/copy/tutor";
import { TUTOR_LIMITS, TUTOR_MODEL } from "@learning-routes/core/tutor/tutor";
import { streamFromOpenRouter } from "../ai/openrouter";
import { transactionAs, withClient } from "../db/with-db";
import { type Asked, entryCtx, entryRepos, ledgerOf } from "./entry-ctx";
import { isAnthropic, logRefusal, providerFetch } from "./model";

// The learner's tutor (Platform STEP 20 §A), on the agent Worker: POST /api/tutor/ask streams an
// answer about a topic of the person's own enrollment. Core's tutor.ask takes one of the day's ten
// questions and says what to ask; the model is called after that commits, through the one gate,
// and only what the answer used is kept: tokens and cost, never its words. The spend goes to the
// platform's ledger, which this Worker keeps; nobody is charged for it.
//
// SECURITY: LLM01/LLM10, Moderate, token_budget_limiter, llm-secure-patterns v1.0.0 / LLM Endpoint
// Hardening, 2026-11-17. A session on the endpoint itself, ten questions a person a day under a
// lock, a 600-character question, max_tokens on every call, a per-person and a platform day's
// spend through the gate, and the key from a Worker secret.

const DAY = 86_400_000;
const TUTOR_MODEL_ANTHROPIC: ModelId = "anthropic/claude-haiku-5.5";

type Repos = ReturnType<typeof entryRepos>;
type Messages = Parameters<typeof gate>[0]["messages"];
type Locale = Asked["locale"];

const unavailable = (locale: Locale) =>
  Response.json(
    { ok: false, code: "tutor_unavailable", message: TUTOR_TEXT[locale].unavailable },
    { status: 503, headers: { "retry-after": "3600", "cache-control": "no-store" } },
  );

/** A refusal as the person reads it: the day's limit in their words, the rest as core said. */
function refusal(locale: Locale, result: Exclude<ActionResult, { ok: true }>) {
  if (result.code === "rate_limited") {
    return Response.json(
      { ok: false, code: "rate_limited", message: TUTOR_TEXT[locale].limited },
      { status: 429 },
    );
  }
  return Response.json(result, { status: result.code === "invalid_input" ? 400 : 404 });
}

/** The gate's decision for one question, within the person's and the platform's day of spend. */
function gated(
  model: ModelId,
  questionId: string,
  asked: { system: string; messages: Messages },
  platformDaily: number,
  spend: [number, number],
) {
  return gate(
    {
      model,
      maxTokens: TUTOR_LIMITS.answerTokens,
      promptCache: true,
      // The question's own id: never a person's.
      sessionId: `tutor-${questionId}`,
      system: asked.system,
      messages: asked.messages,
      stream: true,
    },
    {
      limits: {
        dailyMicrocents: platformDaily,
        userDailyMicrocents: TUTOR_LIMITS.userDailyMicrocents,
        ratePerMinute: null,
      },
      spend: { globalToday: spend[0], userToday: spend[1] },
      consumedAt: [],
      now: Date.now(),
    },
  );
}

export async function askTutor(asked: Asked): Promise<Response> {
  const { env, ctx, db, person, locale, body } = asked;
  const provider = providerFetch(env, logRefusal);
  // No provider with its key: no model can answer, and no question is taken.
  if (!provider) {
    return unavailable(locale);
  }
  // Anthropic's own API serves only its models: there the tutor is its small one (ADR 0014).
  const model = isAnthropic(provider) ? TUTOR_MODEL_ANTHROPIC : TUTOR_MODEL;
  const ledger = ledgerOf(env);
  const now = Date.now();
  const { result, spent } = await transactionAs(db, person.id, async (tx) => {
    const taken = await runAction(
      ENTRY_ACTIONS,
      "tutor.ask",
      {
        enrollmentId: body.enrollment_id,
        topic: body.topic,
        beat: body.beat ?? null,
        lastAnswer: body.last_answer ?? null,
        question: body.question,
      },
      entryCtx(tx, person),
    );
    return {
      result: taken,
      spent: taken.ok ? await entryRepos(tx).tutor.spentSince(person.id, now - (now % DAY)) : 0,
    };
  });
  if (!result.ok) {
    return refusal(locale, result);
  }
  const { questionId, system, messages } = result.output as {
    questionId: string;
    system: string;
    messages: Messages;
  };
  // After the answer, the request's client is gone: what comes later gets its own.
  const later = (work: (repos: Repos) => Promise<void>) =>
    withClient(env, ctx, (fresh) => transactionAs(fresh, person.id, (tx) => work(entryRepos(tx))));
  const giveBack = () => later((repos) => repos.tutor.release(questionId));
  const decision = gated(
    model,
    questionId,
    { system, messages },
    Number(env.AGENT_DAILY_MICROCENTS),
    [await ledger.today(), spent],
  );
  if (decision.verdict === "refused") {
    await giveBack();
    console.error(JSON.stringify({ message: "tutor refused", reason: decision.reason }));
    return unavailable(locale);
  }
  // A test's fetcher stands in for the network; otherwise the provider's own answers.
  const fetcher = asked.fetcher === fetch ? provider.fetcher : asked.fetcher;
  return answer(asked, {
    apiKey: provider.apiKey,
    fetcher,
    ledger,
    decision,
    giveBack,
    later,
    questionId,
  });
}

interface Answering {
  questionId: string;
  apiKey: string;
  fetcher: typeof fetch;
  ledger: { add(n: number): Promise<void> };
  decision: Extract<ReturnType<typeof gate>, { verdict: "allowed" }>;
  giveBack: () => Promise<void>;
  later: (work: (repos: Repos) => Promise<void>) => Promise<void>;
}

/** Streams the answer as plain text once its first words arrive; 503 when none can come. */
async function answer(asked: Asked, a: Answering): Promise<Response> {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  let sent = 0;
  let started: (began: boolean) => void = () => undefined;
  const firstWords = new Promise<boolean>((resolve) => {
    started = resolve;
  });
  const onText = (soFar: string) => {
    started(true);
    const delta = soFar.slice(sent);
    sent = soFar.length;
    if (delta) {
      writer.write(encoder.encode(delta)).catch(() => undefined);
    }
  };
  const done = streamFromOpenRouter(a.decision, a.apiKey, onText, a.fetcher).then(
    async (streamed) => {
      started(false);
      const usage = streamed.usage;
      const microcents = usage?.cost.kind === "known" ? usage.cost.microcents : null;
      if (streamed.ok || streamed.reached) {
        await a.later((repos) =>
          repos.tutor.settle(a.questionId, {
            model: a.decision.request.model,
            promptTokens: usage?.promptTokens ?? 0,
            completionTokens: usage?.completionTokens ?? 0,
            microcents,
          }),
        );
        await a.ledger.add(microcents ?? a.decision.estimateMicrocents);
      } else {
        await a.giveBack();
      }
      // Token counts and cost only: never the question, the answer or who asked.
      console.log(
        JSON.stringify({
          message: "tutor answered",
          ok: streamed.ok,
          creditOut: streamed.ok ? false : streamed.isCreditOut,
          promptTokens: usage?.promptTokens ?? 0,
          completionTokens: usage?.completionTokens ?? 0,
          microcents,
        }),
      );
      await writer.close().catch(() => undefined);
      return streamed;
    },
  );
  if (!(await firstWords)) {
    await done;
    return unavailable(asked.locale);
  }
  asked.ctx.waitUntil(done);
  return new Response(readable, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
