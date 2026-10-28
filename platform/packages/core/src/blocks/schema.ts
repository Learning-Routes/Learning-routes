import { z } from "zod";
import { LocalizedText } from "../localized-text";

// Field names are the ones v1 content carries (test/golden/lesson_parser.json).
// Every schema is strict: a field nobody declared fails. The same builder makes
// the stored schema and the v1 import schema (v1.ts), so the fields exist once.

// biome-ignore lint/suspicious/noExplicitAny: the builder takes any text schema
type TextSchema = z.ZodType<any, any>;

/**
 * Builds the block union for one text schema, so the stored Block and the v1
 * import share their fields. New: v1 sections were untyped hashes.
 */
export function blockSchemas<T extends TextSchema, P extends z.ZodType, I extends z.ZodRawShape>(
  text: T,
  pairOf: (text: T) => P,
  idShape: I,
) {
  const optionalText = text.nullish();
  // Fields every block may carry: its heading, and what the author wrote after it.
  const common = { ...idShape, title: optionalText, aftermath: optionalText };

  return z.discriminatedUnion("type", [
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
      options: z.array(z.strictObject({ label: text, correct: z.boolean() })),
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
    z.strictObject({
      type: z.literal("drag_drop"),
      ...common,
      intro: optionalText,
      body: optionalText,
      pairs: z.array(pairOf(text)),
    }),
    z.strictObject({
      type: z.literal("fill_blank"),
      ...common,
      sentence: optionalText,
      body: optionalText,
      blanks: z.array(text),
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
      type: z.literal("flashcards"),
      ...common,
      body: optionalText,
      cards: z.array(z.strictObject({ front: text, back: text })),
    }),
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
    }),
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
