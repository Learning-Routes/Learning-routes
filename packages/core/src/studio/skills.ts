import * as z from "zod";
import type { StudioStep } from "./session";

// The assistant's skills (Platform STEP 10 §3): files in the repo at skills/<area>/<name>/SKILL.md,
// loaded the way Claude's skills are. The model always sees a short index for the step it is in;
// it loads a skill's full text only when it needs it, at most four at once, and changing step
// unloads them all. Pure: the agent keeps which are loaded.

export const SKILL_AREAS = [
  "entrevista",
  "pedagogia",
  "formatos",
  "materias",
  "importar",
  "calidad",
  "pagina",
] as const;
export type SkillArea = (typeof SKILL_AREAS)[number];

/** Where each area helps: the index for a step lists only these, so it stays short as it grows. */
const AREA_STEPS: Record<SkillArea, readonly StudioStep[]> = {
  entrevista: ["meet", "content"],
  importar: ["content", "plan"],
  pedagogia: ["plan", "build", "review"],
  materias: ["plan", "build", "review"],
  formatos: ["build", "review"],
  calidad: ["build", "review"],
  pagina: ["page", "publish"],
};

export const MOST_LOADED = 4;

const Frontmatter = z.strictObject({
  name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().min(10).max(240),
  area: z.enum(SKILL_AREAS),
  tags: z.array(z.string()),
  version: z.int().positive(),
  /** Which tier the skill's work needs. */
  cost: z.enum(["small", "strong"]),
});
export type Skill = z.infer<typeof Frontmatter> & { body: string };

const FENCE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
const LINE = /^([a-z]+):\s*(.*)$/;

// The frontmatter is a few flat fields: no YAML parser for that.
function fieldValue(raw: string): unknown {
  if (raw.startsWith("[") && raw.endsWith("]")) {
    return raw
      .slice(1, -1)
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return /^\d+$/.test(raw) ? Number(raw) : raw;
}

export function parseSkill(text: string): Skill {
  const [, head, body] = FENCE.exec(text.replace(/\r\n/g, "\n")) ?? [];
  if (head === undefined || body === undefined) {
    throw new Error("a SKILL.md starts with its frontmatter between --- lines");
  }
  const fields = Object.fromEntries(
    head.split("\n").map((line) => {
      const [, key, value] = LINE.exec(line.trim()) ?? [];
      if (!key) {
        throw new Error(`not a field: ${line}`);
      }
      return [key, fieldValue((value ?? "").trim())];
    }),
  );
  return { ...Frontmatter.parse(fields), body: body.trim() };
}

/** The index the model always sees: for this step, each skill's name and when to use it. */
export function skillIndex(skills: readonly Skill[], step: StudioStep): string {
  const here = skills.filter((skill) => AREA_STEPS[skill.area].includes(step));
  if (here.length === 0) {
    return "";
  }
  return `\n\nSkills you can load with load_skill when the creator's words call for one (at most ${MOST_LOADED} at once):\n${here
    .map((skill) => `- ${skill.name}: ${skill.description}`)
    .join("\n")}`;
}

export function loadSkill(
  loaded: readonly string[],
  name: string,
  skills: readonly Skill[],
): { loaded: string[] } | { error: string } {
  if (!skills.some((skill) => skill.name === name)) {
    return { error: `There is no skill ${name}.` };
  }
  if (loaded.includes(name)) {
    return { loaded: [...loaded] };
  }
  return { loaded: [...loaded, name].slice(-MOST_LOADED) };
}

/** The loaded skills' full text, after the stable instructions. */
export function skillTail(loaded: readonly string[], skills: readonly Skill[]): string {
  const texts = loaded
    .map((name) => skills.find((skill) => skill.name === name))
    .filter((skill): skill is Skill => skill !== undefined)
    .map((skill) => `## Skill: ${skill.name}\n\n${skill.body}`);
  return texts.length > 0 ? `\n\n# Loaded skills\n\n${texts.join("\n\n")}` : "";
}

/** One golden moment of a conversation, and what the first answer must do (skills/README.md). */
export const SkillEval = z.strictObject({
  step: z.enum(["meet", "content", "plan", "build", "review", "page", "publish"]),
  conversation: z
    .array(z.strictObject({ role: z.enum(["user", "assistant"]), content: z.string().min(1) }))
    .min(1)
    .refine((messages) => messages.at(-1)?.role === "user", "It ends with the creator's words."),
  expect: z.strictObject({
    oneQuestion: z.boolean().optional(),
    mustNotContain: z.array(z.string().min(1)).optional(),
    mustMatchAny: z.array(z.string().min(1)).optional(),
    calls: z.array(z.string()).optional(),
    noCalls: z.array(z.string()).optional(),
  }),
});
export type SkillEval = z.infer<typeof SkillEval>;

/** The longest a skill's body may be: about 700 tokens. */
export const MOST_BODY_CHARS = 2_900;
