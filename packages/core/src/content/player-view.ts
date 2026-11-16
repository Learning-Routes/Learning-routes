import { blockRole } from "../blocks/types";
import { asArray, asObject } from "../v1-import/loose-json";

// What the player sends a learner (Platform STEP 12): each block without its answer. The server
// grades; the page only draws. Items that would give the answer away by their order (an order
// question, the definitions of a match) go shuffled and carry opaque keys that only the server
// can turn back into positions.

/** A short key for item `index` of a block, the same every time and meaningless to a reader. */
export function itemKey(blockId: string, index: number): string {
  let hash = 0x811c9dc5;
  for (const char of `${blockId}:${index}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `k${hash.toString(36)}`;
}

/** The index whose key this is, or -1. */
export function indexOfKey(blockId: string, count: number, key: unknown): number {
  for (let index = 0; index < count; index++) {
    if (itemKey(blockId, index) === key) {
      return index;
    }
  }
  return -1;
}

/** A fixed shuffle of 0..n-1 for this block, never the identity when n > 1. */
export function shuffled(blockId: string, n: number): number[] {
  let seed = Number.parseInt(itemKey(blockId, -1).slice(1), 36) || 1;
  const next = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j] as number, order[i] as number];
  }
  if (n > 1 && order.every((value, i) => value === i)) {
    order.push(order.shift() as number);
  }
  return order;
}

const ANSWER_FIELDS = ["explanation", "model_answer"];

/** A block as a learner may see it before answering. */
export function forLearner(
  id: string,
  kind: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const field of ANSWER_FIELDS) {
    out[field] = undefined;
  }
  switch (kind) {
    case "check":
      out.options = asArray(data.options).map((option) => ({ label: asObject(option).label }));
      break;
    case "order": {
      const items = asArray(data.items);
      out.items = shuffled(id, items.length).map((i) => ({ key: itemKey(id, i), text: items[i] }));
      break;
    }
    case "drag_drop": {
      const pairs = asArray(data.pairs).map(asObject);
      out.pairs = undefined;
      out.terms = pairs.map((pair, i) => ({ key: itemKey(id, i), text: pair.term }));
      out.definitions = shuffled(id, pairs.length).map((i) => ({
        key: itemKey(id, i + 1000),
        text: pairs[i]?.definition,
      }));
      break;
    }
    case "fill_blank":
      out.blankCount = asArray(data.blanks).length;
      out.blanks = undefined;
      break;
    case "true_false":
      out.statements = asArray(data.statements).map((s) => ({ text: asObject(s).text }));
      break;
    case "estimate":
      out.answer_min = undefined;
      out.answer_max = undefined;
      break;
    case "hotspot":
      out.spots = asArray(data.spots).map((spot) => {
        const { x, y, label } = asObject(spot);
        return { x, y, label };
      });
      break;
    case "cards":
    case "scenario":
      break;
    case "sim":
      out.sim = simForLearner(asObject(data.sim));
      break;
    default:
      break;
  }
  return withoutUndefined(out);
}

function simForLearner(sim: Record<string, unknown>): Record<string, unknown> {
  const out = { ...sim };
  switch (sim.kind) {
    case "piano_chord":
    case "guitar_chord":
    case "css_flex":
      out.target = undefined;
      break;
    case "chess_mate_in_one":
      out.solution = undefined;
      break;
    case "roleplay":
      out.turns = asArray(sim.turns).map((turn) => {
        const { line, choices } = asObject(turn);
        return {
          line,
          choices: asArray(choices).map((c) => ({
            text: asObject(c).text,
            reply: asObject(c).reply,
          })),
        };
      });
      break;
    default:
      break;
  }
  return withoutUndefined(out);
}

function withoutUndefined(object: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

/** Turns a learner's keyed submission back into the positions the grader reads. */
export function fromLearner(
  id: string,
  kind: string,
  data: Record<string, unknown>,
  submission: unknown,
): unknown {
  const payload = asObject(submission);
  if (kind === "order") {
    const count = asArray(data.items).length;
    return { order: asArray(payload.order).map((key) => indexOfKey(id, count, key)) };
  }
  if (kind === "drag_drop") {
    const count = asArray(data.pairs).length;
    const matches: Record<string, string> = {};
    for (const [termKey, definitionKey] of Object.entries(asObject(payload.matches))) {
      const term = indexOfKey(id, count, termKey);
      const keys = Array.from({ length: count }, (_, i) => itemKey(id, i + 1000));
      const definition = keys.indexOf(definitionKey as string);
      if (term >= 0 && definition >= 0) {
        matches[String(term)] = String(definition);
      }
    }
    return { matches };
  }
  return payload;
}

/** Whether a block must be passed before its topic counts as done. */
export function gates(kind: string): boolean {
  return blockRole(kind).gating;
}
