import { type ActionResult, runAction } from "@learning-routes/core/actions/define";
import { ENTRY_ACTIONS } from "@learning-routes/core/actions/entries";
import { TOOL_ACTIONS } from "@learning-routes/core/actions/tool-actions";
import { gate } from "@learning-routes/core/ai/gate";
import { CREATOR_REQUIRED } from "@learning-routes/core/copy/creator-required";
import { IMAGES_TEXT } from "@learning-routes/core/copy/images";
import { IMAGE_LIMITS, IMAGE_MODEL } from "@learning-routes/core/images/images";
import { sendToOpenRouter, settle } from "../ai/openrouter";
import { transactionAs, withClient } from "../db/with-db";
import { type Asked, entryCtx, entryRepos, ledgerOf } from "./entry-ctx";

// Route images (Platform STEP 20 §B), on the agent Worker: POST /api/creator/images makes one image
// from a creator's description and keeps it as one of the space's assets, through asset.upload, so
// the space's quota holds. Core's image.generate takes one of the creator's twenty a month; the
// model is called after that commits, through the one gate. There is no AI balance yet (the owner's
// decision): the cost goes to the platform's ledger and the image's own row, and nobody is charged.
//
// SECURITY: LLM01/LLM10, Moderate, token_budget_limiter, llm-secure-patterns v1.0.0 / LLM Endpoint
// Hardening, 2026-11-17. A session or a signed MCP caller, creators only, twenty a creator a month
// under a lock, a 1,000-character description, max_tokens on every call, the platform's day of
// spend through the gate, the key from a Worker secret, and only image bytes asset.upload sniffs
// as an image are kept.

/** The longest one image may take. */
const IMAGE_MS = 60_000;
const DATA_URL = /^data:image\/[a-z+]+;base64,([A-Za-z0-9+/=]+)$/;

type Locale = Asked["locale"];
type Repos = ReturnType<typeof entryRepos>;
type Messages = Parameters<typeof gate>[0]["messages"];
type Allowed = Extract<ReturnType<typeof gate>, { verdict: "allowed" }>;
type Later = <T>(
  work: (repos: Repos, tx: Parameters<typeof entryCtx>[0]) => Promise<T>,
) => Promise<T>;
type Taken = { imageId: string; spaceId: string; system: string; messages: Messages };

const unavailable = (locale: Locale) =>
  Response.json(
    { ok: false, code: "images_unavailable", message: IMAGES_TEXT[locale].unavailable },
    { status: 503, headers: { "retry-after": "3600", "cache-control": "no-store" } },
  );

function refusal(locale: Locale, result: Exclude<ActionResult, { ok: true }>) {
  if (result.code === "rate_limited") {
    return Response.json(
      { ok: false, code: "rate_limited", message: IMAGES_TEXT[locale].limited },
      { status: 429 },
    );
  }
  if (result.code === "creator_required") {
    return Response.json(
      { ok: false, code: "creator_required", message: CREATOR_REQUIRED[locale] },
      { status: 403 },
    );
  }
  const status = { invalid_input: 400, invalid: 400, forbidden: 403 }[result.code as string] ?? 404;
  return Response.json(result, { status });
}

/** The image's bytes, from OpenRouter's answer: the first image, as a data URL. */
function imageIn(answer: unknown): Uint8Array | null {
  const url = (
    answer as { choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[] }
  )?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  const base64 = url?.match(DATA_URL)?.[1];
  return base64 ? Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)) : null;
}

export function makeImage(asked: Asked, via: "ui" | "mcp" = "ui"): Promise<Response> {
  const { env, locale } = asked;
  const apiKey = env.OPENROUTER_API_KEY;
  // No key: no model can make one, and no image is taken.
  if (!apiKey) {
    return Promise.resolve(unavailable(locale));
  }
  return made(asked, apiKey, via);
}

