import { type ActionResult, runAction } from "@learning-routes/core/actions/define";
import { ACTIONS } from "@learning-routes/core/actions/registry";
import { gate } from "@learning-routes/core/ai/gate";
import { TUTOR_TEXT } from "@learning-routes/core/copy/tutor";
import { V1_LIMITS } from "@learning-routes/core/credits/spend";
import { negotiateLocale } from "@learning-routes/core/locales";
import { TUTOR_LIMITS, TUTOR_MODEL } from "@learning-routes/core/tutor/tutor";
import type { Context, Hono } from "hono";
import type { SpendLedger } from "./agent/ledger";
import { streamFromOpenRouter } from "./ai/openrouter";
import { createAuth } from "./auth/auth";
import type { EmailSender } from "./auth/email";
import { pgRepos } from "./db/repos/index";
import { pgTenancy } from "./db/tenancy";
import { transactionAs, withClient } from "./db/with-db";
import { newId } from "./ids";

// The learner's tutor (Platform STEP 20 §A): POST /api/tutor/ask streams an answer about a topic of
// the person's own enrollment. Core's tutor.ask takes one of the day's ten questions and says what
// to ask; the model is called after that commits, through the one gate, and only what the answer
// used is kept: tokens and cost, never its words.
//
// SECURITY: LLM01/LLM10, Moderate, token_budget_limiter, llm-secure-patterns v1.0.0 / LLM Endpoint
// Hardening, 2026-11-17. A session on the endpoint itself, ten questions a person a day under a
// lock, a 600-character question, max_tokens on every call, a per-person and a platform day's
// spend through the gate, and the key from a Worker secret.

const TUTOR_PATH = "/api/tutor/ask";
const DAY = 86_400_000;

/** What the tutor needs of the environment beyond the API's own. */
type TutorEnv = Env & { OPENROUTER_API_KEY?: string };

interface Asked {
  enrollment_id?: unknown;
  topic?: unknown;
  beat?: unknown;
  last_answer?: unknown;
  question?: unknown;
}

const said = (c: Context, key: "limited" | "unavailable") =>
  TUTOR_TEXT[negotiateLocale(c.req.header("accept-language"))][key];

const unavailable = (c: Context) =>
  c.json({ ok: false, code: "tutor_unavailable", message: said(c, "unavailable") }, 503, {
    "retry-after": "3600",
  });

const ctxFor = (userId: string, name: string) => (tx: Parameters<typeof pgRepos>[0]) => ({
  actor: { via: "ui" as const, userId, name },
  repos: pgRepos(tx),
  tenancy: pgTenancy(tx),
  clock: { now: () => Date.now() },
  ids: { newId },
});

/** The platform's spend today, from the agent Worker's ledger. */
function ledgerOf(env: TutorEnv) {
  // wrangler types cannot see another Worker's class: this binding is the agent's SpendLedger.
  const ledgers = env.TUTOR_LEDGER as unknown as DurableObjectNamespace<SpendLedger> | undefined;
  return ledgers?.get(ledgers.idFromName("global")) ?? null;
}

type Repos = ReturnType<typeof pgRepos>;
type Messages = Parameters<typeof gate>[0]["messages"];

const inputOf = (body: Asked) => ({
  enrollmentId: body.enrollment_id,
  topic: body.topic,
  beat: body.beat ?? null,
  lastAnswer: body.last_answer ?? null,
  question: body.question,
});

/** A refusal as the person reads it: the day's limit in their words, the rest as core said. */
function refusal(c: Context, result: Exclude<ActionResult, { ok: true }>) {
  if (result.code === "rate_limited") {
    return c.json({ ok: false, code: "rate_limited", message: said(c, "limited") }, 429);
  }
  return c.json(result, result.code === "invalid_input" ? 400 : 404);
}

