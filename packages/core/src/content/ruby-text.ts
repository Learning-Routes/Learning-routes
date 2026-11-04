// Ruby's text semantics, which the v1 parser's output depends on. Ruby's `\s` is
// ASCII whitespace, and its `^` matches only at the start or after "\n", so the
// patterns here spell those out instead of using JavaScript's broader versions.

/** Ruby `\s`. */
export const WS = "[ \\t\\r\\n\\f\\v]";
/** Ruby `^` in a multi-line string: the start, or just after "\n". */
export const LINE_START = "(?<![^\\n])";

/** Ruby `String#lines`, as the v1 parser split text: each line keeps its "\n". */
export function lines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/** Ruby `split(separator, 2)` on a plain string, as the v1 parser split pairs. */
export function splitOnce(text: string, separator: string): [string, string | undefined] {
  const at = text.indexOf(separator);
  return at === -1 ? [text, undefined] : [text.slice(0, at), text.slice(at + separator.length)];
}

/** Ruby `Float#round(1)`, as v1 rounded simulation defaults: half away from zero. */
export function round1(value: number): number {
  return (Math.sign(value) * Math.round(Math.abs(value) * 10)) / 10;
}
