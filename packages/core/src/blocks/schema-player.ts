import * as z from "zod";
import { simSchema } from "./sims";

// The block kinds made for the player (Platform STEP 12), built by schema.ts's blockSchemas with
// the same text schema and common fields as every other kind.

// biome-ignore lint/suspicious/noExplicitAny: the builder takes any text schema
type TextSchema = z.ZodType<any, any>;

// One question per screen in the player (Platform STEP 12).
export function questionBlocks<T extends TextSchema, C extends z.ZodRawShape>(text: T, common: C) {
  const optionalText = text.nullish();
  return [
    z.strictObject({
      type: z.literal("order"),
      ...common,
      prompt: text,
      // Written in the right order; the player shuffles them.
      items: z.array(text).min(2).max(8),
      explanation: optionalText,
    }),
    z.strictObject({
      type: z.literal("true_false"),
      ...common,
      prompt: optionalText,
      statements: z
        .array(z.strictObject({ text, answer: z.boolean(), why: optionalText }))
        .min(1)
        .max(10),
    }),
    z.strictObject({
      type: z.literal("estimate"),
      ...common,
      prompt: text,
      min: z.number(),
      max: z.number(),
      step: z.number().positive(),
      unit: z.string().max(12).nullish(),
      answer_min: z.number(),
      answer_max: z.number(),
      anchors: z
        .array(z.strictObject({ value: z.number(), label: text }))
        .max(5)
        .optional(),
      explanation: optionalText,
    }),
    z.strictObject({
      type: z.literal("hotspot"),
      ...common,
      prompt: text,
      image_url: z.string().nullish(),
      // A drawing the player ships, by name, when there is no image.
      diagram: z.enum(["disc_brake"]).nullish(),
      alt_text: optionalText,
      spots: z
        .array(
          z.strictObject({
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
            label: text,
            correct: z.boolean(),
          }),
        )
        .min(2)
        .max(8),
      explanation: optionalText,
    }),
  ] as const;
}

// What the player shows and lets a learner try, without a gate (Platform STEP 12).
export function practiceBlocks<T extends TextSchema, C extends z.ZodRawShape>(text: T, common: C) {
  const optionalText = text.nullish();
  return [
    z.strictObject({
      type: z.literal("worked_example"),
      ...common,
      problem: text,
      steps: z
        .array(z.strictObject({ label: text, work: z.string().max(200), why: optionalText }))
        .min(1)
        .max(8),
    }),
    z.strictObject({
      type: z.literal("speak"),
      ...common,
      phrase: z.string().min(1).max(300),
      lang: z.string().min(2).max(12),
      translation: optionalText,
      tip: optionalText,
    }),
    z.strictObject({
      type: z.literal("code_check"),
      ...common,
      prompt: text,
      language: z.enum(["javascript"]),
      starter: z.string().max(4000),
      // Each call is an expression; expected is what it must print, compared as JSON.
      tests: z
        .array(z.strictObject({ call: z.string().min(1).max(300), expected: z.string().max(300) }))
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
    z.strictObject({
      type: z.literal("sim"),
      ...common,
      prompt: text,
      explanation: optionalText,
      sim: simSchema(text),
    }),
  ] as const;
}
