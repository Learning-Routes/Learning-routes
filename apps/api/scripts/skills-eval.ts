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
import { askText, STUDIO_TOOLS } from "@learning-routes/core/studio/studio-tools";
import { CONTENT_MODEL_TOOLS } from "../src/agent/content-tools";
import { streamFromOpenRouter } from "../src/ai/openrouter";

const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../skills");
const MODEL = "anthropic/claude-haiku-5.5";
/** A whole run, in microcents: $1. */
const RUN_CAP = 1_000_000;
const SPACE = "00000000-0000-7000-8000-000000000000";

interface Answer {
  content: string;
  toolCalls: { id: string; type: "function"; function: { name: string; arguments: string } }[];
}
/** What a check reads of an answer. */
interface Seen {
  content: string;
  toolCalls: { function: { name: string; arguments: string } }[];
}

/** What the creator would read: the page shows the words with the question asked, as askText puts them. */
function visibleOf(answer: Seen): string {
  const asked = answer.toolCalls
    .filter((call) => call.function.name === "ask_creator")
    .map((call) => {
      try {
        return String(
          (JSON.parse(call.function.arguments) as { question?: string }).question ?? "",
        );
      } catch {
        return "";
      }
    });
  // Two asks in one answer: the second would be refused by the turn, but the creator would read both.
  return asked.length === 0
    ? answer.content
    : [askText(answer.content, asked[0] ?? ""), ...asked.slice(1)].join(" ");
}

const QUESTION = /\?/g;

/** What is wrong with an answer; [] when it passes. */
export function problemsOf(golden: SkillEval, answer: Seen): string[] {
  const { expect } = golden;
  const visible = visibleOf(answer);
  const everything = `${visible} ${answer.toolCalls.map((call) => call.function.arguments).join(" ")}`;
  const called = answer.toolCalls.map((call) => call.function.name);
  const patterns = expect.mustMatchAny ?? [];
  return [
    expect.oneQuestion === true && (visible.match(QUESTION) ?? []).length > 1
      ? "asked more than one question"
      : null,
    ...(expect.mustNotContain ?? [])
      .filter((text) => everything.toLowerCase().includes(text.toLowerCase()))
      .map((text) => `said "${text}", which the creator never gave`),
    patterns.length > 0 && !patterns.some((pattern) => new RegExp(pattern, "i").test(everything))
      ? `matched none of ${patterns.join(" | ")}`
      : null,
    ...(expect.calls ?? [])
      .filter((name) => !called.includes(name))
      .map((name) => `did not call ${name}`),
    ...(expect.noCalls ?? [])
      .filter((name) => called.includes(name))
      .map((name) => `called ${name}`),
  ].filter((problem): problem is string => problem !== null);
}

function goldenMoments(only: string[]) {
  return SKILLS.filter((skill) => only.length === 0 || only.includes(skill.name)).flatMap(
    (skill) => {
      const folder = join(SKILLS_DIR, skill.area, skill.name, "evals");
      return readdirSync(folder)
        .filter((file) => file.endsWith(".json"))
        .map((file) => ({
          skill,
          file,
          golden: SkillEval.parse(JSON.parse(readFileSync(join(folder, file), "utf8"))),
        }));
    },
  );
}

// Tools that only read or set up: the turn goes on after them, so the eval does too, with stand-in answers.
const SILENT: Record<string, string> = {
  load_skill: "Loaded: it now follows your instructions.",
  set_step: "The step is changed.",
  list_routes: '{"routes":[]}',
  get_route: "not_found: there is no such thing in your spaces.",
  get_route_format: "Blocks are concept, check, example, tip, summary, cards and interactive.",
};
/** Model calls one golden moment may take before the creator would see an answer. */
const MOST_CALLS = 4;
type Messages = Parameters<typeof gate>[0]["messages"];

/**
 * The answer the creator would see, as the turn reaches it: past the silent tools, each answered
 * with a stand-in. Every call made on the way counts toward calls and noCalls.
 */
async function answerOf(
  golden: SkillEval,
  system: string,
  sessionId: string,
  apiKey: string,
  spent: { total: number },
) {
  const messages: Messages = [...golden.conversation];
  const made: Answer["toolCalls"] = [];
  for (let calls = 0; calls < MOST_CALLS; calls += 1) {
    const decision = gate(
      {
        model: MODEL,
        maxTokens: 1_200,
        promptCache: true,
        sessionId,
        system,
        messages,
        tools: [...STUDIO_TOOLS, ...CONTENT_MODEL_TOOLS],
        stream: true,
      },
      {
        limits: { ...V1_LIMITS, dailyMicrocents: RUN_CAP, ratePerMinute: null },
        spend: { globalToday: spent.total, userToday: null },
        consumedAt: [],
        now: Date.now(),
      },
    );
    if (decision.verdict === "refused") {
      return { error: decision.reason };
    }
    const answer = await streamFromOpenRouter(decision, apiKey, () => undefined);
    const cost = answer.usage?.cost;
    spent.total += cost?.kind === "known" ? cost.microcents : decision.estimateMicrocents;
    if (!answer.ok) {
      return { error: `the call failed: ${answer.status}` };
    }
    made.push(...answer.toolCalls);
    const silent =
      answer.toolCalls.length > 0 && answer.toolCalls.every((call) => call.function.name in SILENT);
    if (!silent || answer.content) {
      return { answer: { content: answer.content, toolCalls: made } };
    }
    messages.push({ role: "assistant", content: "", tool_calls: answer.toolCalls });
    for (const call of answer.toolCalls) {
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: SILENT[call.function.name] ?? "",
      });
    }
  }
  return { error: "no answer after the silent tools" };
}

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  const spent = { total: 0 };
  let failed = 0;
  const moments = goldenMoments(process.argv.slice(2));
  for (const { skill, file, golden } of moments) {
    const name = `${skill.name}/${file}`;
    const system =
      STUDIO_PROMPT +
      studioContext({ spaceId: SPACE, locale: "es" }) +
      skillIndex(SKILLS, golden.step) +
      skillTail([skill.name], SKILLS);
    const result = await answerOf(golden, system, `skills-eval-${skill.name}`, apiKey, spent);
    const problems = result.answer ? problemsOf(golden, result.answer) : [result.error];
    failed += problems.length > 0 ? 1 : 0;
    const called = result.answer?.toolCalls.map((call) => call.function.name).join(",") ?? "";
    console.log(
      `${problems.length > 0 ? "FAIL" : "ok  "}  ${name}${problems.length > 0 ? `: ${problems.join("; ")} [called: ${called || "nothing"}]` : ""}`,
    );
  }
  console.log(
    `\n${moments.length - failed} of ${moments.length} passed, for $${(spent.total / 1_000_000).toFixed(4)}`,
  );
  process.exitCode = failed > 0 ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
