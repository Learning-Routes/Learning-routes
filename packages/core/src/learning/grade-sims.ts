import * as z from "zod";
import {
  ALIGN,
  APERTURES,
  balanceOf,
  EXPOSURE_TOLERANCE,
  exposureOf,
  futureValue,
  huesFor,
  ISOS,
  JUSTIFY,
  onSlider,
  reducible,
  SHUTTERS,
} from "../blocks/sim-math";
import { type SimKind, type SimParams, STRINGS, simKindOf, simParamsOf } from "../blocks/sims";
import { ENGAGEMENT_SIM_KINDS } from "../blocks/types";
import { round2 } from "../v1-import/loose-json";
import { byShare, type GradeResult, graded, MALFORMED, ungradable } from "./grade-result";

// The sim graders (Platform STEP 12). Each recomputes the goal from the submitted state and the
// block's own params; nothing the client says about the result is read.

const Fret = z.int().min(0).max(5);
const STATES = {
  piano_chord: z.strictObject({ notes: z.array(z.int()).min(1) }),
  guitar_chord: z.strictObject({ frets: z.partialRecord(z.enum(STRINGS), Fret) }),
  camera_exposure: z.strictObject({
    aperture: z.number().refine((n) => (APERTURES as readonly number[]).includes(n)),
    shutter: z.number().refine((n) => (SHUTTERS as readonly number[]).includes(n)),
    iso: z.number().refine((n) => (ISOS as readonly number[]).includes(n)),
  }),
  compound_interest: z.strictObject({ monthly: z.number() }),
  css_flex: z.strictObject({ justify: z.enum(JUSTIFY), align: z.enum(ALIGN) }),
  fraction_pie: z.strictObject({ selected: z.array(z.int()) }),
  ohm: z.strictObject({ v: z.number(), r: z.number() }),
  equation_balance: z.strictObject({ coefficients: z.array(z.int()) }),
  chess_mate_in_one: z.strictObject({ move: z.string().regex(/^[a-h][1-8][a-h][1-8]$/) }),
  color_wheel: z.strictObject({ pick: z.int().min(0).max(11) }),
  roleplay: z.strictObject({ choices: z.array(z.int()) }),
} as const;

type Graded = keyof typeof STATES;
type Grader<K extends Graded> = (
  p: SimParams[K],
  state: z.infer<(typeof STATES)[K]>,
) => GradeResult;

const same = (a: Set<number>, b: Set<number>) => a.size === b.size && [...a].every((x) => b.has(x));
const overlap = (a: Set<unknown>, b: Set<unknown>) => {
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 1 : [...a].filter((x) => b.has(x)).length / union.size;
};
const fretted = (frets: Partial<Record<string, number>>) =>
  new Set(Object.entries(frets).flatMap(([string, fret]) => (fret ? [`${string}:${fret}`] : [])));

const GRADERS: { [K in Graded]: Grader<K> } = {
  piano_chord: (p, { notes }) => {
    if (new Set(notes).size !== notes.length || notes.some((n) => n < p.low || n > p.high)) {
      return MALFORMED;
    }
    const played = new Set(notes.map((n) => n % 12));
    return same(played, new Set(p.target))
      ? graded(true, 100)
      : byShare(overlap(played, new Set(p.target)));
  },
  guitar_chord: (p, { frets }) => byShare(overlap(fretted(frets), fretted(p.target))),
  camera_exposure: (p, { aperture, shutter, iso }) => {
    const exposed = Math.abs(p.scene_ev - exposureOf(aperture, shutter, iso)) <= EXPOSURE_TOLERANCE;
    const sharp = shutter >= (p.min_shutter_denominator ?? 1);
    return byShare((Number(exposed) + Number(sharp)) / 2);
  },
  compound_interest: (p, { monthly }) => {
    if (!onSlider(monthly, p.min, p.max, p.step)) {
      return MALFORMED;
    }
    return byShare(Math.min(1, futureValue(monthly, p.rate, p.years) / p.goal));
  },
  css_flex: (p, state) => {
    const hits = [state.justify === p.target.justify, state.align === p.target.align];
    return byShare(hits.filter(Boolean).length / 2);
  },
  fraction_pie: (p, { selected }) => {
    if (new Set(selected).size !== selected.length || selected.some((i) => i < 0 || i >= p.parts)) {
      return MALFORMED;
    }
    const count = selected.length;
    return byShare(Math.min(count, p.target) / Math.max(count, p.target));
  },
  ohm: (p, { v, r }) => {
    if (v < p.v[0] || v > p.v[1] || r < p.r[0] || r > p.r[1] || r <= 0) {
      return MALFORMED;
    }
    const error = Math.abs(v / r - p.target_amps);
    return error <= p.tolerance
      ? graded(true, 100)
      : graded(false, round2(Math.max(0, 100 - (error / p.target_amps) * 100)));
  },
  equation_balance: (p, { coefficients }) => {
    if (coefficients.length !== p.terms.length || coefficients.some((c) => c < 1 || c > p.max)) {
      return MALFORMED;
    }
    const { balanced, elements } = balanceOf(p.terms, coefficients);
    const result = byShare(balanced / elements);
    return result.correct && reducible(coefficients) ? { ...result, note: "not_smallest" } : result;
  },
  chess_mate_in_one: (p, { move }) => graded(move === p.solution, move === p.solution ? 100 : 0),
  color_wheel: (p, { pick }) => {
    if (pick === p.base) {
      return MALFORMED;
    }
    const hit = huesFor(p.base, p.relation).includes(pick);
    return graded(hit, hit ? 100 : 0);
  },
  roleplay: (p, { choices }) => {
    const picked = p.turns.map((turn, i) => turn.choices[choices[i] ?? -1]);
    if (choices.length !== p.turns.length || picked.some((choice) => choice === undefined)) {
      return MALFORMED;
    }
    const share =
      picked.reduce((sum, choice) => sum + (choice?.score ?? 0), 0) / (2 * p.turns.length);
    return graded(share >= 0.8, round2(share * 100));
  },
};

const isGraded = (kind: SimKind): kind is Graded => Object.hasOwn(GRADERS, kind);

/** Grades a sim's `{ state }` by its kind. */
export function gradeSim(block: Record<string, unknown>, submission: unknown): GradeResult {
  const kind = simKindOf(block);
  if (kind === null) {
    return ungradable("unknown sim kind");
  }
  if (ENGAGEMENT_SIM_KINDS.includes(kind) || !isGraded(kind)) {
    return ungradable(`sim ${kind} is engagement-only`);
  }
  return gradeKind(kind, block.setup, submission);
}

function gradeKind<K extends Graded>(kind: K, setup: unknown, submission: unknown): GradeResult {
  const params = simParamsOf(kind, setup);
  if (!params) {
    return ungradable(`sim ${kind} is malformed`);
  }
  const state = z.strictObject({ state: STATES[kind] }).safeParse(submission);
  if (!state.success) {
    return MALFORMED;
  }
  // Safe: parsed by this kind's own state schema.
  return GRADERS[kind](params, (state.data as { state: z.infer<(typeof STATES)[K]> }).state);
}
