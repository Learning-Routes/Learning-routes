import type { ActionDef } from "./define";
import { blockAddMany, lessonAdd, moduleAdd } from "./drafting";
import { routeImport, routeUpload } from "./imports";
import type { ActionName } from "./names";
import { routeCreate, routeGet, routeList, routePublish, routeUpdate } from "./routes";
import { spaceGet, spaceList } from "./spaces";
import { assetUpload, creationUpload } from "./uploads";

// The actions behind the MCP's tools, which are all the assistant calls. The agent Worker imports
// these instead of the whole registry (actions/registry.ts), so it does not carry the rest.
export const TOOL_ACTIONS = {
  "space.list": spaceList,
  "space.get": spaceGet,
  "route.list": routeList,
  "route.get": routeGet,
  "route.create": routeCreate,
  "route.update": routeUpdate,
  "module.add": moduleAdd,
  "lesson.add": lessonAdd,
  "blocks.add": blockAddMany,
  "route.upload": routeUpload,
  "route.import": routeImport,
  "route.publish": routePublish,
  "creation.upload": creationUpload,
  "asset.upload": assetUpload,
} as const satisfies Partial<Record<ActionName, ActionDef>>;

export type ToolActionName = keyof typeof TOOL_ACTIONS;
