import * as z from "zod";
import { BLOCK_TYPES } from "../blocks/types";
import { Route } from "../domain";
import { Locale, LocalizedText } from "../localized-text";
import { POSITION_KEY } from "./position";

// A published version's content (Platform STEP 2 §2.10): the route, its modules,
// lessons, prerequisites and blocks, frozen. Ids are the draft's, copied verbatim,
// so progress keyed by a lesson or block id survives a new version. A stored
// snapshot keeps the format it was written in; upcastSnapshot reads every format
// as today's.

export const SNAPSHOT_FORMAT = 1;

const Position = z.string().regex(POSITION_KEY);

const SnapshotV1 = z.strictObject({
  route: z.strictObject({
    id: z.uuid(),
    slug: z.string().min(1),
    title: LocalizedText,
    description: LocalizedText.nullable(),
    sourceLocale: Locale,
    access: Route.shape.access,
    pricing: Route.shape.pricing,
  }),
  modules: z.array(z.strictObject({ id: z.uuid(), position: Position, title: LocalizedText })),
  lessons: z.array(
    z.strictObject({ id: z.uuid(), moduleId: z.uuid(), position: Position, title: LocalizedText }),
  ),
  prerequisites: z.array(z.strictObject({ lessonId: z.uuid(), requiresLessonId: z.uuid() })),
  blocks: z.array(
    z.strictObject({
      id: z.uuid(),
      lessonId: z.uuid(),
      position: Position,
      kind: z.enum(BLOCK_TYPES),
      data: z.record(z.string(), z.unknown()),
    }),
  ),
});

export type Snapshot = z.infer<typeof SnapshotV1>;

/** Reads a stored snapshot of the given format as today's format. */
export function upcastSnapshot(format: number, json: unknown): Snapshot {
  switch (format) {
    case 1:
      return SnapshotV1.parse(json);
    default:
      throw new RangeError(`unknown snapshot format: ${format}`);
  }
}

/** A draft's content as a version stores it: the same ids, without the draft's own fields. */
export function snapshotOf(draft: Snapshot): Snapshot {
  const { route, modules, lessons, prerequisites, blocks } = draft;
  return { route, modules, lessons, prerequisites, blocks };
}

/** JSON with every object's keys in order, so equal content always reads the same. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    entries.sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** A version's content hash: SHA-256, hex, of its snapshot in canonical JSON. */
export async function contentHash(snapshot: Snapshot): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical(snapshot)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
