import { STUDIO_PROMPT } from "../studio/prompt";
import { estimateInputTokens } from "./gate";
import { isAllowedModel } from "./models";

// Every prompt the platform sends, with the model it runs on and the input it may
// cost. A test holds each to ai/models.ts and to its budget (STEP 46 §2.7).

export interface PromptTemplate {
  name: string;
  model: string;
  maxTokens: number;
  promptCache: boolean;
  /** The most input tokens the system prompt may take, at 4 characters a token. */
  inputTokenBudget: number;
  system: string;
}

export const TEMPLATES: readonly PromptTemplate[] = [
  {
    // Student-facing, so the cheapest model in the table (WORKING_AGREEMENT.md).
    name: "explain-answer",
    model: "openai/gpt-5-nano",
    maxTokens: 300,
    promptCache: false,
    inputTokenBudget: 120,
    system:
      "You help a student who answered a practice question wrongly. Reply in the student's language, in at most three short sentences. Name the idea they missed, then give a hint toward the right answer without stating it.",
  },
  {
    // The creator's assistant (Platform STEP 10): the cheap tier talks, the strong one plans and
    // writes (studio/turn.ts). maxTokens is the cheap tier's; the strong tier's is in the agent.
    name: "studio",
    model: "anthropic/claude-haiku-5.5",
    maxTokens: 1_200,
    promptCache: true,
    inputTokenBudget: 800,
    system: STUDIO_PROMPT,
  },
];

/** New: what is wrong with a template; [] when nothing is. */
export function templateProblems(template: PromptTemplate): string[] {
  const problems: string[] = [];
  if (!isAllowedModel(template.model)) {
    problems.push(`${template.name}: ${template.model} is not in ai/models.ts`);
  }
  const tokens = estimateInputTokens(template.system);
  if (tokens > template.inputTokenBudget) {
    problems.push(
      `${template.name}: about ${tokens} input tokens, over its budget of ${template.inputTokenBudget}`,
    );
  }
  return problems;
}
