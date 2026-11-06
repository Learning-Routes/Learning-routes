import type { ActionName } from "@learning-routes/core/actions/names";
import { LocalizedText } from "@learning-routes/core/localized-text";
import * as z from "zod";

// What a tool is (Platform STEP 5 §3): one core action, in the terms a model reads. Inputs
// and outputs are snake_case and strict; an edit always names the revision it read.

export const RouteId = z.uuid().describe("The route's id, from list_routes or create_route.");
export const DraftRevision = z
  .int()
  .nonnegative()
  .describe("The draft's revision you last read, from get_route or the last write's answer.");
export const Text = LocalizedText.describe('Text by locale, like {"es": "Hola"}.');

export interface Tool {
  name: string;
  scope: "routes:read" | "routes:write" | "routes:publish";
  /** null for a tool that reads nothing of anyone's: `answers` holds what it says. */
  action: ActionName | null;
  answers?: () => Record<string, unknown>;
  description: string;
  annotations: Record<string, boolean>;
  input: z.ZodType;
  output: z.ZodType;
  toAction: (input: unknown) => unknown;
  toOutput: (output: unknown, url: string | null) => unknown;
}

export type Revision = { revision: number };

export function tool<I extends z.ZodType>(
  spec: Omit<Tool, "input" | "toAction" | "toOutput"> & {
    input: I;
    toAction: (input: z.infer<I>) => unknown;
    toOutput: (output: never, url: string | null) => unknown;
  },
): Tool {
  return spec as unknown as Tool;
}

/** A tool's refusal, in words a model can pass on. */
export const failed = (text: string) => ({
  isError: true,
  content: [{ type: "text" as const, text }],
});