async function made(asked: Asked, apiKey: string, via: "ui" | "mcp"): Promise<Response> {
  const { env, ctx, db, person, locale, body } = asked;
  const result = await transactionAs(db, person.id, (tx) =>
    runAction(
      ENTRY_ACTIONS,
      "image.generate",
      { spaceId: body.space_id, prompt: body.prompt },
      entryCtx(tx, person, via),
    ),
  );
  if (!result.ok) {
    return refusal(locale, result);
  }
  const taken = result.output as Taken;
  const later: Later = (work) =>
    withClient(env, ctx, (fresh) =>
      transactionAs(fresh, person.id, (tx) => work(entryRepos(tx), tx)),
    );
  const giveBack = () => later((repos) => repos.images.release(taken.imageId));
  const decision = await gated(env, taken);
  if (decision.verdict === "refused") {
    await giveBack();
    console.error(JSON.stringify({ message: "image refused", reason: decision.reason }));
    return unavailable(locale);
  }
  const drawn = await draw(asked, decision, apiKey);
  if (drawn.bytes === null) {
    await giveBack();
    return unavailable(locale);
  }
  return keep(asked, via, later, taken, { ...drawn, bytes: drawn.bytes, decision });
}

/** The gate's decision for one image, within the platform's day of spend. */
async function gated(env: Asked["env"], taken: Taken) {
  return gate(
    {
      model: IMAGE_MODEL,
      maxTokens: IMAGE_LIMITS.outputTokens,
      promptCache: false,
      // The image's own id: never a person's.
      sessionId: `image-${taken.imageId}`,
      system: taken.system,
      messages: taken.messages,
      image: true,
    },
    {
      limits: {
        dailyMicrocents: Number(env.AGENT_DAILY_MICROCENTS),
        userDailyMicrocents: Number(env.AGENT_USER_DAILY_MICROCENTS),
        ratePerMinute: null,
      },
      // No person's day here: the month's twenty bound one creator, the platform's day everyone.
      spend: { globalToday: await ledgerOf(env).today(), userToday: null },
      consumedAt: [],
      now: Date.now(),
    },
  );
}

/** Calls the model; a call that reached it is the platform's spend, image or not. */
async function draw(asked: Asked, decision: Allowed, apiKey: string) {
  let answer: Response | null = null;
  try {
    answer = await sendToOpenRouter(decision, apiKey, asked.fetcher, AbortSignal.timeout(IMAGE_MS));
  } catch {
    answer = null;
  }
  const json: unknown = answer?.ok ? await answer.json().catch(() => null) : null;
  const usage = json ? settle(json as Parameters<typeof settle>[0]) : null;
  const microcents = usage?.cost.kind === "known" ? usage.cost.microcents : null;
  const bytes = imageIn(json);
  if (answer?.ok) {
    await ledgerOf(asked.env).add(microcents ?? decision.estimateMicrocents);
  }
  // Token counts and cost only: never what was asked for, or who asked.
  console.log(
    JSON.stringify({
      message: "image made",
      ok: bytes !== null,
      status: answer?.status ?? 504,
      promptTokens: usage?.promptTokens ?? 0,
      completionTokens: usage?.completionTokens ?? 0,
      microcents,
    }),
  );
  return { bytes, usage, microcents };
}

interface Drawn {
  bytes: Uint8Array;
  usage: ReturnType<typeof settle> | null;
  microcents: number | null;
  decision: Allowed;
}

/** Keeps the image as the space's asset, records what it used, then writes it to R2. */
async function keep(asked: Asked, via: "ui" | "mcp", later: Later, taken: Taken, drawn: Drawn) {
  const { env, person, locale } = asked;
  const kept = await later(async (repos, tx) => {
    const stored = await runAction(
      TOOL_ACTIONS,
      "asset.upload",
      { spaceId: taken.spaceId, file: drawn.bytes },
      entryCtx(tx, person, via),
    );
    if (stored.ok) {
      await repos.images.settle(taken.imageId, {
        model: drawn.decision.request.model,
        promptTokens: drawn.usage?.promptTokens ?? 0,
        completionTokens: drawn.usage?.completionTokens ?? 0,
        microcents: drawn.microcents,
        assetKey: (stored.output as { key: string }).key,
      });
    }
    return stored;
  });
  if (!kept.ok) {
    await later((repos) => repos.images.release(taken.imageId));
    return refusal(locale, kept);
  }
  const { key, contentType } = kept.output as { key: string; contentType: string };
  // After the commit, as files.ts writes an upload: the key is the bytes' hash, so a retry is safe.
  await env.CREATIONS.put(key, drawn.bytes, { httpMetadata: { contentType } });
  return Response.json(
    { ok: true, key, url: `${env.CONTENT_ORIGIN}/${key}` },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}
