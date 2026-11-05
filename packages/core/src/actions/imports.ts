import * as z from "zod";
import { lessonView } from "../content/lesson-view";
import { keyBetween } from "../content/position";
import { MOST, problemsIn, type RouteDocument } from "../content/route-document";
import type { Snapshot } from "../content/snapshot";
import { structureDocument } from "../content/structure-document";
import { Locale } from "../localized-text";
import type { Ctx, Ids } from "./define";
import { ActionError, defineAction, inSpace } from "./define";
import { unwrap } from "./results";

// import_route's action (Platform STEP 5 §4): one document, one transaction. It makes a new
// draft, or replaces the draft of a route you can edit. Published versions are frozen
// snapshots, so nothing here can reach them; and it sets no price, so a route stays free.

const MOST_DOCUMENT = 900_000;

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

function writeDocument(
  ctx: Ctx,
  spaceId: string,
  document: RouteDocument,
  existingId?: string,
  expectedRevision?: number,
) {
  const content = contentOf(document, ctx.ids);
  const details = {
    title: document.title,
    description: document.description ?? null,
    ...(document.topic ? { topic: document.topic } : {}),
    ...(document.level ? { level: document.level } : {}),
  };
  return ctx.repos.transaction(async (repos) => {
    const routeId = existingId ?? ctx.ids.newId();
    if (!existingId) {
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
      await repos.routeDrafts.replaceContent(spaceId, routeId, expectedRevision ?? 0, {
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
    return writeDocument(ctx, spaceId, checked.document, input.routeId, input.expectedRevision);
  },
});

/** The server structures it, by rules: the model never rewrites what the creator made. */
export const routeUpload = defineAction({
  name: "route.upload",
  kind: "mutation",
  description: "Bring a document the creator already made: the server makes it a draft, as it is.",
  input: z.strictObject({
    spaceId: z.uuid(),
    document: z.string().min(1).max(MOST_DOCUMENT),
    format: z.enum(["markdown", "html"]),
    title: z.string().trim().min(1).max(MOST.titleLength).optional(),
    locale: Locale.optional(),
  }),
  target: (input) => ({ kind: "space", id: input.spaceId }),
  async run(ctx, input, given) {
    const { spaceId } = inSpace(given);
    const { document, report, problems } = structureDocument({
      source: input.document,
      format: input.format,
      locale: input.locale ?? "es",
      title: input.title,
    });
    const checked = problems.length > 0 ? { ok: false as const, problems } : problemsIn(document);
    if (!checked.ok) {
      throw new ActionError(
        "invalid",
        `Nothing was written. Fix these problems:\n${checked.problems.join("\n")}`,
      );
    }
    // The same document twice is one route: its slug carries the content's fingerprint.
    const routes = await ctx.repos.routeDrafts.list(spaceId);
    const same = routes.find((route) => route.slug === document.slug);
    if (same) {
      return {
        routeId: same.id,
        revision: same.revision,
        counts: countsOf(document),
        report,
        repeated: true,
      };
    }
    const written = await writeDocument(ctx, spaceId, checked.document);
    return { ...written, report, repeated: false };
  },
});

function countsOf(document: RouteDocument) {
  const lessons = document.modules.flatMap((module) => module.lessons);
  return {
    modules: document.modules.length,
    lessons: lessons.length,
    blocks: lessons.flatMap((lesson) => lesson.blocks).length,
  };
}

/** A draft as a student would read it, for those who make it (Platform STEP 8 §3). */
export const routePreview = defineAction({
  name: "route.preview",
  kind: "query",
  description: "See a route's draft, one topic at a time, as a student would.",
  input: z.strictObject({ routeId: z.uuid(), topic: z.int().positive().optional() }),
  target: (input) => ({ kind: "route", id: input.routeId }),
  async run(ctx, input, given) {
    const { spaceId } = inSpace(given);
    const draft = unwrap(await ctx.repos.routeDrafts.get(spaceId, input.routeId));
    // Nothing is locked for whoever makes the route.
    const open = { ...draft, route: { ...draft.route, pricing: "free" as const } };
    const view = lessonView(open as Snapshot, input.topic ?? 1);
    return {
      view,
      route: draft.route,
      outline: draft.modules.map((module) => ({
        title: module.title,
        lessons: draft.lessons
          .filter((lesson) => lesson.moduleId === module.id)
          .map((lesson) => lesson.title),
      })),
    };
  },
});
