import * as z from "zod";
import { blockSchemas } from "../blocks/schema";
import { ROUTE_LEVELS, ROUTE_TOPICS } from "../copy/route-facts";
import { Locale, LocalizedText } from "../localized-text";

// A whole route in one document (Platform STEP 5 §4), for import_route. It comes from a
// stranger's model, so it is read as data: unknown fields go, every string is bounded, links
// are https only, and media is an address nothing here fetches. Script tags stay as the words
// they are: every page renders this as text, never as HTML.

export const MOST = {
  modules: 30,
  lessons: 300,
  blocks: 5000,
  problems: 50,
  titleLength: 200,
  textLength: 20_000,
} as const;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const URL_FIELD = /_url$/;
const HTTPS_ADDRESS = /^https:\/\/[^\s/]+/;
// A link's target in Markdown or HTML, unless it is https.
const BAD_LINK =
  /\]\(\s*(?!https:\/\/)[a-z][a-z0-9+.-]*:|href\s*=\s*["']?\s*(?!https:\/\/)[a-z][a-z0-9+.-]*:/i;
// What a block runs or draws, which is not text a person reads as links.
const NOT_PROSE = new Set(["code", "formula", "expected_output", "scene", "language", "data"]);

const DocBlock = blockSchemas(
  LocalizedText,
  (text) => z.strictObject({ term: text, definition: text }),
  {},
);

// An interactive block points at a stored file, so only upload_creation makes one.
const DocLesson = z.strictObject({
  title: LocalizedText,
  blocks: z.array(
    DocBlock.refine(
      (block) => block.type !== "interactive",
      "an interactive block comes only from upload_creation",
    ),
  ),
});
const DocModule = z.strictObject({ title: LocalizedText, lessons: z.array(DocLesson) });

const RouteDocumentSchema = z
  .strictObject({
    slug: z.string().max(80).regex(SLUG, "lower-case words joined by hyphens"),
    title: LocalizedText,
    description: LocalizedText.nullish(),
    source_locale: Locale,
    topic: z.enum(ROUTE_TOPICS).optional(),
    level: z.enum(ROUTE_LEVELS).optional(),
    modules: z.array(DocModule),
  })
  .refine((route) => route.title[route.source_locale] !== undefined, {
    message: "the title needs the source locale",
    path: ["title"],
  });

export type RouteDocument = z.infer<typeof RouteDocumentSchema>;

/** The document's JSON Schema, generated from the rules above, so the two cannot differ. */
export function routeDocumentJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(RouteDocumentSchema, { io: "input" }) as Record<string, unknown>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The block's variant, by its type, or null for a type there is not. */
function variantOf(union: typeof DocBlock, value: Record<string, unknown>): z.ZodType | null {
  return (union.options.find((option) => option.shape.type.value === value.type) ??
    null) as z.ZodType | null;
}

/** A copy with only the fields the schema knows, at every level. The schema then judges it. */
function stripUnknown(schema: z.ZodType, value: unknown): unknown {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return value === undefined || value === null
      ? value
      : stripUnknown(schema.unwrap() as z.ZodType, value);
  }
  if (schema instanceof z.ZodDiscriminatedUnion && isObject(value)) {
    const variant = variantOf(schema as unknown as typeof DocBlock, value);
    return variant ? stripUnknown(variant, value) : value;
  }
  if (schema instanceof z.ZodArray && Array.isArray(value)) {
    return value.map((item) => stripUnknown(schema.element as z.ZodType, item));
  }
  if (schema instanceof z.ZodObject && isObject(value)) {
    const shape = schema.shape as Record<string, z.ZodType>;
    return Object.fromEntries(
      Object.entries(shape).flatMap(([key, field]) =>
        Object.hasOwn(value, key) ? [[key, stripUnknown(field, value[key])]] : [],
      ),
    );
  }
  return value;
}

const pathText = (path: readonly PropertyKey[]) =>
  path.reduce<string>(
    (text, part) =>
      typeof part === "number"
        ? `${text}[${part}]`
        : text
          ? `${text}.${String(part)}`
          : String(part),
    "",
  );

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Counted before anything else is read, so too large a document costs little. */
function sizeProblem(document: Record<string, unknown>): string | null {
  const modules = list(document.modules);
  const lessons = modules.flatMap((module) => list((module as { lessons?: unknown })?.lessons));
  const blocks = lessons.flatMap((lesson) => list((lesson as { blocks?: unknown })?.blocks));
  if (modules.length > MOST.modules) {
    return `modules: at most ${MOST.modules} modules`;
  }
  if (lessons.length > MOST.lessons) {
    return `modules: at most ${MOST.lessons} lessons in a route`;
  }
  return blocks.length > MOST.blocks ? `modules: at most ${MOST.blocks} blocks in a route` : null;
}

/** What is wrong with one string, or null. */
function stringProblem(value: string, key: PropertyKey | undefined, isTitle: boolean) {
  const most = isTitle ? MOST.titleLength : MOST.textLength;
  if (value.length > most) {
    return `at most ${most} characters`;
  }
  if (typeof key === "string" && URL_FIELD.test(key) && !HTTPS_ADDRESS.test(value)) {
    return "media comes from an https address";
  }
  return BAD_LINK.test(value) ? "links go to https addresses only" : null;
}

/** Every string under value: bounded, with links only to https, and media only from there. */
function stringProblems(
  value: unknown,
  path: readonly PropertyKey[],
  isTitle: boolean,
  found: string[],
): void {
  if (found.length >= MOST.problems) {
    return;
  }
  if (typeof value === "string") {
    const problem = stringProblem(value, path.at(-1), isTitle);
    if (problem !== null) {
      found.push(`${pathText(path)}: ${problem}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      stringProblems(item, [...path, index], isTitle, found);
    });
  } else if (isObject(value)) {
    for (const [name, item] of Object.entries(value)) {
      if (!NOT_PROSE.has(name)) {
        stringProblems(item, [...path, name], isTitle || name === "title", found);
      }
    }
  }
}

export type DocumentCheck =
  | { ok: true; document: RouteDocument }
  | { ok: false; problems: string[] };

/** The document fit to import, or every problem in it, up to 50: nothing partial. */
export function problemsIn(raw: unknown): DocumentCheck {
  if (!isObject(raw)) {
    return { ok: false, problems: ["document: it must be an object"] };
  }
  const tooBig = sizeProblem(raw);
  if (tooBig !== null) {
    return { ok: false, problems: [tooBig] };
  }
  const stripped = stripUnknown(RouteDocumentSchema, raw);
  const problems: string[] = [];
  stringProblems(stripped, [], false, problems);
  const parsed = RouteDocumentSchema.safeParse(stripped);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const last = issue.path.at(-1);
      // A union's refusal of a type there is not names the field that decides it.
      const path =
        issue.code === "invalid_union" && last !== "type" ? [...issue.path, "type"] : issue.path;
      problems.push(`${pathText(path)}: ${issue.message}`);
    }
  }
  return problems.length > 0 || !parsed.success
    ? { ok: false, problems: problems.slice(0, MOST.problems) }
    : { ok: true, document: parsed.data };
}
