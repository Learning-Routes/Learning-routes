import { exposureOffset, futureValue } from "../blocks/sim-numbers";
import { APERTURES, FLEX_ALIGN, FLEX_JUSTIFY, GRADABLE_SIMS, ISOS, SHUTTERS } from "../blocks/sims";

export { futureValue } from "../blocks/sim-numbers";
import { asArray, asObject, asText, round2, truthy } from "../v1-import/loose-json";

// Grades the player's question types (Platform STEP 12). Every grader reads the block the
// server holds and the learner's submission as loose JSON: a malformed submission is a wrong
// answer, a malformed block is ungradable, and nothing here throws.

export interface PlayerGrade {
  correct: boolean | null;
  score: number | null;
  gradable: boolean;
  reason: string | null;
  /** Which part was wrong, for the feedback: indices or a short code. */
  detail?: unknown;
}

const ungradable = (reason: string): PlayerGrade => ({
  correct: null,
  score: null,
  gradable: false,
  reason,
});
const graded = (correct: boolean, score: number, detail?: unknown): PlayerGrade => ({
  correct,
  score: round2(score),
  gradable: true,
  reason: null,
  ...(detail === undefined ? {} : { detail }),
});

const isInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);
const isNum = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** order: the submission is a permutation of the item indices; correct when it is the identity. */
export function gradeOrder(
  block: Record<string, unknown>,
  payload: Record<string, unknown>,
): PlayerGrade {
  const n = asArray(block.items).length;
  if (n < 2) {
    return ungradable("order has fewer than two items");
  }
  const order = asArray(payload.order);
  const valid =
    order.length === n &&
    order.every(isInt) &&
    new Set(order).size === n &&
    order.every((i) => (i as number) >= 0 && (i as number) < n);
  if (!valid) {
    return graded(false, 0);
  }
  const wrong = order.flatMap((item, place) => (item === place ? [] : [place]));
  return graded(wrong.length === 0, ((n - wrong.length) / n) * 100, wrong);
}

/** true_false: one boolean per statement. */
export function gradeTrueFalse(
  block: Record<string, unknown>,
  payload: Record<string, unknown>,
): PlayerGrade {
  const statements = asArray(block.statements).map(asObject);
  if (statements.length === 0) {
    return ungradable("true_false has no statements");
  }
  const answers = asArray(payload.answers);
  const wrong = statements.flatMap((s, i) =>
    answers[i] === (s.answer === true) && typeof answers[i] === "boolean" ? [] : [i],
  );
  return graded(
    wrong.length === 0,
    ((statements.length - wrong.length) / statements.length) * 100,
    wrong,
  );
}

/** estimate: a number inside [answer_min, answer_max]. */
export function gradeEstimate(
  block: Record<string, unknown>,
  payload: Record<string, unknown>,
): PlayerGrade {
  const lo = block.answer_min;
  const hi = block.answer_max;
  if (!(isNum(lo) && isNum(hi)) || lo > hi) {
    return ungradable("estimate has no answer range");
  }
  const value = payload.value;
  if (!isNum(value)) {
    return graded(false, 0);
  }
  const hit = value >= lo && value <= hi;
  return graded(hit, hit ? 100 : 0, hit ? undefined : value < lo ? "low" : "high");
}

/** hotspot: the index of a spot marked correct. */
export function gradeHotspot(
  block: Record<string, unknown>,
  payload: Record<string, unknown>,
): PlayerGrade {
  const spots = asArray(block.spots).map(asObject);
  if (!spots.some((spot) => truthy(spot.correct) && spot.correct === true)) {
    return ungradable("hotspot has no correct spot");
  }
  const spot = payload.spot;
  if (!isInt(spot) || spot < 0 || spot >= spots.length) {
    return graded(false, 0);
  }
  const hit = spots[spot]?.correct === true;
  return graded(hit, hit ? 100 : 0);
}

