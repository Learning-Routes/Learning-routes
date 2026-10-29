// What the action log keeps of an input (Platform STEP 2 §2.15): ids, numbers,
// flags and short codes such as slugs, locales and positions. Free text (titles,
// bodies, anything with a space) and any value under a secret-looking key become
// "[redacted]", so the log holds no secret and no one's words.

const REDACTED = "[redacted]";
const SECRET_KEY = /secret|token|password|credential|apikey|api_key/i;
const CODE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

/** A copy of an action's input that is safe to keep in the action log. */
export function redact(value: unknown, key = ""): unknown {
  if (SECRET_KEY.test(key)) {
    return REDACTED;
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return CODE.test(value) ? value : REDACTED;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, redact(item, name)]),
    );
  }
  return REDACTED;
}
