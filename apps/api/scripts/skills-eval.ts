// The skills' evals (Platform STEP 10 §3): each golden moment in skills/*/*/evals/*.json goes to the
// cheap tier with the assistant's instructions and its skill loaded, through the one AI gate and its
// adapter, and the first answer is checked (skills/README.md). Nightly in CI, not on every PR.
//
//   OPENROUTER_API_KEY=… pnpm skills:eval [skill-name …]
//
// A run never spends more than RUN_CAP: past it the rest is skipped, and the run fails.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gate } from "@learning-routes/core/ai/gate";
import { V1_LIMITS } from "@learning-routes/core/credits/spend";
import { STUDIO_PROMPT, studioContext } from "@learning-routes/core/studio/prompt";
import { SKILLS } from "@learning-routes/core/studio/skill-library";
import { SkillEval, skillIndex, skillTail } from "@learning-routes/core/studio/skills";
import { STUDIO_TOOLS } from "@learning-routes/core/studio/studio-tools";
import { CONTENT_MODEL_TOOLS } from "../src/agent/content-tools";
import { streamFromOpenRouter } from "../src/ai/openrouter";

const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../skills");
const MODEL = "anthropic/claude-haiku-5.5";
/** A whole run, in microcents: $1. */
const RUN_CAP = 1_000_000;
const SPACE = "00000000-0000-7000-8000-000000000000";

interface Answer {
  content: string;
  toolCalls: { function: { name: string; arguments: string } }[];
}

/** What the creator would read: the message and every question asked. */
function visibleOf(answer: Answer): string {
  const asked = answer.toolCalls
    .filter((call) => call.function.name === "ask_creator")
    .map((call) => {
      try {
        return String((JSON.parse(call.function.arguments) as { question?: string }).question ?? "");
      } catch {
        return "";
      }
    });
  return [answer.content, ...asked].join(" ");
}

/** What is wrong with an answer; [] when it passes. */
export function problemsOf(golden: SkillEval, answer: Answer): string[] {
  const { expect } = golden;
  const visible = visibleOf(answer);
  const everything = `${visible} ${answer.toolCalls.map((call) => call.function.arguments).join(" ")}`;
  const lower = everything.toLowerCase();
  const called = answer.toolCalls.map((call) => call.function.name);
  const problems: string[] = [];
  if (expect.oneQuestion && (visible.match(/\?/g) ?? []).length > 1) {
    problems.push("asked more than one question");
  }
  for (const text of expect.mustNotContain ?? []) {
    if (lower.includes(text.toLowerCase())) {
      problems.push(`said "${text}", which the creator never gave`);
    }
  }
  const patterns = expect.mustMatchAny ?? [];
  if (patterns.length > 0 && !patterns.some((pattern) => new RegExp(pattern, "i").test(everything))) {
    problems.push(`matched none of ${patterns.join(" | ")}`);
  }
  for (const name of expect.calls ?? []) {
    if (!called.includes(name)) {
      problems.push(`did not call ${name}`);
    }
  }
  for (const name of expect.noCalls ?? []) {
    if (called.includes(name)) {
      problems.push(`called ${name}`);
    }
  }
  return problems;
}

function goldenMoments(only: string[]) {
  return SKILLS.filter((skill) => only.length === 0 || only.includes(skill.name)).flatMap((skill) => {
    const folder = join(SKILLS_DIR, skill.area, skill.name, "evals");
    return readdirSync(folder)
      .filter((file) => file.endsWith(".json"))
      .map((file) => ({
        skill,
        file,
        golden: SkillEval.parse(JSON.parse(readFileSync(join(folder, file), "utf8"))),
      }));
  });
}

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  let spent = 0;
  let failed = 0;
  const moments = goldenMoments(process.argv.slice(2));
  for (const { skill, file, golden } of moments) {
    const name = `${skill.name}/${file}`;
    const decision = gate(
      {
        model: MODEL,
        maxTokens: 1_200,
        promptCache: true,
        sessionId: `skills-eval-${skill.name}`,
        system:
          STUDIO_PROMPT +
          studioContext({ spaceId: SPACE, locale: "es" }) +
          skillIndex(SKILLS, golden.step) +
          skillTail([skill.name], SKILLS),
        messages: golden.conversation,
        tools: [...STUDIO_TOOLS, ...CONTENT_MODEL_TOOLS],
        stream: true,
      },
      {
        limits: { ...V1_LIMITS, dailyMicrocents: RUN_CAP, ratePerMinute: null },
        spend: { globalToday: spent, userToday: null },
        consumedAt: [],
        now: Date.now(),
      },
    );
    if (decision.verdict === "refused") {
      failed += 1;
      console.log(`skip  ${name}: ${decision.reason}`);
      continue;
    }
    const answer = await streamFromOpenRouter(decision, apiKey, () => undefined);
    const cost = answer.usage?.cost;
    spent += cost?.kind === "known" ? cost.microcents : decision.estimateMicrocents;
    const problems = answer.ok ? problemsOf(golden, answer) : [`the call failed: ${answer.status}`];
    failed += problems.length > 0 ? 1 : 0;
    console.log(`${problems.length > 0 ? "FAIL" : "ok  "}  ${name}${problems.length > 0 ? `: ${problems.join("; ")}` : ""}`);
  }
  console.log(`\n${moments.length - failed} of ${moments.length} passed, for $${(spent / 1_000_000).toFixed(4)}`);
  process.exitCode = failed > 0 ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
