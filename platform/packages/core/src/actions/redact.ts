// What the action log keeps of an input (Platform STEP 2 §2.15): ids (uuids),
// numbers, flags, and the codes under a short list of keys: slugs, locales,
// prices, roles, kinds and positions. Every other string, one word or many, and
// anything under a secret-looking key, becomes "[redacted]": the log is
// append-only, so it holds no secret and no one's words.

const REDACTED = "[redacted]";
const SECRET_KEY = /secret|token|password|credential|apikey|api_key/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const CODE_KEYS = new Set([
  "slug",
  "locale",
  "sourceLocale",
  "defaultLocale",
  "access",
  "pricing",
  "role",
  "type",
  "kind",
  "position",
]);

/** A copy of an action's input that is safe to keep in the action log. */
export function redact(value: unknown, key = ""): unknown {
  if (SECRET_KEY.test(key)) {
    return REDACTED;
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return UUID.test(value) || (CODE_KEYS.has(key) && CODE.test(value)) ? value : REDACTED;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, key));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, redact(item, name)]),
    );
  }
  return REDACTED;
}
