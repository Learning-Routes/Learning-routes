import * as z from "zod";
import { keyBetween } from "../content/position";
import { problemsIn, type RouteDocument } from "../content/route-document";
import type { Ids } from "./define";
import { ActionError, defineAction, inSpace } from "./define";
import { unwrap } from "./results";

// import_route's action (Platform STEP 5 §4): one document, one transaction. It makes a new
// draft, or replaces the draft of a route you can edit. Published versions are frozen
// snapshots, so nothing here can reach them; and it sets no price, so a route stays free.

function contentOf(document: RouteDocument, ids: Ids) {
  const modules = [];
  const lessons = [];
  const blocks = [];
  let lastModule: string | null = null;
  for (const module of document.modules) {
    lastModule = keyBetween(lastModule, null);
    const moduleId = ids.newId();
    modules.push({ id: moduleId, position: lastModule, title: module.title });
    let lastLesson: string | null = null;
    for (const lesson of module.lessons) {
      lastLesson = keyBetween(lastLesson, null);
      const lessonId = ids.newId();
      lessons.push({ id: lessonId, moduleId, position: lastLesson, title: lesson.title });
      let lastBlock: string | null = null;
      for (const { type, ...data } of lesson.blocks) {
        lastBlock = keyBetween(lastBlock, null);
        blocks.push({ id: ids.newId(), lessonId, position: lastBlock, kind: type, data });
      }
    }
  }
  return { modules, lessons, blocks };
}

export const routeImport = defineAction({
  name: "route.import",
  kind: "mutation",
  description:
    "Import a whole route from one document: a new draft in a space, or a replacement for an editable route's draft. All of it, or nothing.",
  input: z
    .strictObject({
      spaceId: z.uuid().optional(),
      routeId: z.uuid().optional(),
      expectedRevision: z.int().nonnegative().optional(),
      document: z.unknown(),
    })
    .refine(
      (input) =>
        input.routeId
          ? input.expectedRevision !== undefined && input.spaceId === undefined
          : input.spaceId !== undefined,
      "a space_id for a new route, or a route_id with its draft_revision",
    ),
  target: (input) =>
    input.routeId
      ? { kind: "route", id: input.routeId }
      : { kind: "space", id: String(input.spaceId) },
  async run(ctx, input, given) {
    const { spaceId } = inSpace(given);
    const checked = problemsIn(input.document);
    if (!checked.ok) {
      throw new ActionError(
        "invalid",
        `Nothing was written. Fix these problems:\n${checked.problems.join("\n")}`,
      );
    }
    const { document } = checked;
    const content = contentOf(document, ctx.ids);
    const details = {
      title: document.title,
      description: document.description ?? null,
      ...(document.topic ? { topic: document.topic } : {}),
      ...(document.level ? { level: document.level } : {}),
    };
    return ctx.repos.transaction(async (repos) => {
      const routeId = input.routeId ?? ctx.ids.newId();
      if (!input.routeId) {
        const created = await repos.routeDrafts.create(spaceId, {
          id: routeId,
          slug: document.slug,
          title: document.title,
          description: document.description ?? null,
          sourceLocale: document.source_locale,
          access: "open",
          pricing: "free",
          topic: document.topic ?? "otros",
          level: document.level ?? "inicial",
          priceMinor: null,
          currency: null,
        });
        if (!created.ok && created.error === "conflict") {
          throw new ActionError("conflict", "a route in this space already has that slug");
        }
        unwrap(created);
      }
      const { revision } = unwrap(
        await repos.routeDrafts.replaceContent(spaceId, routeId, input.expectedRevision ?? 0, {
          details,
          ...content,
        }),
      );
      return {
        routeId,
        revision,
        counts: {
          modules: content.modules.length,
          lessons: content.lessons.length,
          blocks: content.blocks.length,
        },
      };
    });
  },
});
