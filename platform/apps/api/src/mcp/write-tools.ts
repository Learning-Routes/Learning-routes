import { ROUTE_LEVELS, ROUTE_TOPICS } from "@learning-routes/core/copy/route-facts";
import { Locale } from "@learning-routes/core/localized-text";
import * as z from "zod";
import { DraftRevision, type Revision, RouteId, Text, type Tool, tool } from "./tool";

// The tools that change a draft, and the one that publishes it (Platform STEP 5 §3).

const Revised = z.strictObject({ draft_revision: z.int() });
const After = z
  .uuid()
  .nullish()
  .describe("Goes after this sibling. Null puts it first; left out, it goes last.");
const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

export const WRITE_TOOLS: Tool[] = [
  tool({
    name: "create_route",
    scope: "routes:write",
    action: "route.create",
    description:
      "Create a free route's empty draft in a space. Nobody sees it until publish_route. A price is set in the app, never here.",
    annotations: WRITE,
    input: z.strictObject({
      space_id: z.uuid(),
      slug: z
        .string()
        .max(80)
        .describe("Its address on the creator's page: lower-case words joined by hyphens."),
      title: Text,
      description: Text.nullish(),
      source_locale: Locale.describe("The locale it is written in, like es."),
      topic: z.enum(ROUTE_TOPICS).optional(),
      level: z.enum(ROUTE_LEVELS).optional(),
    }),
    output: z.strictObject({ route_id: z.uuid(), draft_revision: z.int() }),
    toAction: (input) => ({
      spaceId: input.space_id,
      slug: input.slug,
      title: input.title,
      description: input.description,
      sourceLocale: input.source_locale,
      access: "open",
      pricing: "free",
      ...(input.topic ? { topic: input.topic } : {}),
      ...(input.level ? { level: input.level } : {}),
    }),
    toOutput: (output: { routeId: string } & Revision) => ({
      route_id: output.routeId,
      draft_revision: output.revision,
    }),
  }),
  tool({
    name: "update_route_details",
    scope: "routes:write",
    action: "route.update",
    description: "Change a draft's title, description, topic or level. Never its price or address.",
    annotations: { ...WRITE, idempotentHint: true },
    input: z.strictObject({
      route_id: RouteId,
      draft_revision: DraftRevision,
      title: Text.optional(),
      description: Text.nullish(),
      topic: z.enum(ROUTE_TOPICS).optional(),
      level: z.enum(ROUTE_LEVELS).optional(),
    }),
    output: Revised,
    toAction: ({ route_id, draft_revision, ...details }) => ({
      routeId: route_id,
      expectedRevision: draft_revision,
      ...details,
    }),
    toOutput: (output: Revision) => ({ draft_revision: output.revision }),
  }),
  tool({
    name: "add_module",
    scope: "routes:write",
    action: "module.add",
    description: "Add a module to a route's draft.",
    annotations: WRITE,
    input: z.strictObject({
      route_id: RouteId,
      draft_revision: DraftRevision,
      title: Text,
      after: After,
    }),
    output: z.strictObject({ module_id: z.uuid(), draft_revision: z.int() }),
    toAction: (input) => ({
      routeId: input.route_id,
      expectedRevision: input.draft_revision,
      title: input.title,
      after: input.after,
    }),
    toOutput: (output: { id: string } & Revision) => ({
      module_id: output.id,
      draft_revision: output.revision,
    }),
  }),
  tool({
    name: "add_lesson",
    scope: "routes:write",
    action: "lesson.add",
    description: "Add a lesson to a module of a route's draft.",
    annotations: WRITE,
    input: z.strictObject({
      route_id: RouteId,
      draft_revision: DraftRevision,
      module_id: z.uuid(),
      title: Text,
      after: After,
    }),
    output: z.strictObject({ lesson_id: z.uuid(), draft_revision: z.int() }),
    toAction: (input) => ({
      routeId: input.route_id,
      expectedRevision: input.draft_revision,
      moduleId: input.module_id,
      title: input.title,
      after: input.after,
    }),
    toOutput: (output: { id: string } & Revision) => ({
      lesson_id: output.id,
      draft_revision: output.revision,
    }),
  }),
  tool({
    name: "add_blocks",
    scope: "routes:write",
    action: "blocks.add",
    description:
      "Add blocks to the end of a lesson: all of them, or none. Read the format in the resource learning-routes://guides/route-format.",
    annotations: WRITE,
    input: z.strictObject({
      route_id: RouteId,
      draft_revision: DraftRevision,
      lesson_id: z.uuid(),
      blocks: z.array(z.record(z.string(), z.unknown())).min(1).max(100),
    }),
    output: z.strictObject({ block_ids: z.array(z.uuid()), draft_revision: z.int() }),
    toAction: (input) => ({
      routeId: input.route_id,
      expectedRevision: input.draft_revision,
      lessonId: input.lesson_id,
      blocks: input.blocks,
    }),
    toOutput: (output: { ids: string[] } & Revision) => ({
      block_ids: output.ids,
      draft_revision: output.revision,
    }),
  }),
  tool({
    name: "import_route",
    scope: "routes:write",
    action: "route.import",
    description:
      "Import a whole route from one document: give space_id for a new draft, or route_id and draft_revision to replace an editable route's draft. All of it or nothing; a published version is never touched. Read the format in the resource learning-routes://guides/route-format, and its JSON Schema in learning-routes://schemas/route-document.",
    annotations: WRITE,
    input: z.strictObject({
      space_id: z.uuid().optional().describe("For a new draft: the space's id."),
      route_id: z.uuid().optional().describe("To replace a draft: the route's id."),
      draft_revision: DraftRevision.optional(),
      document: z
        .record(z.string(), z.unknown())
        .describe("The route: learning-routes://schemas/route-document."),
    }),
    output: z.strictObject({
      route_id: z.uuid(),
      draft_revision: z.int(),
      counts: z.strictObject({ modules: z.int(), lessons: z.int(), blocks: z.int() }),
      next_step: z.string(),
    }),
    toAction: (input) => ({
      ...(input.space_id ? { spaceId: input.space_id } : {}),
      ...(input.route_id ? { routeId: input.route_id } : {}),
      ...(input.draft_revision === undefined ? {} : { expectedRevision: input.draft_revision }),
      document: input.document,
    }),
    toOutput: (output: { routeId: string; counts: Record<string, number> } & Revision) => ({
      route_id: output.routeId,
      draft_revision: output.revision,
      counts: output.counts,
      next_step: "Revisa el borrador y, cuando quieras, publícalo con publish_route.",
    }),
  }),
  tool({
    name: "publish_route",
    scope: "routes:publish",
    action: "route.publish",
    description:
      "Publish a route's draft on the creator's public page, where students can start it. Do this only when the person asks. Answers with the public address.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    input: z.strictObject({ route_id: RouteId, draft_revision: DraftRevision }),
    output: z.strictObject({
      route_id: z.uuid(),
      version: z.int(),
      draft_revision: z.int(),
      public_url: z.string().nullable(),
    }),
    toAction: (input) => ({ routeId: input.route_id, expectedRevision: input.draft_revision }),
    toOutput: (output: { routeId: string; version: number } & Revision, url) => ({
      route_id: output.routeId,
      version: output.version,
      draft_revision: output.revision,
      public_url: url,
    }),
  }),
];
