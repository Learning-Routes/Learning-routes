import * as z from "zod";
import { Block } from "../blocks/schema";
import { positionAfter } from "../content/position";
import { LocalizedText } from "../localized-text";
import type { Ctx } from "./define";
import { ActionError, defineAction, inSpace } from "./define";
import { unwrap } from "./results";

// Adding to a route's draft (Platform STEP 2 §6). Every edit names the revision it
// read and answers conflict on a stale one, so an agent and a person editing the
// same route never overwrite each other. A new item goes after the sibling named
// by after: first when after is null, last when it is left out.

const Edit = {
  routeId: z.uuid(),
  expectedRevision: z.int().nonnegative(),
  after: z.uuid().nullish(),
};

async function draftOf(ctx: Ctx, spaceId: string, routeId: string) {
  return unwrap(await ctx.repos.routeDrafts.get(spaceId, routeId));
}

function placed(
  siblings: { id: string; position: string }[],
  after: string | null | undefined,
): string {
  const position = positionAfter(siblings, after);
  if (position === null) {
    throw new ActionError("not_found", "not found");
  }
  return position;
}

/** An interactive block points at a stored file, so only upload_creation makes one. */
function onlyByUpload(type: string) {
  if (type === "interactive") {
    throw new ActionError("invalid", "an interactive block comes only from upload_creation");
  }
}

export const moduleAdd = defineAction({
  name: "module.add",
  kind: "mutation",
  description: "Add a module to a route's draft.",
  input: z.strictObject({ ...Edit, title: LocalizedText }),
  target: (input) => ({ kind: "route", id: input.routeId }),
  async run(ctx, input, given) {
    const { spaceId } = inSpace(given);
    const draft = await draftOf(ctx, spaceId, input.routeId);
    const module = {
      id: ctx.ids.newId(),
      position: placed(draft.modules, input.after),
      title: input.title,
    };
    const { revision } = unwrap(
      await ctx.repos.routeDrafts.addModule(spaceId, input.routeId, input.expectedRevision, module),
    );
    return { id: module.id, revision };
  },
});

export const lessonAdd = defineAction({
  name: "lesson.add",
  kind: "mutation",
  description: "Add a lesson to a module of a route's draft.",
  input: z.strictObject({ ...Edit, moduleId: z.uuid(), title: LocalizedText }),
  target: (input) => ({ kind: "route", id: input.routeId }),
  async run(ctx, input, given) {
    const { spaceId } = inSpace(given);
    const draft = await draftOf(ctx, spaceId, input.routeId);
    if (!draft.modules.some((module) => module.id === input.moduleId)) {
      throw new ActionError("not_found", "not found");
    }
    const siblings = draft.lessons.filter((lesson) => lesson.moduleId === input.moduleId);
    const lesson = {
      id: ctx.ids.newId(),
      moduleId: input.moduleId,
      position: placed(siblings, input.after),
      title: input.title,
    };
    const { revision } = unwrap(
      await ctx.repos.routeDrafts.addLesson(spaceId, input.routeId, input.expectedRevision, lesson),
    );
    return { id: lesson.id, revision };
  },
});

export const blockAdd = defineAction({
  name: "block.add",
  kind: "mutation",
  description:
    "Add a block to a lesson of a route's draft. The block is checked against core's block schema.",
  input: z.strictObject({ ...Edit, lessonId: z.uuid(), block: z.record(z.string(), z.unknown()) }),
  target: (input) => ({ kind: "route", id: input.routeId }),
  async run(ctx, input, given) {
    const { spaceId } = inSpace(given);
    const id = ctx.ids.newId();
    const parsed = Block.safeParse({ ...input.block, id });
    if (!parsed.success) {
      throw new ActionError("invalid", "not a valid block");
    }
    onlyByUpload(parsed.data.type);
    const draft = await draftOf(ctx, spaceId, input.routeId);
    if (!draft.lessons.some((lesson) => lesson.id === input.lessonId)) {
      throw new ActionError("not_found", "not found");
    }
    const { id: _, type, ...data } = parsed.data;
    const siblings = draft.blocks.filter((block) => block.lessonId === input.lessonId);
    const block = {
      id,
      lessonId: input.lessonId,
      position: placed(siblings, input.after),
      kind: type,
      data,
    };
    const { revision } = unwrap(
      await ctx.repos.routeDrafts.addBlock(spaceId, input.routeId, input.expectedRevision, block),
    );
    return { id, revision };
  },
});

export const blockAddMany = defineAction({
  name: "blocks.add",
  kind: "mutation",
  description: "Add blocks to the end of a lesson of a route's draft: all of them, or none.",
  input: z.strictObject({
    routeId: z.uuid(),
    expectedRevision: z.int().nonnegative(),
    lessonId: z.uuid(),
    blocks: z.array(z.record(z.string(), z.unknown())).min(1).max(100),
  }),
  target: (input) => ({ kind: "route", id: input.routeId }),
  async run(ctx, input, given) {
    const { spaceId } = inSpace(given);
    const draft = await draftOf(ctx, spaceId, input.routeId);
    if (!draft.lessons.some((lesson) => lesson.id === input.lessonId)) {
      throw new ActionError("not_found", "not found");
    }
    const siblings = draft.blocks.filter((block) => block.lessonId === input.lessonId);
    const blocks = input.blocks.map((given) => {
      const id = ctx.ids.newId();
      const parsed = Block.safeParse({ ...given, id });
      if (!parsed.success) {
        throw new ActionError("invalid", "not a valid block");
      }
      onlyByUpload(parsed.data.type);
      const { id: _, type, ...data } = parsed.data;
      return { id, lessonId: input.lessonId, kind: type, data };
    });
    return ctx.repos.transaction(async (repos) => {
      let revision = input.expectedRevision;
      for (const block of blocks) {
        const position = placed(siblings, undefined);
        siblings.push({ id: block.id, position } as (typeof siblings)[number]);
        ({ revision } = unwrap(
          await repos.routeDrafts.addBlock(spaceId, input.routeId, revision, {
            ...block,
            position,
          }),
        ));
      }
      return { ids: blocks.map((block) => block.id), revision };
    });
  },
});

/** Takes a block out of the draft (Platform STEP 9 §4). Published versions keep it. */
export const blockRemove = defineAction({
  name: "block.remove",
  kind: "mutation",
  description: "Take a block out of a route's draft. Published versions keep it.",
  input: z.strictObject({
    routeId: z.uuid(),
    expectedRevision: z.int().nonnegative(),
    blockId: z.uuid(),
  }),
  target: (input) => ({ kind: "route", id: input.routeId }),
  async run(ctx, input, given) {
    const { spaceId } = inSpace(given);
    return unwrap(
      await ctx.repos.routeDrafts.archiveBlock(
        spaceId,
        input.routeId,
        input.expectedRevision,
        input.blockId,
      ),
    );
  },
});
