import * as z from "zod";
import { lessonView } from "../content/lesson-view";
import { TUTOR_LIMITS, type TutorQuestion, tutorMessages } from "../tutor/tutor";
import { ActionError, defineAction, inSpace } from "./define";
import { ownReading } from "./enrollments";
import { refused } from "./results";

// The learner's tutor (Platform STEP 20 §A). This takes one of the day's questions and says what
// to ask the model; the API asks it after this commits, since no model call runs inside a
// transaction, and records what the answer used.

const DAY = 86_400_000;

/** Today's start, in UTC: the day the limit counts. */
const dayStart = (now: number) => now - (now % DAY);

const Text = z.string().trim().min(1).max(TUTOR_LIMITS.questionChars);

export const tutorAsk = defineAction({
  name: "tutor.ask",
  kind: "mutation",
  description:
    "Ask the tutor about a topic of your own enrollment: it takes one of the day's questions.",
  input: z.strictObject({
    enrollmentId: z.uuid(),
    topic: z.int().positive().max(10_000),
    beat: z.int().nonnegative().max(1_000).nullish(),
    lastAnswer: Text.nullish(),
    question: Text,
  }),
  target: (input) => ({ kind: "enrollment", id: input.enrollmentId }),
  async run(ctx, input, given) {
    const { spaceId } = inSpace(given);
    const { snapshot, space } = await ownReading(
      ctx.repos,
      spaceId,
      input.enrollmentId,
      ctx.actor.userId,
    );
    const view = lessonView(snapshot, input.topic, { spaceId, kind: "p", creator: space.name });
    if (view === null || view.locked || (input.beat != null && input.beat >= view.blocks.length)) {
      throw refused("not_found");
    }
    const records = await ctx.repos.learning.progress(spaceId, input.enrollmentId);
    const passed = new Set(
      records.flatMap((record) =>
        record.blocks.filter((b) => b.correct === true).map((b) => b.blockId),
      ),
    );
    const now = ctx.clock.now();
    const id = await ctx.repos.tutor.take(
      spaceId,
      ctx.actor.userId,
      input.enrollmentId,
      dayStart(now),
      TUTOR_LIMITS.questionsPerDay,
      now,
    );
    if (id === null) {
      throw new ActionError("rate_limited", "the tutor's questions for today are spent");
    }
    const asked: TutorQuestion = {
      routeTitle: view.routeTitle,
      topicTitle: view.title,
      locale: view.sourceLocale,
      beats: view.blocks.map((block) => ({ block, passed: passed.has(block.id) })),
      beat: input.beat ?? null,
      lastAnswer: input.lastAnswer ?? null,
      question: input.question,
    };
    return { questionId: id, ...tutorMessages(asked) };
  },
});