/** The gate's decision for one question, within the person's and the platform's day of spend. */
function gated(questionId: string, system: string, messages: Messages, spend: [number, number]) {
  const now = Date.now();
  return gate(
    {
      model: TUTOR_MODEL,
      maxTokens: TUTOR_LIMITS.answerTokens,
      promptCache: true,
      // The question's own id: never a person's.
      sessionId: `tutor-${questionId}`,
      system,
      messages,
      stream: true,
    },
    {
      limits: {
        dailyMicrocents: V1_LIMITS.dailyMicrocents,
        userDailyMicrocents: TUTOR_LIMITS.userDailyMicrocents,
        ratePerMinute: null,
      },
      spend: { globalToday: spend[0], userToday: spend[1] },
      consumedAt: [],
      now,
    },
  );
}

async function ask(c: Context<{ Bindings: Env }>, emailSender: (env: Env) => EmailSender) {
  c.header("Cache-Control", "no-store");
  const env = c.env as TutorEnv;
  const apiKey = env.OPENROUTER_API_KEY;
  const ledger = ledgerOf(env);
  const body = ((await c.req.json().catch(() => null)) ?? {}) as Asked;
  return withClient(env, c.executionCtx, async (db) => {
    const session = await createAuth(env, db, emailSender(env)).api.getSession({
      headers: c.req.raw.headers,
    });
    if (session === null) {
      return c.json({ ok: false, code: "unauthenticated" }, 401);
    }
    // No key, no ledger: no model can answer, and no question is taken.
    if (!(apiKey && ledger)) {
      return unavailable(c);
    }
    const userId = session.user.id;
    const now = Date.now();
    const { result, spent } = await transactionAs(db, userId, async (tx) => {
      const asked = await runAction(
        ACTIONS,
        "tutor.ask",
        inputOf(body),
        ctxFor(userId, session.user.name)(tx),
      );
      return {
        result: asked,
        spent: asked.ok ? await pgRepos(tx).tutor.spentSince(userId, now - (now % DAY)) : 0,
      };
    });
    if (!result.ok) {
      return refusal(c, result);
    }
    const { questionId, system, messages } = result.output as {
      questionId: string;
      system: string;
      messages: Messages;
    };
    // After the answer, the request's client is gone: what comes later gets its own.
    const later = (work: (repos: Repos) => Promise<void>) =>
      withClient(env, c.executionCtx, (fresh) =>
        transactionAs(fresh, userId, (tx) => work(pgRepos(tx))),
      );
    const giveBack = () => later((repos) => repos.tutor.release(questionId));
    const decision = gated(questionId, system, messages, [await ledger.today(), spent]);
    if (decision.verdict === "refused") {
      await giveBack();
      console.error(JSON.stringify({ message: "tutor refused", reason: decision.reason }));
      return unavailable(c);
    }
    return answer(c, { apiKey, ledger, decision, giveBack, later, questionId });
  });
}

export function tutorRoutes(app: Hono<{ Bindings: Env }>, emailSender: (env: Env) => EmailSender) {
  app.post(TUTOR_PATH, (c) => ask(c, emailSender));
}

interface Answering {
  questionId: string;
  apiKey: string;
  ledger: { add(n: number): Promise<void> };
  decision: Extract<ReturnType<typeof gate>, { verdict: "allowed" }>;
  giveBack: () => Promise<void>;
  later: (work: (repos: Repos) => Promise<void>) => Promise<void>;
}

/** Streams the answer as plain text once its first words arrive; 503 when none can come. */
async function answer(c: Context, a: Answering): Promise<Response> {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  let sent = 0;
  let started: (began: boolean) => void = () => undefined;
  const firstWords = new Promise<boolean>((resolve) => {
    started = resolve;
  });
  const done = streamFromOpenRouter(a.decision, a.apiKey, (soFar) => {
    started(true);
    const delta = soFar.slice(sent);
    sent = soFar.length;
    if (delta) {
      writer.write(encoder.encode(delta)).catch(() => undefined);
    }
  }).then(async (streamed) => {
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
  });
  if (!(await firstWords)) {
    await done;
    return unavailable(c);
  }
  c.executionCtx.waitUntil(done);
  return new Response(readable, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
