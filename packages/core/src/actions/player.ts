import * as z from "zod";
import { type LessonBlock, lessonView } from "../content/lesson-view";
import { forLearner, fromLearner, gates, itemKey } from "../content/player-view";
import type { Snapshot } from "../content/snapshot";
import { type Attempt, fsrsRating, newAttempt, recordSubmission } from "../learning/attempt";
import { review } from "../learning/fsrs";
import { answerable, grade } from "../learning/grader";
import type { LocalizedText } from "../localized-text";
import type { ProgressRecord, Repos } from "../repos/ports";
import { asArray, asObject } from "../v1-import/loose-json";
import { defineAction, inSpace } from "./define";
import { ownEnrollment } from "./enrollments";
import { refused, unwrap } from "./results";

// The lesson player (Platform STEP 12): a topic as beats without their answers, one answer at a
// time graded on the server, and the topic finished once its gates are passed.

/** XP for a block: a pass at the first try is worth more than a pass after retries. */
export const XP_FIRST_TRY = 10;
export const XP_RETRY = 5;

type BlockState = ProgressRecord["blocks"][number];

export interface PlayBeat {
  id: string;
  kind: string;
  data: Record<string, unknown>;
  /** The Markdown fields as trees by locale, parsed on the server like the reading page's. */
  md: LessonBlock["md"];
  gradable: boolean;
  gating: boolean;
  /** An interactive block's creation on the content host, as a path the API makes whole. */
  frame?: string;
  /** What the learner already did here: null when they have not answered. */
  state: { correct: boolean | null; attempts: number; done: boolean } | null;
}

export interface PlayView {
  routeTitle: LocalizedText;
  sourceLocale: string;
  title: LocalizedText;
  moduleNumber: number;
  moduleTitle: LocalizedText;
  topicNumber: number;
  topicTotal: number;
  outline: { number: number; title: LocalizedText; done: boolean; current: boolean }[];
  beats: PlayBeat[];
  xp: { topic: number; route: number };
  brandColor: string | null;
  locked: boolean;
  done: boolean;
  next: { number: number; title: LocalizedText } | null;
}

const xpOf = (block: BlockState) =>
  block.correct === true ? (block.attempts <= 1 ? XP_FIRST_TRY : XP_RETRY) : 0;

async function place(
  ctx: Parameters<typeof lessonPlay.run>[0],
  spaceId: string,
  enrollmentId: string,
) {
  const enrollment = await ownEnrollment(ctx.repos, spaceId, enrollmentId, ctx.actor.userId);
  const { snapshot } = unwrap(
    await ctx.repos.routeVersions.get(spaceId, enrollment.routeId, enrollment.pinnedVersion),
  );
  const records = await ctx.repos.learning.progress(spaceId, enrollment.id);
  return { enrollment, snapshot: snapshot as Snapshot, records };
}

function outlineOf(
  snapshot: Snapshot,
  records: ProgressRecord[],
  current: number,
  moduleIndex: number,
) {
  const done = new Set(records.filter((r) => r.status === "completed").map((r) => r.lessonId));
  let number = 0;
  const out: PlayView["outline"] = [];
  snapshot.modules.forEach((module, index) => {
    for (const lesson of snapshot.lessons.filter((l) => l.moduleId === module.id)) {
      number++;
      if (index === moduleIndex) {
        out.push({
          number,
          title: lesson.title,
          done: done.has(lesson.id),
          current: number === current,
        });
      }
    }
  });
  return out;
}

