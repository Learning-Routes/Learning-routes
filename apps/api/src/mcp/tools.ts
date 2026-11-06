import * as z from "zod";
import { routeFormat } from "./guides";
import { RouteId, type Tool, tool } from "./tool";
import { UPLOAD_TOOLS } from "./upload-tools";
import { WRITE_TOOLS } from "./write-tools";

export type { Tool };

// The tools (Platform STEP 5 §3). These read; write-tools.ts holds the ones that change things.

const READ = { readOnlyHint: true, openWorldHint: false };

const LIST_ROUTES_OUTPUT = z.strictObject({
  routes: z.array(
    z.strictObject({
      route_id: z.uuid(),
      slug: z.string(),
      title: z.record(z.string(), z.string()),
      draft_revision: z.int(),
      published_version: z.int().nullable(),
    }),
  ),
});

export const TOOLS: Tool[] = [
  tool({
    name: "list_spaces",
    scope: "routes:read",
    action: "space.list",
    description:
      "List the spaces you can teach in, with your role in each. Start here: every route lives in a space. To build a route, call get_route_format, then import_route; for a course they already wrote, upload_document.",
    annotations: READ,
    input: z.strictObject({}),
    output: z.strictObject({
      spaces: z.array(
        z.strictObject({
          space_id: z.uuid(),
          slug: z.string(),
          name: z.record(z.string(), z.string()),
          role: z.string(),
        }),
      ),
    }),
    toAction: () => ({}),
    toOutput: (spaces: { id: string; slug: string; name: unknown; role: string }[]) => ({
      spaces: spaces.map(({ id, slug, name, role }) => ({ space_id: id, slug, name, role })),
    }),
  }),
  tool({
    name: "list_routes",
    scope: "routes:read",
    action: "route.list",
    description: "List the routes of one space, with each draft's revision and published version.",
    annotations: READ,
    input: z.strictObject({ space_id: z.uuid().describe("The space's id, from list_spaces.") }),
    output: LIST_ROUTES_OUTPUT,
    toAction: (input) => ({ spaceId: input.space_id }),
    toOutput: (
      routes: {
        id: string;
        slug: string;
        title: unknown;
        revision: number;
        latestPublishedVersion: number | null;
      }[],
    ) => ({
      routes: routes.map((route) => ({
        route_id: route.id,
        slug: route.slug,
        title: route.title,
        draft_revision: route.revision,
        published_version: route.latestPublishedVersion,
      })),
    }),
  }),
  tool({
    name: "get_route",
    scope: "routes:read",
    action: "route.get",
    description:
      "Read a route's draft: its details, modules, lessons and blocks, and the draft_revision every write needs.",
    annotations: READ,
    input: z.strictObject({ route_id: RouteId }),
    output: z.strictObject({
      route_id: z.uuid(),
      draft_revision: z.int(),
      published_version: z.int().nullable(),
      route: z.record(z.string(), z.unknown()),
      modules: z.array(z.record(z.string(), z.unknown())),
      lessons: z.array(z.record(z.string(), z.unknown())),
      blocks: z.array(z.record(z.string(), z.unknown())),
      preview_url: z.string().nullable(),
    }),
    toAction: (input) => ({ routeId: input.route_id }),
    toOutput: (
      draft: {
        route: { id: string };
        revision: number;
        latestPublishedVersion: number | null;
        modules: unknown[];
        lessons: unknown[];
        blocks: unknown[];
      },
      url,
    ) => ({
      route_id: draft.route.id,
      preview_url: url,
      draft_revision: draft.revision,
      published_version: draft.latestPublishedVersion,
      route: draft.route,
      modules: draft.modules,
      lessons: draft.lessons,
      blocks: draft.blocks,
    }),
  }),
  tool({
    name: "get_route_format",
    scope: "routes:read",
    action: null,
    answers: routeFormat,
    description:
      "Read how to write a route: the guide, with an example, and the JSON Schema of import_route's document. Call this before import_route.",
    annotations: READ,
    input: z.strictObject({}),
    output: z.strictObject({ guide: z.string(), json_schema: z.record(z.string(), z.unknown()) }),
    toAction: () => ({}),
    toOutput: (output: unknown) => output,
  }),
  ...WRITE_TOOLS,
  ...UPLOAD_TOOLS,
];

/** The scope a tool needs; null for a name that is no tool, which the SDK answers. */
export function scopeOfTool(name: unknown): string | null {
  return TOOLS.find((entry) => entry.name === name)?.scope ?? null;
}
