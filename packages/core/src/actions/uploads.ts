import * as z from "zod";
import {
  ASSET_MOST_BYTES,
  assetKey,
  CREATION_MOST_BYTES,
  creationKey,
  limitsOf,
  SPACE_QUOTA_BYTES,
  sha256Hex,
  sniffAsset,
} from "../content/creations";
import { positionAfter } from "../content/position";
import { LocalizedText } from "../localized-text";
import type { Repos, RouteDraft, StoredFile } from "../repos/ports";
import type { Ctx } from "./define";
import { ActionError, defineAction, inSpace } from "./define";
import { unwrap } from "./results";

// What a creator made, brought as files (Platform STEP 9 §2). Each action decides and writes
// its rows; the file itself goes to R2 after the commit, never inside it. A file already kept
// is not counted twice, and the same creation in the same lesson is one block.

const MB = 1024 * 1024;
const megabytes = (bytes: number) => `${Math.ceil(bytes / MB)} MB`;

async function keep(repos: Repos, spaceId: string, file: StoredFile) {
  if (await repos.storedFiles.has(spaceId, file.key)) {
    return;
  }
  const used = await repos.storedFiles.usage(spaceId);
  if (used + file.bytes > SPACE_QUOTA_BYTES) {
    throw new ActionError(
      "invalid",
      `Nothing was stored: this space has ${megabytes(SPACE_QUOTA_BYTES - used)} left of ${megabytes(SPACE_QUOTA_BYTES)}`,
    );
  }
  unwrap(await repos.storedFiles.record(spaceId, file));
}

export const creationUpload = defineAction({
  name: "creation.upload",
  kind: "mutation",
  description:
    "Bring an interactive creation, one HTML file kept exactly as given, as a block of a lesson.",
  input: z
    .strictObject({
      routeId: z.uuid(),
      expectedRevision: z.int().nonnegative(),
      lessonId: z.uuid().optional(),
      moduleId: z.uuid().optional(),
      lessonTitle: LocalizedText.optional(),
      title: LocalizedText,
      description: LocalizedText.nullish(),
      altText: LocalizedText.nullish(),
      source: z.string().min(1).max(CREATION_MOST_BYTES),
    })
    .refine(
      (input) =>
        input.lessonId ? input.moduleId === undefined : input.moduleId && input.lessonTitle,
      "a lesson_id, or a module_id with the new lesson's title",
    ),
  target: (input) => ({ kind: "route", id: input.routeId }),
  async run(ctx, input, given) {
    const { spaceId } = inSpace(given);
    const bytes = new TextEncoder().encode(input.source);
    if (bytes.length > CREATION_MOST_BYTES) {
      throw new ActionError(
        "invalid",
        `Nothing was stored: a creation is at most ${megabytes(CREATION_MOST_BYTES)}`,
      );
    }
    const hash = await sha256Hex(bytes);
    const key = creationKey("draft", spaceId, input.routeId, hash);
    const answer = { spaceId, routeId: input.routeId, key, limits: limitsOf(input.source) };
    return ctx.repos.transaction(async (repos) => {
      const draft = unwrap(await repos.routeDrafts.get(spaceId, input.routeId));
      const place = await placeOf(ctx, repos, draft, input, hash);
      if (place.blockId) {
        return { ...answer, ...place, blockId: place.blockId, repeated: true };
      }
      const { lessonId } = place;
      await keep(repos, spaceId, {
        key,
        kind: "creation",
        contentType: "text/html",
        bytes: bytes.length,
      });
      const blockId = ctx.ids.newId();
      const siblings = draft.blocks.filter((block) => block.lessonId === lessonId);
      const { revision } = unwrap(
        await repos.routeDrafts.addBlock(spaceId, input.routeId, place.revision, {
          id: blockId,
          lessonId,
          position: String(positionAfter(siblings, undefined)),
          kind: "interactive",
          data: {
            title: input.title,
            creation: hash,
            description: input.description ?? null,
            alt_text: input.altText ?? null,
          },
        }),
      );
      return { ...answer, lessonId, blockId, revision, repeated: false };
    });
  },
});

type CreationInput = z.infer<typeof creationUpload.input>;

/**
 * The lesson a creation goes in: the one named, or a new one at the end of the module. The
 * same creation already there is its block, so sending it again changes nothing.
 */
async function placeOf(
  ctx: Ctx,
  repos: Repos,
  draft: RouteDraft,
  input: Pick<
    CreationInput,
    "routeId" | "expectedRevision" | "lessonId" | "moduleId" | "lessonTitle"
  >,
  hash: string,
): Promise<{ lessonId: string; revision: number; blockId?: string }> {
  const { lessonId } = input;
  if (lessonId) {
    if (!draft.lessons.some((lesson) => lesson.id === lessonId)) {
      throw new ActionError("not_found", "not found");
    }
    const same = draft.blocks.find(
      (block) =>
        block.lessonId === lessonId &&
        block.kind === "interactive" &&
        (block.data as { creation?: string }).creation === hash,
    );
    return same
      ? { lessonId, revision: draft.revision, blockId: same.id }
      : { lessonId, revision: input.expectedRevision };
  }
  const moduleId = String(input.moduleId);
  if (!draft.modules.some((module) => module.id === moduleId)) {
    throw new ActionError("not_found", "not found");
  }
  const siblings = draft.lessons.filter((lesson) => lesson.moduleId === moduleId);
  const id = ctx.ids.newId();
  const { revision } = unwrap(
    await repos.routeDrafts.addLesson(draft.spaceId, input.routeId, input.expectedRevision, {
      id,
      moduleId,
      position: String(positionAfter(siblings, undefined)),
      title: input.lessonTitle as LocalizedText,
    }),
  );
  return { lessonId: id, revision };
}

export const assetUpload = defineAction({
  name: "asset.upload",
  kind: "mutation",
  description:
    "Keep an image, a sound or a short video on the content host, by what its bytes are.",
  // The bytes come from the server that decoded or fetched them: never through the log.
  input: z.strictObject({ spaceId: z.uuid(), file: z.instanceof(Uint8Array) }),
  target: (input) => ({ kind: "space", id: input.spaceId }),
  async run(ctx, input, given) {
    const { spaceId } = inSpace(given);
    const sniffed = sniffAsset(input.file);
    if (sniffed === null) {
      throw new ActionError(
        "invalid",
        "Nothing was stored: it must be a PNG, JPEG, GIF, WebP or SVG image, an MP3, WAV, OGG or M4A sound, or an MP4 or WebM video",
      );
    }
    const most = ASSET_MOST_BYTES[sniffed.kind];
    if (input.file.length > most) {
      throw new ActionError(
        "invalid",
        `Nothing was stored: this kind of file is at most ${megabytes(most)}`,
      );
    }
    const hash = await sha256Hex(input.file);
    const key = assetKey(spaceId, hash, sniffed.extension);
    await keep(ctx.repos, spaceId, {
      key,
      kind: "asset",
      contentType: sniffed.contentType,
      bytes: input.file.length,
    });
    return { spaceId, key, ...sniffed, bytes: input.file.length };
  },
});
