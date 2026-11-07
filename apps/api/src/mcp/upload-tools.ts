import { CREATION_SHAPES } from "@learning-routes/core/blocks/schema";
import * as z from "zod";
import { DraftRevision, RouteId, Text, type Tool, tool } from "./tool";

// What the creator already made, brought as files (Platform STEP 9 §2): an interactive creation,
// kept exactly as given, and the images, sound and video a route or a creation uses.

const UPLOAD = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/** Base64 to bytes; anything that is not base64 decodes to nothing, which nothing accepts. */
function bytesOf(base64: string): Uint8Array {
  try {
    return Uint8Array.from(atob(base64.replace(/\s/g, "")), (char) => char.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
}

export const UPLOAD_TOOLS: Tool[] = [
  tool({
    name: "upload_creation",
    scope: "routes:write",
    action: "creation.upload",
    description:
      "Bring an interactive creation the creator already made, like a piano, a game, a quiz or a simulator: one HTML file with its scripts and styles, up to 2 MB. Send the file exactly as it is: never rebuild, shorten or rewrite it, and never offer to remake it. It becomes an interactive block in a lesson and runs in its own box, where it cannot reach the internet, save data, open windows or show alerts. Answers with the block, the preview link to give the person, and what the creation will not be able to do here. Sending the same file to the same lesson again changes nothing. To put a new version in place of one already uploaded, send it with that block_id.",
    // Not idempotent with module_id: each call makes a new lesson.
    annotations: { ...UPLOAD, idempotentHint: false },
    input: z.strictObject({
      route_id: RouteId,
      draft_revision: DraftRevision,
      lesson_id: z.uuid().optional().describe("The lesson it goes in, from get_route."),
      module_id: z
        .uuid()
        .optional()
        .describe("Instead of lesson_id: a new lesson for it, at the end of this module."),
      lesson_title: Text.optional().describe("The new lesson's title, with module_id."),
      block_id: z
        .uuid()
        .optional()
        .describe(
          "Instead of a lesson: the interactive block, from get_route, whose file this new version replaces. The block keeps its place and what was written about it unless you send new words.",
        ),
      title: Text.optional().describe(
        "The creation's name, as the student sees it. Needed unless block_id is given.",
      ),
      description: Text.nullish().describe("One or two lines for the student: what to do with it."),
      alt_text: Text.nullish().describe(
        "What it shows and does, in words, for someone who cannot use it.",
      ),
      shape: z
        .enum(CREATION_SHAPES)
        .nullish()
        .describe(
          "The creation's proportions, from how it is laid out: wide 16:9, standard 4:3 (the default), square 1:1, tall 3:4.",
        ),
      html: z
        .string()
        .describe("The whole HTML file, exactly as the creator has it, scripts included."),
    }),
    output: z.strictObject({
      block_id: z.uuid(),
      lesson_id: z.uuid(),
      draft_revision: z.int(),
      already_uploaded: z.boolean(),
      cannot_do_here: z.array(z.string()),
      preview_url: z.string().nullable(),
    }),
    toAction: (input) => ({
      routeId: input.route_id,
      expectedRevision: input.draft_revision,
      ...(input.lesson_id ? { lessonId: input.lesson_id } : {}),
      ...(input.module_id ? { moduleId: input.module_id } : {}),
      ...(input.lesson_title ? { lessonTitle: input.lesson_title } : {}),
      ...(input.block_id ? { blockId: input.block_id } : {}),
      title: input.title,
      description: input.description,
      altText: input.alt_text,
      shape: input.shape,
      source: input.html,
    }),
    toOutput: (
      output: {
        blockId: string;
        lessonId: string;
        revision: number;
        repeated: boolean;
        limits: string[];
      },
      url,
    ) => ({
      block_id: output.blockId,
      lesson_id: output.lessonId,
      draft_revision: output.revision,
      already_uploaded: output.repeated,
      cannot_do_here: output.limits,
      preview_url: url,
    }),
  }),
  tool({
    name: "upload_asset",
    scope: "routes:write",
    action: "asset.upload",
    description:
      "Keep an image, a sound or a short video the creator has, and get its address to use in blocks (image_url, audio_url, video_url) or inside a creation. Give the file in base64 (up to about 2.5 MB this way), or an https address to take it from. Its type is read from its bytes: PNG, JPEG, GIF, WebP or SVG up to 5 MB; MP3, WAV, OGG or M4A up to 15 MB; MP4 or WebM up to 25 MB. The same file twice is one file.",
    annotations: { ...UPLOAD, openWorldHint: true },
    input: z
      .strictObject({
        space_id: z
          .uuid()
          .optional()
          .describe("The space's id. Leave it out if they have one space."),
        data_base64: z.string().optional().describe("The file's bytes, in base64."),
        source_url: z.url().optional().describe("Instead: an https address to take it from."),
      })
      .refine(
        (input) => (input.data_base64 === undefined) !== (input.source_url === undefined),
        "data_base64 or source_url, one of them",
      ),
    output: z.strictObject({
      url: z.string(),
      content_type: z.string(),
      kind: z.enum(["image", "audio", "video"]),
      bytes: z.int(),
    }),
    // fetched: the bytes the server took from source_url, before the action (server.ts).
    toAction: (input: { space_id?: string; data_base64?: string; fetched?: Uint8Array }) => ({
      spaceId: input.space_id,
      file: input.fetched ?? bytesOf(input.data_base64 ?? ""),
    }),
    toOutput: (output: { contentType: string; kind: string; bytes: number }, url) => ({
      url: String(url),
      content_type: output.contentType,
      kind: output.kind,
      bytes: output.bytes,
    }),
  }),
];
