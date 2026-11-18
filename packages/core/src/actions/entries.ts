import type { ActionDef } from "./define";
import { imageGenerate } from "./images";
import type { EntryName } from "./names";
import { tutorAsk } from "./tutor";

// The agent Worker's two entry points of its own (Platform STEP 20), listed here and nowhere else:
// with TOOL_ACTIONS (tool-actions.ts) they are every action that Worker runs.
export const ENTRY_ACTIONS = {
  "tutor.ask": tutorAsk,
  "image.generate": imageGenerate,
} as const satisfies Record<EntryName, ActionDef>;