export const lessonPlay = defineAction({
  name: "lesson.play",
  kind: "query",
  description:
    "A topic of your own enrollment as the player shows it: its beats without their answers, and what you already answered.",
  input: z.strictObject({ enrollmentId: z.uuid(), topic: z.int().positive().max(10_000) }),
  target: (input) => ({ kind: "enrollment", id: input.enrollmentId }),
  run: async (ctx, input, given): Promise<PlayView> => {
    const { spaceId } = inSpace(given);
    const { snapshot, records } = await place(ctx, spaceId, input.enrollmentId);
    const space = unwrap(await ctx.repos.spaces.get(spaceId));
    const view = lessonView(snapshot, input.topic, { spaceId, kind: "p", creator: space.name });
    if (view === null) {
      throw refused("not_found");
    }
    const lessonId = snapshot.blocks.find((b) => b.id === view.blocks[0]?.id)?.lessonId;
    const record = records.find((r) => r.lessonId === lessonId);
    const states = new Map((record?.blocks ?? []).map((b) => [b.blockId, b]));
    const beats: PlayBeat[] = view.blocks.map((block) => {
      const state = states.get(block.id);
      const role = {
        gradable: gradableBlock(block.kind, block.data),
        gating: gates(block.kind) && answerable({ type: block.kind, ...block.data }),
      };
      return {
        id: block.id,
        kind: block.kind,
        data: forLearner(block.id, block.kind, block.data),
        md: block.md,
        ...(block.frame ? { frame: block.frame } : {}),
        ...role,
        state: state
          ? { correct: state.correct, attempts: state.attempts, done: state.completedAt !== null }
          : null,
      };
    });
    const moduleIndex = view.moduleNumber - 1;
    return {
      routeTitle: view.routeTitle,
      sourceLocale: view.sourceLocale,
      title: view.title,
      moduleNumber: view.moduleNumber,
      moduleTitle: view.moduleTitle,
      topicNumber: view.topicNumber,
      topicTotal: view.topicTotal,
      outline: outlineOf(snapshot, records, view.topicNumber, moduleIndex),
      beats,
      xp: {
        topic: (record?.blocks ?? []).reduce((sum, b) => sum + xpOf(b), 0),
        route: records.reduce((sum, r) => sum + r.blocks.reduce((s, b) => s + xpOf(b), 0), 0),
      },
      brandColor: space.brandColor ?? null,
      locked: view.locked,
      done: record?.status === "completed",
      next: view.next,
    };
  },
});

function gradableBlock(kind: string, data: Record<string, unknown>): boolean {
  return grade({ type: kind, ...data }, {}).gradable;
}

export interface AnswerResult {
  correct: boolean | null;
  score: number | null;
  attempts: number;
  /** What to read next to the result; null when the block has nothing to say. */
  explanation: LocalizedText | null;
  /** Per-part feedback: wrong positions, statements' why, a roleplay's notes. */
  detail: unknown;
  /** The right answer, shown after the second wrong try or once passed. */
  solution: unknown;
  xp: { gained: number; topic: number; route: number };
}

export const lessonAnswer = defineAction({
  name: "lesson.answer",
  kind: "mutation",
  description:
    "Answer one block of a topic of your own enrollment. The server grades it and keeps the attempt.",
  input: z.strictObject({
    enrollmentId: z.uuid(),
    blockId: z.uuid(),
    // Bounded: a submission is a few choices, never a document.
    submission: z
      .record(z.string(), z.unknown())
      .refine((s) => JSON.stringify(s).length <= 8000, "too large"),
  }),
  target: (input) => ({ kind: "enrollment", id: input.enrollmentId }),
  run: async (ctx, input, given): Promise<AnswerResult> => {
    const { spaceId } = inSpace(given);
    const { enrollment, snapshot } = await place(ctx, spaceId, input.enrollmentId);
    const block = answerableBlock(snapshot, input.blockId);
    const data = block.data as Record<string, unknown>;
    const submission = fromLearner(block.id, block.kind, data, input.submission);
    const grading = grade({ type: block.kind, ...data }, submission);
    const now = ctx.clock.now();
    const userId = ctx.actor.userId;

    return ctx.repos.transaction(async (repos) => {
      const records = await repos.learning.progress(spaceId, enrollment.id);
      const record = recordFor(records, enrollment.id, block.lessonId);
      const before = record.blocks.find((b) => b.blockId === block.id);
      const after = recordSubmission(
        before ? fromState(block.kind, before) : newAttempt(block.kind),
        { payload: submission, grading, complete: true, now },
      );
      const state = toState(block.id, after);
      const saved: ProgressRecord = {
        ...record,
        status: record.status === "completed" ? "completed" : "in_progress",
        blocks: [...record.blocks.filter((b) => b.blockId !== block.id), state],
      };
      unwrap(await repos.learning.saveProgress(spaceId, userId, saved));
      // A gradable answer feeds the review schedule, so what was hard comes back.
      if (grading.gradable && before?.correct !== true) {
        await schedule(repos, spaceId, userId, block.id, fsrsRating(after), now);
      }
      const all = [...records.filter((r) => r.lessonId !== block.lessonId), saved];
      return {
        correct: grading.correct,
        score: grading.score,
        attempts: after.attempts,
        explanation: explanationOf(block.kind, data, input.submission, grading.correct),
        detail: detailOf(block.id, block.kind, data, submission, grading.detail),
        solution: revealsSolution(grading.correct, after.attempts)
          ? solutionOf(block.id, block.kind, data)
          : null,
        xp: {
          gained: before?.correct === true ? 0 : xpOf(state),
          topic: sumXp([saved]),
          route: sumXp(all),
        },
      };
    });
  },
});

