import * as z from "zod";
import { IMAGE_LIMITS, imageMessages, monthStart } from "../images/images";
import { carried } from "../repos/carried";
import { ActionError, defineAction, inSpace } from "./define";

// Route images (Platform STEP 20 §B). This takes one of the creator's images for the month and says
// what to ask the model; the agent Worker asks it after this commits, since no model call runs
// inside a transaction, and keeps the image as one of the space's assets.

export const imageGenerate = defineAction({
  name: "image.generate",
  kind: "mutation",
  description: "Make one image for a route from a description: it takes one of the month's images.",
  input: z.strictObject({
    spaceId: z.uuid(),
    prompt: z.string().trim().min(1).max(IMAGE_LIMITS.promptChars),
  }),
  target: (input) => ({ kind: "space", id: input.spaceId }),
  async run(ctx, input, given) {
    const { spaceId } = inSpace(given);
    const now = ctx.clock.now();
    const id = await carried(ctx.repos.images).take(
      spaceId,
      ctx.actor.userId,
      monthStart(now),
      IMAGE_LIMITS.perMonth,
      now,
    );
    if (id === null) {
      throw new ActionError("rate_limited", "this month's images are spent");
    }
    return { imageId: id, spaceId, ...imageMessages(input.prompt) };
  },
});
