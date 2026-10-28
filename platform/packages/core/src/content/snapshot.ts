import { z } from "zod";
import { BLOCK_TYPES } from "../blocks/types";
import { Route } from "../domain";
import { Locale, LocalizedText } from "../localized-text";

// A published version's content (Platform STEP 2 §2.10): the route, its modules,
// lessons, prerequisites and blocks, frozen. Ids are the draft's, copied verbatim,
// so progress keyed by a lesson or block id survives a new version. A stored
// snapshot keeps the format it was written in; upcastSnapshot reads every format
// as today's.

export const SNAPSHOT_FORMAT = 1;

const Position = z.string().min(1);

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
