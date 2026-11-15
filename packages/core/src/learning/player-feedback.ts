import { itemKey } from "../content/player-view";
import type { LocalizedText } from "../localized-text";
import { asArray, asObject } from "../v1-import/loose-json";

// What the player says back about an answer (Platform STEP 12): what to read, which parts were
// wrong, and the right answer once it may be shown.

/** The solution shows once passed, or after the second wrong try. */
export const revealsSolution = (correct: boolean | null, attempts: number) =>
  correct !== false || attempts >= 2;

export function explanationOf(
  kind: string,
  data: Record<string, unknown>,
  submission: unknown,
  correct: boolean | null,
) {
  if (kind === "check" && correct === false) {
    const chosen = asObject(submission).option_index;
    const why = typeof chosen === "number" ? asObject(asArray(data.options)[chosen]).why : null;
    if (why) {
      return why as LocalizedText;
    }
  }
  return (data.explanation as LocalizedText | undefined) ?? null;
}

export function detailOf(
  id: string,
  kind: string,
  data: Record<string, unknown>,
  submission: unknown,
  detail: unknown,
) {
  const payload = asObject(submission);
  switch (kind) {
    case "true_false": {
      const statements = asArray(data.statements).map(asObject);
      return statements.map((s, i) => ({
        right: asArray(payload.answers)[i] === (s.answer === true),
        answer: s.answer === true,
        why: s.why ?? null,
      }));
    }
    case "order":
      return { wrong: asArray(detail).map((place) => place) };
    case "drag_drop": {
      const matches = asObject(payload.matches);
      const count = asArray(data.pairs).length;
      return {
        wrong: Array.from({ length: count }, (_, i) => i)
          .filter((i) => matches[String(i)] !== String(i))
          .map((i) => itemKey(id, i)),
      };
    }
    case "sim": {
      const sim = asObject(data.sim);
      if (sim.kind === "roleplay") {
        const picks = asArray(asObject(payload.state).picks);
        return {
          ...asObject(detail),
          notes: asArray(sim.turns).map((turn, i) => {
            const choice = asObject(asArray(asObject(turn).choices)[picks[i] as number]);
            return { score: choice.score ?? 0, note: choice.note ?? null };
          }),
        };
      }
      return detail ?? null;
    }
    default:
      return detail ?? null;
  }
}

export function solutionOf(id: string, kind: string, data: Record<string, unknown>) {
  switch (kind) {
    case "check":
      return { option_index: asArray(data.options).findIndex((o) => asObject(o).correct === true) };
    case "order":
      return { order: asArray(data.items).map((_, i) => itemKey(id, i)) };
    case "drag_drop":
      return {
        matches: Object.fromEntries(
          asArray(data.pairs).map((_, i) => [itemKey(id, i), itemKey(id, i + 1000)]),
        ),
      };
    case "fill_blank":
      return { blanks: data.blanks };
    case "true_false":
      return { answers: asArray(data.statements).map((s) => asObject(s).answer === true) };
    case "estimate":
      return { min: data.answer_min, max: data.answer_max };
    case "hotspot":
      return { spot: asArray(data.spots).findIndex((s) => asObject(s).correct === true) };
    case "sim": {
      const sim = asObject(data.sim);
      if (sim.kind === "chess_mate_in_one") {
        return { move: sim.solution };
      }
      if (sim.kind === "piano_chord" || sim.kind === "guitar_chord" || sim.kind === "css_flex") {
        return { target: sim.target };
      }
      return null;
    }
    default:
      return null;
  }
}
