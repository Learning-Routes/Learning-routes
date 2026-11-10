import * as z from "zod";
import type { ModelTool } from "../ai/gate";
import { STUDIO_STEPS, type StudioOption, type StudioStep } from "./session";

// The assistant's own tools (Platform STEP 10 §1): how it talks to the page, beside the content
// tools it shares with the MCP. A model's call is untrusted output: every one is read here, and a
// call that breaks a rule is answered with what to fix, never drawn.

const Uuid = z.uuid();

const AskCreator = z.strictObject({
  question: z
    .string()
    .trim()
    .min(1)
    .max(400)
    // One question at a time (§2).
    .refine((text) => (text.match(/\?/g) ?? []).length <= 1, "Ask one question at a time."),
  is_fork: z.boolean(),
  options: z
    .array(
      z.strictObject({
        label: z.string().trim().min(1).max(60),
        decision: z.string().trim().min(1).max(40).optional(),
      }),
    )
    .max(4),
});

const SCHEMAS = {
  ask_creator: {
    description:
      "Ask the creator one question. For a question with common answers, give 2 to 4 short answers they can tap; " +
      "for an open one, like their name or their topic, give none: they type. Never offer answers that only postpone. " +
      "Put only the question here, not in your message. " +
      "Set is_fork only for a choice that shapes the route (who it is for, their content, the plan), and give " +
      "each option a decision of a few words that stays on their map. Your turn ends here.",
    input: AskCreator.refine(
      (ask) => !ask.is_fork || (ask.options.length >= 2 && ask.options.every((o) => o.decision)),
      "A fork needs two or more options, each with a decision.",
    ).refine((ask) => ask.options.length !== 1, "Give no options, or two to four."),
  },
  set_step: {
    description:
      "Move the visible guided path to a step. Call it when the conversation reaches a new step.",
    input: z.strictObject({ step: z.enum(STUDIO_STEPS) }),
  },
  show_lesson: {
    description:
      "Show the creator a lesson of the draft as a student will see it. Call it after you write a lesson.",
    input: z.strictObject({ route_id: Uuid, lesson_id: Uuid }),
  },
  ask_to_publish: {
    description:
      "Show the creator the button to publish the route. Only they can press it; never say it is published before they do.",
    input: z.strictObject({ route_id: Uuid }),
  },
  load_skill: {
    description:
      "Load one of the skills listed in your instructions, by its name, when the creator's words call for it. " +
      "Its full text then follows your instructions until the step changes.",
    input: z.strictObject({
      name: z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .max(60),
    }),
  },
} as const;

type Name = keyof typeof SCHEMAS;

export const STUDIO_TOOLS: ModelTool[] = (Object.keys(SCHEMAS) as Name[]).map((name) => ({
  type: "function",
  function: {
    name,
    description: SCHEMAS[name].description,
    parameters: z.toJSONSchema(SCHEMAS[name].input, { io: "input" }) as Record<string, unknown>,
  },
}));

export type StudioCall =
  | { name: "ask_creator"; question: string; isFork: boolean; options: StudioOption[] }
  | { name: "set_step"; step: StudioStep }
  | { name: "show_lesson"; routeId: string; lessonId: string }
  | { name: "ask_to_publish"; routeId: string }
  | { name: "load_skill"; skill: string };

export type ReadCall = { ok: true; call: StudioCall } | { ok: false; error: string };

export const isStudioTool = (name: string): name is Name => Object.hasOwn(SCHEMAS, name);

function parsed(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** A model's call to one of these tools, read and checked. */
export function readStudioCall(name: string, argumentsText: string): ReadCall {
  if (!isStudioTool(name)) {
    return { ok: false, error: `There is no tool ${name}.` };
  }
  const json = parsed(argumentsText);
  if (!json.ok) {
    return { ok: false, error: "The arguments are not valid JSON." };
  }
  const read = SCHEMAS[name].input.safeParse(json.value);
  if (!read.success) {
    return { ok: false, error: read.error.issues.map((issue) => issue.message).join("; ") };
  }
  const args = read.data as unknown as {
    step: StudioStep;
    route_id: string;
    lesson_id: string;
    name: string;
  };
  switch (name) {
    case "ask_creator": {
      const ask = read.data as z.infer<typeof AskCreator>;
      return {
        ok: true,
        call: {
          name,
          question: ask.question,
          isFork: ask.is_fork,
          options: ask.options.map((option, at) => ({
            id: `o${at + 1}`,
            label: option.label,
            ...(option.decision ? { decision: option.decision } : {}),
          })),
        },
      };
    }
    case "set_step":
      return { ok: true, call: { name, step: args.step } };
    case "show_lesson":
      return { ok: true, call: { name, routeId: args.route_id, lessonId: args.lesson_id } };
    case "ask_to_publish":
      return { ok: true, call: { name, routeId: args.route_id } };
    case "load_skill":
      return { ok: true, call: { name, skill: args.name } };
  }
}

const ENDS = ".!?…";
const SPACE = /\s/;
// A question is a sentence that ends in ?, whatever it quotes on the way.
const IS_QUESTION = /\?[»"”]?$/;

/**
 * Sentences end at a closing mark followed by a space, outside any quote: an address with a ?
 * and a quoted question stay inside their sentence.
 */
function sentencesOf(text: string): string[] {
  const sentences: string[] = [];
  let depth = 0;
  let start = 0;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at] as string;
    depth += char === "«" || char === "“" ? 1 : char === "»" || char === "”" ? -1 : 0;
    if (depth <= 0 && ENDS.includes(char) && SPACE.test(text[at + 1] ?? "")) {
      sentences.push(text.slice(start, at + 1));
      start = at + 1;
    }
  }
  return [...sentences, text.slice(start)];
}

/**
 * What the page shows when the assistant asks: its words, then the one question. A question the
 * model also wrote in its words gives way to the one it asked, so the creator meets one at a time.
 */
export function askText(said: string, question: string): string {
  const kept = sentencesOf(said)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !IS_QUESTION.test(sentence));
  return [...kept, question].join(" ");
}