/** sim: each kind recomputes its goal from the state the learner set. */
export function gradeSim(
  block: Record<string, unknown>,
  payload: Record<string, unknown>,
): PlayerGrade {
  const sim = asObject(block.sim);
  const kind = asText(sim.kind);
  if (!(GRADABLE_SIMS as readonly string[]).includes(kind)) {
    return ungradable(`${kind || "this simulator"} is practice`);
  }
  const state = asObject(payload.state);
  const grader = SIM_GRADERS[kind];
  return grader ? grader(sim, state) : ungradable(`no grader for ${kind}`);
}

const pitchClass = (midi: number) => ((midi % 12) + 12) % 12;

const SIM_GRADERS: Record<
  string,
  (sim: Record<string, unknown>, state: Record<string, unknown>) => PlayerGrade
> = {
  piano_chord(sim, state) {
    const target = new Set(asArray(sim.target).filter(isInt));
    if (target.size === 0) {
      return ungradable("piano_chord has no target");
    }
    const notes = asArray(state.notes).filter(isInt);
    if (notes.length === 0) {
      return graded(false, 0);
    }
    const played = new Set(notes.map(pitchClass));
    const extra = [...played].filter((pc) => !target.has(pc));
    const missing = [...target].filter((pc) => !played.has(pc));
    const right = extra.length === 0 && missing.length === 0 && notes.length === target.size;
    const score = ((target.size - missing.length) / target.size) * 100;
    return graded(right, right ? 100 : Math.max(0, score - extra.length * 25), { extra, missing });
  },

  guitar_chord(sim, state) {
    const target = asObject(sim.target);
    const frets = asObject(state.frets);
    const strings = ["1", "2", "3", "4", "5", "6"];
    const wrong = strings.filter(
      (s) => (isInt(target[s]) ? target[s] : 0) !== (isInt(frets[s]) ? frets[s] : 0),
    );
    return graded(wrong.length === 0, ((6 - wrong.length) / 6) * 100, wrong.map(Number));
  },

  camera_exposure(sim, state) {
    const ev = sim.scene_ev;
    if (!isNum(ev)) {
      return ungradable("camera_exposure has no scene");
    }
    const n = APERTURES[state.aperture as number];
    const t = SHUTTERS[state.shutter as number];
    const iso = ISOS[state.iso as number];
    if (n === undefined || t === undefined || iso === undefined) {
      return graded(false, 0);
    }
    const offset = exposureOffset(ev, n, t, iso);
    const exposed = Math.abs(offset) <= 0.5;
    const frozen = !isInt(sim.min_shutter) || t >= sim.min_shutter;
    const detail = !exposed ? (offset > 0 ? "bright" : "dark") : frozen ? undefined : "blur";
    return graded(exposed && frozen, exposed ? (frozen ? 100 : 60) : 0, detail);
  },

  compound_interest(sim, state) {
    const { rate, years, goal } = sim;
    if (!(isNum(rate) && isInt(years) && isNum(goal))) {
      return ungradable("compound_interest is missing a number");
    }
    const monthly = state.monthly;
    if (!isNum(monthly) || monthly < 0) {
      return graded(false, 0);
    }
    const value = futureValue(monthly, rate, years);
    return graded(value >= goal, Math.min(100, (value / goal) * 100), { value: Math.round(value) });
  },

  css_flex(sim, state) {
    const target = asObject(sim.target);
    const justify = asText(state.justify);
    const align = asText(state.align);
    if (
      !(FLEX_JUSTIFY as readonly string[]).includes(justify) ||
      !(FLEX_ALIGN as readonly string[]).includes(align)
    ) {
      return graded(false, 0);
    }
    const hits = Number(justify === target.justify) + Number(align === target.align);
    return graded(hits === 2, hits * 50);
  },

  fraction_pie(sim, state) {
    const parts = sim.parts;
    const target = sim.target;
    if (!(isInt(parts) && isInt(target))) {
      return ungradable("fraction_pie is missing a number");
    }
    const chosen = asArray(state.parts).filter((p) => isInt(p) && p >= 0 && p < parts);
    const count = new Set(chosen).size;
    return graded(count === target, count === target ? 100 : 0, { count });
  },

  ohm(sim, state) {
    const target = sim.target_amps;
    const tolerance = isNum(sim.tolerance) ? sim.tolerance : 0.05;
    const [vlo, vhi] = asArray(sim.v) as number[];
    const [rlo, rhi] = asArray(sim.r) as number[];
    const { v, r } = state;
    if (!isNum(target)) {
      return ungradable("ohm has no target");
    }
    if (
      !(isNum(v) && isNum(r)) ||
      r <= 0 ||
      (isNum(vlo) && v < vlo) ||
      (isNum(vhi) && v > vhi) ||
      (isNum(rlo) && r < rlo) ||
      (isNum(rhi) && r > rhi)
    ) {
      return graded(false, 0);
    }
    const amps = v / r;
    const hit = Math.abs(amps - target) <= tolerance;
    return graded(hit, hit ? 100 : 0, { amps: round2(amps) });
  },

  equation_balance(sim, state) {
    const terms = asArray(sim.terms).map(asObject);
    const max = isInt(sim.max) ? sim.max : 6;
    const coefficients = asArray(state.coefficients);
    if (terms.length < 2) {
      return ungradable("equation_balance needs two terms");
    }
    if (
      coefficients.length !== terms.length ||
      !coefficients.every((c) => isInt(c) && c >= 1 && c <= max)
    ) {
      return graded(false, 0);
    }
    const totals = new Map<string, number>();
    terms.forEach((term, i) => {
      const sign = term.side === "right" ? -1 : 1;
      for (const [element, count] of Object.entries(asObject(term.atoms))) {
        if (isInt(count)) {
          totals.set(
            element,
            (totals.get(element) ?? 0) + sign * count * (coefficients[i] as number),
          );
        }
      }
    });
    const off = [...totals].filter(([, total]) => total !== 0).map(([element]) => element);
    const smallest = gcdAll(coefficients as number[]) === 1;
    return graded(
      off.length === 0,
      off.length === 0 ? 100 : 0,
      off.length === 0 ? { smallest } : { off },
    );
  },

  chess_mate_in_one(sim, state) {
    const solution = asText(sim.solution);
    if (solution.length !== 4) {
      return ungradable("chess_mate_in_one has no solution");
    }
    const move = asText(state.move).toLowerCase();
    return graded(move === solution, move === solution ? 100 : 0);
  },

  color_wheel(sim, state) {
    const base = sim.base;
    const pick = state.pick;
    if (!isInt(base)) {
      return ungradable("color_wheel has no base");
    }
    if (!isInt(pick) || pick < 0 || pick > 11) {
      return graded(false, 0);
    }
    const distance = Math.min(Math.abs(pick - base), 12 - Math.abs(pick - base));
    const want = { complement: [6], analogous: [1], triad: [4] }[asText(sim.relation)] ?? [];
    const hit = want.includes(distance);
    return graded(hit, hit ? 100 : 0, { distance });
  },

  roleplay(sim, state) {
    const turns = asArray(sim.turns).map(asObject);
    const picks = asArray(state.picks);
    if (turns.length === 0) {
      return ungradable("roleplay has no turns");
    }
    if (picks.length !== turns.length) {
      return graded(false, 0);
    }
    let points = 0;
    for (const [i, turn] of turns.entries()) {
      const pick = picks[i];
      const choice = isInt(pick) ? asObject(asArray(turn.choices)[pick]) : {};
      if (!isInt(choice.score)) {
        return graded(false, 0);
      }
      points += choice.score;
    }
    const score = (points / (turns.length * 2)) * 100;
    return graded(score >= 80, score, { points, of: turns.length * 2 });
  },
};


function gcdAll(values: number[]): number {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  return values.reduce((acc, v) => gcd(acc, v), 0);
}
