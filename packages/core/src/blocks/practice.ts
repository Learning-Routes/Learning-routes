import * as z from "zod";
import { LanguageTag } from "./sims";

// The player's question and worked-content types (Platform STEP 12). Strict like every block; a
// field the grader needs is checked here, so a stored block can always be graded.

// biome-ignore lint/suspicious/noExplicitAny: the builder takes any text schema
type TextSchema = z.ZodType<any, any>;

/** The built-in pictures a hotspot can use instead of an image: SVG components in the player. */
export const HOTSPOT_DIAGRAMS = ["brake"] as const;

const Unit = z.number().min(0).max(1);

// What the graders read of each question, with no text checked. Every other field is left alone.
export const ORDER_FIELDS = z.object({ items: z.array(z.unknown()).min(2) });
export const TRUE_FALSE_FIELDS = z.object({
  statements: z.array(z.object({ answer: z.boolean() })).min(1),
});
export const ESTIMATE_FIELDS = z
  .object({ min: z.number(), max: z.number(), answer_min: z.number(), answer_max: z.number() })
  .refine(
    (b) =>
      b.min < b.max &&
      b.min <= b.answer_min &&
      b.answer_min <= b.answer_max &&
      b.answer_max <= b.max,
    { message: "the answer range sits inside the scale" },
  );
export const HOTSPOT_FIELDS = z
  .object({
    spots: z.array(z.object({ correct: z.boolean() })).min(1),
    image_url: z.string().nullish(),
    diagram: z.string().nullish(),
  })
  .refine((b) => !b.image_url !== !b.diagram, {
    message: "a hotspot has an image or a diagram, not both",
  })
  .refine((b) => b.spots.some((spot) => spot.correct), { message: "a hotspot has a correct spot" });

/** What is wrong with a question's numbers, beyond its fields' own types; null when nothing. */
export function questionProblem(block: unknown): string | null {
  const type = (block as { type?: unknown } | null)?.type;
  const fields = type === "estimate" ? ESTIMATE_FIELDS : type === "hotspot" ? HOTSPOT_FIELDS : null;
  const checked = fields?.safeParse(block);
  return checked && !checked.success ? (checked.error.issues[0]?.message ?? "invalid") : null;
}
const HTTPS = /^https:\/\//;

/** Questions the server grades. */
export function questionBlocks<T extends TextSchema, C extends z.ZodRawShape>(text: T, common: C) {
  const optionalText = text.nullish();
  return [
    z.strictObject({
      type: z.literal("order"),
      ...common,
      prompt: text,
      // In the correct order; the player shuffles them.
      items: z.array(text).min(2).max(8),
      explanation: optionalText,
    }),
    z.strictObject({
      type: z.literal("true_false"),
      ...common,
      statements: z
        .array(z.strictObject({ text, answer: z.boolean(), why: optionalText }))
        .min(2)
        .max(10),
    }),
    z.strictObject({
      type: z.literal("estimate"),
      ...common,
      prompt: text,
      min: z.number(),
      max: z.number(),
      step: z.number().positive(),
      unit: optionalText,
      answer_min: z.number(),
      answer_max: z.number(),
      anchors: z.array(z.strictObject({ value: z.number(), label: text })).nullish(),
      explanation: optionalText,
    }),
    z.strictObject({
      type: z.literal("hotspot"),
      ...common,
      prompt: text,
      // On the content host, like every image a creator brings.
      image_url: z.string().regex(HTTPS).nullish(),
      diagram: z.enum(HOTSPOT_DIAGRAMS).nullish(),
      spots: z
        .array(z.strictObject({ x: Unit, y: Unit, label: text, correct: z.boolean() }))
        .min(2)
        .max(8),
      explanation: optionalText,
    }),
  ] as const;
}

/** What a student works through, says, codes or writes: no server grade (the tutor grades open answers). */
export function workBlocks<T extends TextSchema, C extends z.ZodRawShape>(text: T, common: C) {
  const optionalText = text.nullish();
  return [
    z.strictObject({
      type: z.literal("worked_example"),
      ...common,
      problem: text,
      steps: z
        .array(z.strictObject({ label: text, work: z.string(), why: text }))
        .min(1)
        .max(8),
    }),
    z.strictObject({
      type: z.literal("speak"),
      ...common,
      // In the language being learnt, so never localized.
      phrase: z.string().min(1),
      lang: LanguageTag,
      translation: optionalText,
    }),
    z.strictObject({
      type: z.literal("code_check"),
      ...common,
      language: z.literal("javascript"),
      starter: z.string(),
      tests: z
        .array(z.strictObject({ call: z.string().min(1), expected: z.string() }))
        .min(1)
        .max(6),
      hint: optionalText,
    }),
    z.strictObject({
      type: z.literal("open_answer"),
      ...common,
      prompt: text,
      rubric: z.array(text).min(1).max(5),
      model_answer: optionalText,
    }),
  ] as const;
}
