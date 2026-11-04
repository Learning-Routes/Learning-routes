/**
 * Whether the runtime knows this IANA time zone (or UTC). A learner's day is
 * counted in it, so an unknown one would break every date computed for them.
 */
export function isTimeZone(name: string): boolean {
  if (name === "") {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}
