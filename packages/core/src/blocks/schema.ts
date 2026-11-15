import * as z from "zod";
import { LocalizedText } from "../localized-text";
import { simSchema } from "./sims";

// Field names are the ones v1 content carries (test/golden/lesson_parser.json).
// Every schema is strict: a field nobody declared fails. The same builder makes
// the stored schema and the v1 import schema (v1.ts), so the fields exist once.

// biome-ignore lint/suspicious/noExplicitAny: the builder takes any text schema
type TextSchema = z.ZodType<any, any>;

const SHA256 = /^[0-9a-f]{64}$/;
export const CREATION_SHAPES = ["wide", "standard", "square", "tall"] as const;

// What a student reads, and the check of what they read.
function textBlocks<T extends TextSchema, C extends z.ZodRawShape>(text: T, common: C) {
  const optionalText = text.nullish();
  return [
    z.strictObject({
      type: z.literal("concept"),
      ...common,
      body: text,
      contains_diagram: z.boolean().optional(),
    }),
    z.strictObject({
      type: z.literal("check"),
      ...common,
      question: text,
      // why: what the learner reads after choosing this option when it is wrong (STEP 12).
      options: z.array(z.strictObject({ label: text, correct: z.boolean(), why: optionalText })),
      explanation: optionalText,
      xp: z.int().nonnegative().optional(),
    }),
    z.strictObject({ type: z.literal("tip"), ...common, body: text }),
    z.strictObject({ type: z.literal("example"), ...common, body: text }),
    z.strictObject({
      type: z.literal("summary"),
      ...common,
      key_points: z.array(text),
      body: optionalText,
    }),
  ] as const;
}

// What a student practises with.
function exerciseBlocks<T extends TextSchema, C extends z.ZodRawShape, P extends z.ZodType>(
  text: T,
  common: C,
  pairOf: (text: T) => P,
) {
  const optionalText = text.nullish();
  return [
    z.strictObject({
      type: z.literal("drag_drop"),
      ...common,
      intro: optionalText,
      body: optionalText,
      pairs: z.array(pairOf(text)),
      left_label: optionalText,
      right_label: optionalText,
    }),
    z.strictObject({
      type: z.literal("fill_blank"),
      ...common,
      sentence: optionalText,
      body: optionalText,
      blanks: z.array(text),
      // A word bank: the answers and some distractors, as chips to tap (STEP 12).
      choices: z.array(text).max(12).optional(),
      // "text" (the default) forgives case, accents and punctuation; "exact" only
      // the surrounding whitespace, for code, formulas and symbols (ADR 0003).
      match: z.enum(["text", "exact"]).optional(),
    }),
    z.strictObject({
      type: z.literal("code_playground"),
      ...common,
      body: optionalText,
      language: z.string(),
      code: z.string(),
      expected_output: z.string().nullish(),
    }),
    z.strictObject({
      type: z.literal("simulation"),
      ...common,
      body: optionalText,
      formula: z.string().nullish(),
      variables: z.array(
        z.strictObject({ name: z.string(), min: z.number(), max: z.number(), default: z.number() }),
      ),
    }),
    z.strictObject({
      type: z.literal("scenario"),
      ...common,
      body: optionalText,
      situation: optionalText,
      options: z.array(z.strictObject({ label: text, consequence: text })),
    }),
    z.strictObject({
      type: z.literal("cards"),
      ...common,
      body: optionalText,
      cards: z.array(z.strictObject({ front: text, back: text })),
    }),
  ] as const;
}

// One question per screen in the player (Platform STEP 12).
function questionBlocks<T extends TextSchema, C extends z.ZodRawShape>(text: T, common: C) {
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
function practiceBlocks<T extends TextSchema, C extends z.ZodRawShape>(text: T, common: C) {
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

// Pictures, scenes, sound and video.
function mediaBlocks<T extends TextSchema, C extends z.ZodRawShape>(text: T, common: C) {
  const optionalText = text.nullish();
  return [
    z.strictObject({
      type: z.literal("visual"),
      ...common,
      body: optionalText,
      image_url: z.string().nullish(),
      image_description: z.string().nullish(),
      alt_text: optionalText,
      caption: optionalText,
      contains_diagram: z.boolean().optional(),
      image_fallback: z.boolean().optional(),
    }),
    // The scene's own schema owns `data`; the block only carries it.
    z.strictObject({
      type: z.literal("motion"),
      ...common,
      body: optionalText,
      scene: z.string(),
      narration: optionalText,
      data: z.record(z.string(), z.unknown()),
    }),
    z.strictObject({
      type: z.literal("audio"),
      ...common,
      audio_url: z.string(),
      transcript: optionalText,
    }),
    // Nothing produces this block yet: voice is on standby (ADR 0003). The
    // fields are the ones the v1 partial reads.
    z.strictObject({
      type: z.literal("audio_explainer"),
      ...common,
      body: optionalText,
      audio_url: z.string().nullish(),
    }),
    // Every v1 recording had these as null; their types are read from the v1 partial.
    z.strictObject({
      type: z.literal("video"),
      ...common,
      body: optionalText,
      video_url: z.string(),
      subtitles_url: z.string().nullish(),
      duration_seconds: z.number().nonnegative().nullish(),
      lesson_id: z.string().nullish(),
      published_at: z.string().nullish(),
      source: z.string().nullish(),
      voice: z.string().nullish(),
      chapters: z
        .array(z.strictObject({ at: z.number().nonnegative(), title: text }))
        .max(20)
        .optional(),
    }),
    // creation: the SHA-256 of the stored file, which names it on the content host.
    z.strictObject({
      type: z.literal("interactive"),
      ...common,
      creation: z.string().regex(SHA256),
      // The frame's proportions: wide 16:9, standard 4:3, square 1:1, tall 3:4.
      shape: z.enum(CREATION_SHAPES).nullish(),
      description: optionalText,
      alt_text: optionalText,
    }),
  ] as const;
}

/**
 * Builds the block union for one text schema, so the stored Block and the v1
 * import share their fields. New: v1 sections were untyped hashes.
 */
export function blockSchemas<T extends TextSchema, P extends z.ZodType, I extends z.ZodRawShape>(
  text: T,
  pairOf: (text: T) => P,
  idShape: I,
) {
  // Fields every block may carry: its heading, and what the author wrote after it.
  const common = { ...idShape, title: text.nullish(), trailing_content: text.nullish() };
  return z.discriminatedUnion("type", [
    ...textBlocks(text, common),
    ...exerciseBlocks(text, common, pairOf),
    ...questionBlocks(text, common),
    ...practiceBlocks(text, common),
    ...mediaBlocks(text, common),
  ]);
}

export const BlockId = z.uuid({ version: "v7" });

export const Block = blockSchemas(
  LocalizedText,
  (text) => z.strictObject({ term: text, definition: text }),
  { id: BlockId },
);
export type Block = z.infer<typeof Block>;
export type BlockType = Block["type"];
