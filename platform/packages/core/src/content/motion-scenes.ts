// The Motion scene vocabulary and the part of JSON Schema its two schemas use.
// Copied from the v1 app's app/motion/src/scenes/*.schema.json; replaces v1
// `ContentEngine::MotionScenes`. The parser only asks whether data is valid.

type Schema = {
  type?: "object" | "array" | "string" | "integer";
  required?: string[];
  additionalProperties?: false;
  properties?: Record<string, Schema>;
  items?: Schema;
  minItems?: number;
  minLength?: number;
  minimum?: number;
  /** v1's vendor keyword: this integer indexes the named array of the containing object. */
  "x-index-into"?: string;
};

const SCENES: Record<string, Schema> = {
  agreement: {
    type: "object",
    additionalProperties: false,
    required: ["tokens", "subject", "verb", "wrong", "correct", "why", "labels"],
    properties: {
      tokens: { type: "array", minItems: 2, items: { type: "string", minLength: 1 } },
      subject: { type: "integer", minimum: 0, "x-index-into": "tokens" },
      verb: { type: "integer", minimum: 0, "x-index-into": "tokens" },
      wrong: { type: "string", minLength: 1 },
      correct: { type: "string", minLength: 1 },
      why: { type: "string", minLength: 1 },
      labels: {
        type: "object",
        additionalProperties: false,
        required: ["subject", "verb"],
        properties: {
          subject: { type: "string", minLength: 1 },
          verb: { type: "string", minLength: 1 },
        },
      },
    },
  },
  transform: {
    type: "object",
    additionalProperties: false,
    required: ["steps"],
    properties: {
      steps: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["tag", "tokens", "hi"],
          properties: {
            tag: { type: "string", minLength: 1 },
            tokens: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
            hi: { type: "array", items: { type: "integer", minimum: 0, "x-index-into": "tokens" } },
          },
        },
      },
    },
  },
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Whether a scene exists. Replaces v1 `MotionScenes.known?`. */
export function isKnownScene(name: string): boolean {
  return Object.hasOwn(SCENES, name);
}

/** Problems with a scene's data; [] when it is valid. Never throws on model output. Replaces v1 `MotionScenes.validate`. */
export function validateScene(name: string, data: unknown): string[] {
  const schema = SCENES[name];
  if (!schema || !Object.hasOwn(SCENES, name)) return [`unknown scene: ${name}`];
  if (!isObject(data)) return ["data is not an object"];
  return check(schema, data, "", null);
}

type Container = Record<string, unknown> | null;

function check(schema: Schema, value: unknown, path: string, container: Container): string[] {
  const at = path || "/";
  switch (schema.type) {
    case "object":
      return checkObject(schema, value, path, at);
    case "array":
      return checkArray(schema, value, path, at, container);
    case "string":
      return checkString(schema, value, at);
    case "integer":
      return checkInteger(schema, value, at, container);
    default:
      return [];
  }
}

function checkObject(schema: Schema, value: unknown, path: string, at: string): string[] {
  if (!isObject(value)) return [`${at}: not an object`];
  const errors: string[] = [];
  for (const key of schema.required ?? [])
    if (!(key in value)) errors.push(`${at}: missing ${key}`);
  for (const [key, child] of Object.entries(value)) {
    const childSchema = schema.properties?.[key];
    if (childSchema) errors.push(...check(childSchema, child, `${path}/${key}`, value));
    else if (schema.additionalProperties === false) errors.push(`${at}: unexpected ${key}`);
  }
  return errors;
}

function checkArray(
  schema: Schema,
  value: unknown,
  path: string,
  at: string,
  container: Container,
): string[] {
  if (!Array.isArray(value)) return [`${at}: not an array`];
  const errors: string[] = [];
  if (schema.minItems !== undefined && value.length < schema.minItems)
    errors.push(`${at}: too few items`);
  if (schema.items) {
    for (const [i, item] of value.entries())
      errors.push(...check(schema.items, item, `${path}/${i}`, container));
  }
  return errors;
}

function checkString(schema: Schema, value: unknown, at: string): string[] {
  if (typeof value !== "string") return [`${at}: not a string`];
  if (schema.minLength !== undefined && [...value].length < schema.minLength)
    return [`${at}: too short`];
  return [];
}

function checkInteger(schema: Schema, value: unknown, at: string, container: Container): string[] {
  if (typeof value !== "number" || !Number.isInteger(value)) return [`${at}: not an integer`];
  const errors: string[] = [];
  if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: below minimum`);
  const target = schema["x-index-into"];
  if (target !== undefined) {
    const array = container?.[target];
    if (!Array.isArray(array) || value >= array.length)
      errors.push(`${at}: out of range for ${target}`);
  }
  return errors;
}
