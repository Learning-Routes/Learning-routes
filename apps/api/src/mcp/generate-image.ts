import { IMAGE_LIMITS } from "@learning-routes/core/images/images";
import * as z from "zod";
import { CALLER_HEADER, CALLER_IMAGES_PATH, signedCaller } from "../agent/caller";
import { failed, type Tool, tool } from "./tool";

// generate_image (Platform STEP 20 §B): the same image as POST /api/creator/images, with the same
// rules, made by the agent Worker. This Worker only says who is asking, signed (agent/caller.ts);
// the agent Worker runs image.generate as that person, through the MCP, and keeps the asset.

export const GENERATE_IMAGE: Tool = tool({
  name: "generate_image",
  scope: "routes:write",
  action: null,
  byAgent: true,
  description: `Make one image for a route from a description, kept in the space like upload_asset, and get its address to use as a route's cover or in a block (image_url). A creator may make ${IMAGE_LIMITS.perMonth} a month. No text appears in the image.`,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  input: z.strictObject({
    space_id: z.uuid().optional().describe("The space's id. Leave it out if they have one space."),
    prompt: z
      .string()
      .min(1)
      .max(IMAGE_LIMITS.promptChars)
      .describe("What the image shows, in any language."),
  }),
  output: z.strictObject({ url: z.string() }),
  toAction: (input) => input,
  toOutput: (output: { url: string }) => ({ url: output.url }),
});

type Agent = { fetch: (request: Request) => Promise<Response> };

/** Asks the agent Worker for the image, as the caller; its refusal is said as it said it. */
export async function imageByAgent(env: Env, userId: string, input: unknown) {
  const agent = (env as Env & { AGENT?: Agent }).AGENT;
  if (!agent) {
    return failed("images_unavailable: images can't be made right now. Try again later.");
  }
  const response = await agent.fetch(
    new Request(`https://agent${CALLER_IMAGES_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [CALLER_HEADER]: await signedCaller(env.BETTER_AUTH_SECRET, userId),
      },
      body: JSON.stringify(input),
    }),
  );
  const answer = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    url?: string;
    code?: string;
    message?: string;
  };
  if (!(answer.ok && answer.url)) {
    return failed(
      `${answer.code ?? "images_unavailable"}: ${answer.message ?? "no image was made."}`,
    );
  }
  const structuredContent = { url: answer.url };
  return {
    structuredContent,
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
  };
}
