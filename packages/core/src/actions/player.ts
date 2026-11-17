import * as z from "zod";
import { type LessonBlock, lessonView } from "../content/lesson-view";
import { forLearner, fromLearner, gates } from "../content/player-view";
import type { Snapshot } from "../content/snapshot";
import { fsrsRating, newAttempt, recordSubmission } from "../learning/attempt";
import { answerable, grade } from "../learning/grader";
import { detailOf, explanationOf, revealsSolution, solutionOf } from "../learning/player-feedback";
import type { LocalizedText } from "../localized-text";
import type { ProgressRecord, Repos } from "../repos/ports";
import { milestoneAfter } from "./community-milestone";
import { defineAction, inSpace } from "./define";
import { ownReading } from "./enrollments";
import { fromState, recordFor, schedule, sumXp, toState, xpOf } from "./player-progress";
import { refused, unwrap } from "./results";

// The lesson player (Platform STEP 12): a topic as beats without their answers, one answer at a
// time graded on the server, and the topic finished once its gates are passed.

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

async function place(
  ctx: Parameters<typeof lessonPlay.run>[0],
  spaceId: string,
  enrollmentId: string,
) {
  // Two queries: the enrollment with its version and space, then its progress (Platform STEP 15).
  const reading = await ownReading(ctx.repos, spaceId, enrollmentId, ctx.actor.userId);
  const records = await ctx.repos.learning.progress(spaceId, reading.enrollment.id);
  return { ...reading, records };
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
    const { snapshot, records, space } = await place(ctx, spaceId, input.enrollmentId);
    const view = lessonView(snapshot, input.topic, { spaceId, kind: "p", creator: space.name });
    if (view === null) {
      throw refused("not_found");
    }
    const lessonId = lessonAt(snapshot, view.topicNumber);
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
      // A block already passed keeps its result: answering it again is practice, not a new score.
      const state = before?.correct === true ? before : toState(block.id, after);
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
    const lesson = lessonAt(snapshot, view.topicNumber);
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
        const place = { spaceId, routeId: enrollment.routeId, snapshot };
        await milestoneAfter(ctx, repos, place, lesson, records);
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

/** For a test or a contract: what a repo-less caller would read. */
export type PlayerRepos = Pick<Repos, "learning">;
