import * as z from "zod";
import { movesFrom } from "./chess-moves";
import {
  ALIGN,
  balanceable,
  exposable,
  futureValue,
  HUE_RELATIONS,
  JUSTIFY,
  onSlider,
} from "./sim-math";

// The sim block (Platform STEP 12): one strict schema per kind, each with its own params. A goal
// no student could reach is refused here, so every stored sim can be passed.

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

/** A BCP 47 tag, as speechSynthesis takes it: "en", "en-US", "pt-BR". */
export const LanguageTag = z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/);

/** A guitar's strings, 1 the thinnest. */
export const STRINGS = ["1", "2", "3", "4", "5", "6"] as const;
const PitchClass = z.int().min(0).max(11);
const Midi = z.int().min(21).max(108);
const Range = z.tuple([z.number().nonnegative(), z.number().nonnegative()]);
const UCI = /^([a-h][1-8])([a-h][1-8])$/;
const ELEMENT = /^[A-Z][a-z]?$/;

const unique = (values: readonly unknown[]) => new Set(values).size === values.length;
const ordered = ([low, high]: readonly [number, number]) => low <= high;

// The params with no text in them, the same for every text schema.
const NUMERIC_PARAMS = {
  piano_chord: z.object({ target: z.array(PitchClass).min(1).max(12), low: Midi, high: Midi }),
  guitar_chord: z.object({
    target: z.partialRecord(z.enum(STRINGS), z.int().min(0).max(5)),
  }),
  camera_exposure: z.object({
    scene_ev: z.number(),
    min_shutter_denominator: z.int().positive().optional(),
  }),
  compound_interest: z.object({
    rate: z.number().positive().max(100),
    years: z.int().min(1).max(60),
    goal: z.number().positive(),
    min: z.number().nonnegative(),
    max: z.number().positive(),
    step: z.number().positive(),
  }),
  css_flex: z.object({
    target: z.strictObject({ justify: z.enum(JUSTIFY), align: z.enum(ALIGN) }),
  }),
  fraction_pie: z.object({ parts: z.int().min(2).max(12), target: z.int().min(1) }),
  ohm: z.object({
    target_amps: z.number().positive(),
    v: Range,
    r: Range,
    tolerance: z.number().positive(),
  }),
  equation_balance: z.object({
    terms: z
      .array(
        z.strictObject({
          formula: z.string().min(1),
          atoms: z.record(z.string().regex(ELEMENT), z.int().min(1)),
          side: z.enum(["left", "right"]),
        }),
      )
      .min(2)
      .max(6),
    max: z.int().min(1).max(6),
  }),
  chess_mate_in_one: z.object({ fen: z.string(), solution: z.string().regex(UCI) }),
  color_wheel: z.object({ base: PitchClass, relation: z.enum(HUE_RELATIONS) }),
  cpr_rhythm: z.object({
    min_bpm: z.int().positive(),
    max_bpm: z.int().positive(),
    count: z.int().min(1).max(60),
  }),
};

function kindParams<T extends TextSchema>(text: T) {
  return {
    ...NUMERIC_PARAMS,
    roleplay: z.object({
      lang: LanguageTag,
      turns: z
        .array(
          z.strictObject({
            line: z.string().min(1),
            choices: z
              .array(
                z.strictObject({
                  text: z.string().min(1),
                  score: z.int().min(0).max(2),
                  note: text,
                  reply: z.string().min(1),
                }),
              )
              .min(2)
              .max(4),
          }),
        )
        .min(1)
        .max(5),
    }),
    step_sequencer: z.object({
      bpm: z.int().min(40).max(240),
      rows: z
        .array(z.strictObject({ name: text, steps: z.array(z.int().min(0).max(15)) }))
        .min(1)
        .max(8),
      challenge: text.nullish(),
    }),
  };
}

type Params<T extends TextSchema> = ReturnType<typeof kindParams<T>>;
export type SimKind = (typeof SIM_KINDS)[number];

/** One kind's params, with no text checked: what its grader reads. */
export const SIM_PARAMS = kindParams(z.unknown());
export type SimParams = { [K in SimKind]: z.infer<(typeof SIM_PARAMS)[K]> };

