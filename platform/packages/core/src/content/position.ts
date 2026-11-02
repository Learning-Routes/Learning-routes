// Fractional positions (Platform STEP 2 §2.7): a module, lesson or block sorts by
// a text key, compared byte by byte (Postgres collate "C"). A key made between two
// neighbours sorts between them, so an insert never renumbers the others.
// The digits are ASCII-ordered; a key never ends in the zero digit, so there is
// always room before it.
const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ZERO = "0";
/** A key keyBetween makes and accepts: base-62 digits, never ending in zero. */
export const POSITION_KEY = /^[0-9A-Za-z]*[1-9A-Za-z]$/;

function digit(char: string | undefined): number {
  return DIGITS.indexOf(char as string);
}

/** A digit string strictly between a (or zero) and b (or one), with no trailing zero. */
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let common = 0;
    while ((a[common] ?? ZERO) === b[common]) {
      common++;
    }
    if (common > 0) {
      return b.slice(0, common) + midpoint(a.slice(common), b.slice(common));
    }
  }
  const low = a === "" ? 0 : digit(a[0]);
  const high = b === null ? DIGITS.length : digit(b[0]);
  if (high - low > 1) {
    return DIGITS[Math.round((low + high) / 2)] as string;
  }
  if (b !== null && b.length > 1) {
    return b.slice(0, 1);
  }
  return (DIGITS[low] as string) + midpoint(a.slice(1), null);
}

/** The position key between two neighbours; null means the start or the end. */
export function keyBetween(before: string | null, after: string | null): string {
  for (const key of [before, after]) {
    if (key !== null && !POSITION_KEY.test(key)) {
      throw new RangeError(`not a position key: ${JSON.stringify(key)}`);
    }
  }
  if (before !== null && after !== null && before >= after) {
    throw new RangeError("position keys out of order");
  }
  return midpoint(before ?? "", after);
}
