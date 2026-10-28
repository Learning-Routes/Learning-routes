// How v1 read loose JSON (model output, client payloads), so the ports read it the
// same way. Untrusted input never throws here (lesson 18).

const FLOAT_MARK = /[.e]/;
const BLANK = /^\p{White_Space}*$/u;

export type Loose = Record<string, unknown>;

/** A JSON object, or {} for anything else (v1: `(x || {}).with_indifferent_access`). */
export function asObject(value: unknown): Loose {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Loose)
    : {};
}

/** v1 `Array(x)`: nil is [], an array is itself, an object is its entries, anything else is [x]. */
export function asArray(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.entries(value);
  return [value];
}

/** v1 truthiness: everything but nil and false. */
export function truthy(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

/** v1 `to_s` for JSON values. */
export function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isInteger(value) && !Object.is(value, -0))
    return String(value);
  if (typeof value === "number")
    return Number.isFinite(value) ? rubyFloatText(value) : String(value);
  return JSON.stringify(value);
}

function rubyFloatText(value: number): string {
  const text = String(value);
  return FLOAT_MARK.test(text) ? text : `${text}.0`;
}

/** v1 `String#strip` whitespace. */
const STRIP = /^[\0\t\n\v\f\r ]+|[\0\t\n\v\f\r ]+$/g;

/** Ruby `String#strip`, as v1 trimmed text. */
export function strip(text: string): string {
  return text.replace(STRIP, "");
}

/** v1 `blank?` on a string: empty or Unicode whitespace only. */
export function isBlank(text: string | null | undefined): boolean {
  return text === null || text === undefined || BLANK.test(text);
}

/** v1 `presence`: the text, or null when it is blank. */
export function presence(text: string | null | undefined): string | null {
  return isBlank(text) ? null : (text as string);
}

/** v1 `Float#round(2)`: half away from zero. */
export function round2(value: number): number {
  return (Math.sign(value) * Math.round(Math.abs(value) * 100)) / 100;
}