const keys = (low: number, high: number) =>
  new Set(Array.from({ length: high - low + 1 }, (_, i) => (low + i) % 12));

/** Whether a kind's params describe a goal a student can reach. */
export const REACHABLE: { [K in SimKind]: (p: SimParams[K]) => boolean } = {
  piano_chord: (p) =>
    p.low < p.high && unique(p.target) && p.target.every((pc) => keys(p.low, p.high).has(pc)),
  guitar_chord: (p) => Object.values(p.target).some((fret) => fret !== 0),
  camera_exposure: (p) => exposable(p.scene_ev, p.min_shutter_denominator),
  compound_interest: (p) =>
    p.min < p.max &&
    onSlider(p.max, p.min, p.max, p.step) &&
    futureValue(p.max, p.rate, p.years) >= p.goal,
  css_flex: () => true,
  fraction_pie: (p) => p.target <= p.parts,
  ohm: (p) =>
    ordered(p.v) &&
    ordered(p.r) &&
    p.r[0] > 0 &&
    p.target_amps <= p.v[1] / p.r[0] + p.tolerance &&
    p.target_amps >= p.v[0] / p.r[1] - p.tolerance,
  equation_balance: (p) =>
    p.terms.some((term) => term.side === "left") &&
    p.terms.some((term) => term.side === "right") &&
    balanceable(p.terms, p.max),
  chess_mate_in_one: (p) => {
    const [, from = "", to = ""] = UCI.exec(p.solution) ?? [];
    return movesFrom(p.fen, from).includes(to);
  },
  color_wheel: () => true,
  roleplay: () => true,
  cpr_rhythm: (p) => p.min_bpm < p.max_bpm,
  step_sequencer: (p) => p.rows.every((row) => unique(row.steps)),
};

/** The sim block, discriminated by kind, for one text schema. */
// The kind and its params sit in `setup`, one union inside one block type: thirteen more members
// in the block union itself are more than TypeScript can represent.
export function simBlock<T extends TextSchema, C extends z.ZodRawShape>(text: T, common: C) {
  const params = kindParams(text);
  const member = <K extends SimKind>(kind: K) =>
    z.strictObject({ kind: z.literal(kind), ...(params[kind] as Params<T>[K]).shape });
  const setup = z.discriminatedUnion("kind", [
    member("piano_chord"),
    member("guitar_chord"),
    member("camera_exposure"),
    member("compound_interest"),
    member("css_flex"),
    member("fraction_pie"),
    member("ohm"),
    member("equation_balance"),
    member("chess_mate_in_one"),
    member("color_wheel"),
    member("roleplay"),
    member("cpr_rhythm"),
    member("step_sequencer"),
  ]);
  return z.strictObject({
    type: z.literal("sim"),
    ...common,
    prompt: text,
    explanation: text.nullish(),
    setup,
  });
}

/** A sim's kind, or null when its setup names none we have. */
export function simKindOf(block: unknown): SimKind | null {
  const kind = (block as { setup?: { kind?: unknown } } | null)?.setup?.kind;
  // Safe: checked against SIM_KINDS.
  return (SIM_KINDS as readonly unknown[]).includes(kind) ? (kind as SimKind) : null;
}

/** This kind's params, or null when the setup does not hold them or their goal is out of reach. */
export function simParamsOf<K extends SimKind>(kind: K, setup: unknown): SimParams[K] | null {
  const params = SIM_PARAMS[kind].safeParse(setup);
  // Safe: parsed by this kind's own params schema.
  const own = params.success ? (params.data as SimParams[K]) : null;
  return own && REACHABLE[kind](own) ? own : null;
}

/** What is wrong with a sim's goal; null when a student can reach it. */
export function simProblem(block: unknown): string | null {
  const kind = simKindOf(block);
  if ((block as { type?: unknown } | null)?.type !== "sim" || kind === null) {
    return null;
  }
  const { setup } = block as { setup: unknown };
  return simParamsOf(kind, setup) ? null : `this ${kind} has no reachable goal`;
}
