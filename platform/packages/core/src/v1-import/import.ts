import { z } from "zod";
import { Block, blockSchemas } from "../blocks/schema";
import { deterministicId } from "../ids";
import type { Locale } from "../localized-text";
import { fromV1Section } from "./vocabulary";

// The v1 import boundary: the only place a plain string becomes localized text,
// and a [term, definition] pair becomes an object (ADR 0003).

export interface V1Source {
  routeId: string;
  lessonId: string;
  position: number;
  locale: Locale;
}

function v1Text(locale: Locale) {
  return z.string().transform((text) => ({ [locale]: text }));
}

type V1Text = ReturnType<typeof v1Text>;

const v1Pair = (text: V1Text) =>
  z.union([
    z.strictObject({ term: text, definition: text }),
    z.tuple([text, text]).transform(([term, definition]) => ({ term, definition })),
  ]);

const v1Schemas = new Map<Locale, ReturnType<typeof v1BlockSchema>>();

function v1BlockSchema(locale: Locale) {
  return blockSchemas(v1Text(locale), v1Pair, {});
}

/** The id a v1 block gets on import, from its route, lesson and position. New: the v1 import boundary (ADR 0003). */
export function v1BlockId({ routeId, lessonId, position }: Omit<V1Source, "locale">) {
  return deterministicId(`learning-routes-v1:${routeId}:${lessonId}:${position}`);
}

/** One v1 section as a stored Block. New: the v1 import boundary (ADR 0003). */
export async function importV1Block(section: unknown, source: V1Source): Promise<Block> {
  let schema = v1Schemas.get(source.locale);
  if (!schema) {
    schema = v1BlockSchema(source.locale);
    v1Schemas.set(source.locale, schema);
  }
  const fields = schema.parse(fromV1Section(section));
  // v1 graded every blank as text (ADR 0003).
  const match = fields.type === "fill_blank" ? { match: "text" } : {};
  return Block.parse({ ...fields, ...match, id: await v1BlockId(source) });
}

/** A whole v1 lesson: each section becomes a stored Block, its id taken from its position. */
export function importV1Lesson(
  sections: readonly unknown[],
  source: Omit<V1Source, "position">,
): Promise<Block[]> {
  return Promise.all(
    sections.map((section, position) => importV1Block(section, { ...source, position })),
  );
}
