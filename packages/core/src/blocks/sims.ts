import * as z from "zod";

// The simulators a `sim` block can run (Platform STEP 12). Each kind carries only the numbers and
// words its stage needs; its grader recomputes the goal from what the learner set, never from a
// flag the browser sends. Text a learner reads comes through `text` (localized); words in the
// language being taught (a roleplay line) are plain strings on purpose.

// biome-ignore lint/suspicious/noExplicitAny: the builder takes any text schema
type TextSchema = z.ZodType<any, any>;

export const SIM_KINDS = [
  "piano_chord",
  "guitar_chord",
  "camera_exposure",
  "compound_interest",
  "css_flex",
  "fraction_pie",
  "ohm",
  "equation_balance",
  "chess_mate_in_one",
  "color_wheel",
  "roleplay",
  "cpr_rhythm",
  "step_sequencer",
] as const;
export type SimKind = (typeof SIM_KINDS)[number];

/** Kinds a learner can get right or wrong; the rest are practice the browser measures. */
export const GRADABLE_SIMS: readonly SimKind[] = [
  "piano_chord",
  "guitar_chord",
  "camera_exposure",
  "compound_interest",
  "css_flex",
  "fraction_pie",
  "ohm",
  "equation_balance",
  "chess_mate_in_one",
  "color_wheel",
  "roleplay",
];

export const APERTURES = [1.8, 2.8, 4, 5.6, 8, 11, 16] as const;
export const SHUTTERS = [30, 60, 125, 250, 500, 1000] as const;
export const ISOS = [100, 200, 400, 800, 1600, 3200] as const;
export const FLEX_JUSTIFY = ["flex-start", "center", "flex-end", "space-between"] as const;
export const FLEX_ALIGN = ["flex-start", "center", "flex-end"] as const;

const SQUARE = /^[a-h][1-8]$/;
const UCI = /^[a-h][1-8][a-h][1-8]$/;
const FEN_BOARD = /^([prnbqkPRNBQK1-8]{1,8}\/){7}[prnbqkPRNBQK1-8]{1,8}$/;
const ELEMENT = /^[A-Z][a-z]?$/;

const range = (lo: number, hi: number) =>
  z.tuple([z.number().min(lo).max(hi), z.number().min(lo).max(hi)]).refine(([a, b]) => a < b);

function musicSims<T extends TextSchema>(_text: T) {
  return [
    z.strictObject({
      kind: z.literal("piano_chord"),
      // Pitch classes 0 (C) to 11 (B); the keyboard spans low..high in MIDI numbers.
      target: z.array(z.int().min(0).max(11)).min(1).max(6),
      low: z.int().min(21).max(108).default(60),
      high: z.int().min(21).max(108).default(76),
    }),
    z.strictObject({
      kind: z.literal("guitar_chord"),
      // String number (1 = high e … 6 = low E) to fret; strings left out ring open.
      target: z.partialRecord(z.enum(["1", "2", "3", "4", "5", "6"]), z.int().min(1).max(5)),
      name: z.string().max(20).optional(),
    }),
    z.strictObject({
      kind: z.literal("step_sequencer"),
      bpm: z.int().min(50).max(200).default(90),
      rows: z
        .array(
          z.strictObject({
            name: z.string().min(1).max(20),
            sound: z.enum(["kick", "snare", "hat", "clap"]),
            steps: z.array(z.int().min(0).max(15)).max(16),
          }),
        )
        .min(1)
        .max(4),
    }),
  ] as const;
}

function scienceSims<T extends TextSchema>(_text: T) {
  return [
    z.strictObject({
      kind: z.literal("camera_exposure"),
      scene_ev: z.number().min(3).max(17),
      // The slowest shutter (1/n) that still freezes the subject, if there is one.
      min_shutter: z.union(SHUTTERS.map((s) => z.literal(s))).optional(),
    }),
    z.strictObject({
      kind: z.literal("ohm"),
      target_amps: z.number().positive(),
      v: range(0, 1000),
      r: range(0.1, 100_000),
      tolerance: z.number().positive().max(10).default(0.05),
    }),
    z.strictObject({
      kind: z.literal("equation_balance"),
      terms: z
        .array(
          z.strictObject({
            formula: z.string().min(1).max(30),
            side: z.enum(["left", "right"]),
            atoms: z.record(z.string().regex(ELEMENT), z.int().min(1).max(20)),
          }),
        )
        .min(2)
        .max(6),
      max: z.int().min(2).max(9).default(6),
    }),
    z.strictObject({
      kind: z.literal("cpr_rhythm"),
      min_bpm: z.int().min(40).max(200).default(100),
      max_bpm: z.int().min(40).max(220).default(120),
      count: z.int().min(5).max(60).default(15),
    }),
  ] as const;
}

function numberSims<T extends TextSchema>(_text: T) {
  return [
    z.strictObject({
      kind: z.literal("compound_interest"),
      rate: z.number().gt(0).max(0.5),
      years: z.int().min(1).max(60),
      goal: z.number().positive(),
      min: z.number().nonnegative(),
      max: z.number().positive(),
      step: z.number().positive(),
      currency: z.string().max(4).default("$"),
    }),
    z.strictObject({
      kind: z.literal("css_flex"),
      target: z.strictObject({ justify: z.enum(FLEX_JUSTIFY), align: z.enum(FLEX_ALIGN) }),
    }),
    z.strictObject({
      kind: z.literal("fraction_pie"),
      parts: z.int().min(2).max(12),
      target: z.int().min(1).max(12),
    }),
    z.strictObject({
      kind: z.literal("color_wheel"),
      base: z.int().min(0).max(11),
      relation: z.enum(["complement", "analogous", "triad"]),
    }),
  ] as const;
}

function playSims<T extends TextSchema>(text: T) {
  return [
    z.strictObject({
      kind: z.literal("chess_mate_in_one"),
      // The board part of a FEN; the side to move is white.
      fen: z.string().regex(FEN_BOARD),
      solution: z.string().regex(UCI),
      // The squares whose pieces the learner may move; the rest only stand there.
      movable: z.array(z.string().regex(SQUARE)).min(1).max(4),
    }),
    z.strictObject({
      kind: z.literal("roleplay"),
      lang: z.string().min(2).max(12),
      partner: z.string().max(40).optional(),
      turns: z
        .array(
          z.strictObject({
            line: z.string().min(1).max(400),
            choices: z
              .array(
                z.strictObject({
                  text: z.string().min(1).max(400),
                  score: z.int().min(0).max(2),
                  note: text,
                  reply: z.string().max(400),
                }),
              )
              .min(2)
              .max(4),
          }),
        )
        .min(1)
        .max(5),
    }),
  ] as const;
}

export function simSchema<T extends TextSchema>(text: T) {
  return z.discriminatedUnion("kind", [
    ...musicSims(text),
    ...scienceSims(text),
    ...numberSims(text),
    ...playSims(text),
  ]);
}