/** The solution shows once passed, or after the second wrong try. */
const revealsSolution = (correct: boolean | null, attempts: number) =>
  correct !== false || attempts >= 2;

const sumXp = (records: ProgressRecord[]) =>
  records.reduce((sum, r) => sum + r.blocks.reduce((s, b) => s + xpOf(b), 0), 0);

/** A block of the version, outside a locked module; not_found otherwise. */
function answerableBlock(snapshot: Snapshot, blockId: string) {
  const block = snapshot.blocks.find((b) => b.id === blockId);
  const moduleIndex = block
    ? snapshot.modules.findIndex((m) => m.id === lessonModule(snapshot, block.lessonId))
    : -1;
  if (!block || (snapshot.route.pricing === "paid" && moduleIndex > 0)) {
    throw refused("not_found");
  }
  return block;
}

function recordFor(
  records: ProgressRecord[],
  enrollmentId: string,
  lessonId: string,
): ProgressRecord {
  return (
    records.find((r) => r.lessonId === lessonId) ?? {
      enrollmentId,
      lessonId,
      status: "in_progress",
      completedAt: null,
      blocks: [],
    }
  );
}

async function schedule(
  repos: Repos,
  spaceId: string,
  userId: string,
  itemId: string,
  rating: number | null,
  now: number,
) {
  if (rating === null) {
    return;
  }
  const locked = await repos.learning.lockCard(spaceId, userId, itemId);
  if (locked.ok) {
    const next = review(locked.value.card, rating, now);
    await repos.learning.saveCard(spaceId, userId, locked.value.id, next.card, next.nextReviewAt);
  }
}

export const lessonFinish = defineAction({
  name: "lesson.finish",
  kind: "mutation",
  description: "Mark a topic of your own enrollment done once every block that gates it is passed.",
  input: z.strictObject({ enrollmentId: z.uuid(), topic: z.int().positive().max(10_000) }),
  target: (input) => ({ kind: "enrollment", id: input.enrollmentId }),
  run: async (ctx, input, given) => {
    const { spaceId } = inSpace(given);
    const { enrollment, snapshot } = await place(ctx, spaceId, input.enrollmentId);
    const view = lessonView(snapshot, input.topic, { spaceId, kind: "p", creator: { es: "" } });
    if (view === null || view.locked) {
      throw refused("not_found");
    }
    const lesson =
      snapshot.blocks.find((b) => b.id === view.blocks[0]?.id)?.lessonId ??
      lessonAt(snapshot, input.topic);
    if (!lesson) {
      throw refused("not_found");
    }
    return ctx.repos.transaction(async (repos) => {
      const records = await repos.learning.progress(spaceId, enrollment.id);
      const record = recordFor(records, enrollment.id, lesson);
      const passed = new Set(
        record.blocks.filter((b) => b.completedAt !== null).map((b) => b.blockId),
      );
      const missing = view.blocks.filter(
        (b) => gates(b.kind) && answerable({ type: b.kind, ...b.data }) && !passed.has(b.id),
      );
      if (missing.length > 0) {
        return { done: false, missing: missing.map((b) => b.id) };
      }
      if (record.status !== "completed") {
        unwrap(
          await repos.learning.saveProgress(spaceId, ctx.actor.userId, {
            ...record,
            status: "completed",
            completedAt: ctx.clock.now(),
          }),
        );
      }
      return { done: true, missing: [] as string[] };
    });
  },
});

function lessonModule(snapshot: Snapshot, lessonId: string) {
  return snapshot.lessons.find((l) => l.id === lessonId)?.moduleId;
}

