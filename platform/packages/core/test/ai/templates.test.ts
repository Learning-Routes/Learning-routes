import { describe, expect, it } from "vitest";
import { TEMPLATES, templateProblems } from "../../src/ai/templates";

describe("prompt templates", () => {
  it.each(TEMPLATES.map((t) => [t.name, t] as const))(
    "%s names an allowed model and fits its budget",
    (_, template) => {
      expect(templateProblems(template)).toEqual([]);
    },
  );

  it("catches a model missing from the table and a prompt over its budget", () => {
    const [template] = TEMPLATES;
    if (!template) throw new Error("no templates");
    expect(templateProblems({ ...template, model: "openai/gpt-4o" })).toEqual([
      `${template.name}: openai/gpt-4o is not in ai/models.ts`,
    ]);
    expect(templateProblems({ ...template, inputTokenBudget: 1 })[0]).toMatch(
      new RegExp(`^${template.name}: about \\d+ input tokens, over its budget of 1$`),
    );
  });
});