function lessonAt(snapshot: Snapshot, number: number) {
  const ordered = snapshot.modules.flatMap((m) =>
    snapshot.lessons.filter((l) => l.moduleId === m.id),
  );
  return ordered[number - 1]?.id;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** Epoch milliseconds as an ISO 8601 UTC timestamp, without reading a clock (core stays pure). */
export function isoOf(ms: number): string {
  const days = Math.floor(ms / 86_400_000);
  const rest = ms - days * 86_400_000;
  // Howard Hinnant's civil_from_days.
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  const h = Math.floor(rest / 3_600_000);
  const m = Math.floor((rest % 3_600_000) / 60_000);
  const sec = Math.floor((rest % 60_000) / 1000);
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(h)}:${pad(m)}:${pad(sec)}.${pad(rest % 1000, 3)}Z`;
}

const iso = (ms: number | null) => (ms === null ? null : isoOf(ms));
const ms = (text: string | null) => (text === null ? null : Date.parse(text));

function fromState(kind: string, state: BlockState): Attempt {
  return {
    blockType: kind,
    attempts: state.attempts,
    correct: state.correct,
    score: state.score,
    completedAt: ms(state.completedAt),
    releasedAt: ms(state.releasedAt),
    payload: null,
  };
}

function toState(blockId: string, attempt: Attempt): BlockState {
  return {
    blockId,
    attempts: attempt.attempts,
    correct: attempt.correct,
    score: attempt.score,
    releasedAt: iso(attempt.releasedAt),
    completedAt: iso(attempt.completedAt),
  };
}

function explanationOf(
  kind: string,
  data: Record<string, unknown>,
  submission: unknown,
  correct: boolean | null,
) {
  if (kind === "check" && correct === false) {
    const chosen = asObject(submission).option_index;
    const why = typeof chosen === "number" ? asObject(asArray(data.options)[chosen]).why : null;
    if (why) {
      return why as LocalizedText;
    }
  }
  return (data.explanation as LocalizedText | undefined) ?? null;
}

function detailOf(
  id: string,
  kind: string,
  data: Record<string, unknown>,
  submission: unknown,
  detail: unknown,
) {
  const payload = asObject(submission);
  switch (kind) {
    case "true_false": {
      const statements = asArray(data.statements).map(asObject);
      return statements.map((s, i) => ({
        right: asArray(payload.answers)[i] === (s.answer === true),
        answer: s.answer === true,
        why: s.why ?? null,
      }));
    }
    case "order":
      return { wrong: asArray(detail).map((place) => place) };
    case "drag_drop": {
      const matches = asObject(payload.matches);
      const count = asArray(data.pairs).length;
      return {
        wrong: Array.from({ length: count }, (_, i) => i)
          .filter((i) => matches[String(i)] !== String(i))
          .map((i) => itemKey(id, i)),
      };
    }
    case "sim": {
      const sim = asObject(data.sim);
      if (sim.kind === "roleplay") {
        const picks = asArray(asObject(payload.state).picks);
        return {
          ...asObject(detail),
          notes: asArray(sim.turns).map((turn, i) => {
            const choice = asObject(asArray(asObject(turn).choices)[picks[i] as number]);
            return { score: choice.score ?? 0, note: choice.note ?? null };
          }),
        };
      }
      return detail ?? null;
    }
    default:
      return detail ?? null;
  }
}

function solutionOf(id: string, kind: string, data: Record<string, unknown>) {
  switch (kind) {
    case "check":
      return { option_index: asArray(data.options).findIndex((o) => asObject(o).correct === true) };
    case "order":
      return { order: asArray(data.items).map((_, i) => itemKey(id, i)) };
    case "drag_drop":
      return {
        matches: Object.fromEntries(
          asArray(data.pairs).map((_, i) => [itemKey(id, i), itemKey(id, i + 1000)]),
        ),
      };
    case "fill_blank":
      return { blanks: data.blanks };
    case "true_false":
      return { answers: asArray(data.statements).map((s) => asObject(s).answer === true) };
    case "estimate":
      return { min: data.answer_min, max: data.answer_max };
    case "hotspot":
      return { spot: asArray(data.spots).findIndex((s) => asObject(s).correct === true) };
    case "sim": {
      const sim = asObject(data.sim);
      if (sim.kind === "chess_mate_in_one") {
        return { move: sim.solution };
      }
      if (sim.kind === "piano_chord" || sim.kind === "guitar_chord" || sim.kind === "css_flex") {
        return { target: sim.target };
      }
      return null;
    }
    default:
      return null;
  }
}

/** For a test or a contract: what a repo-less caller would read. */
export type PlayerRepos = Pick<Repos, "learning">;
