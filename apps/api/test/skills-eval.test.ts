import { describe, expect, it } from "vitest";
import { problemsOf } from "../scripts/skills-eval";

const golden = (expectations: object) => ({
  step: "meet" as const,
  conversation: [{ role: "user" as const, content: "Quiero mi app" }],
  expect: expectations,
});
const ask = (question: string) => ({
  function: {
    name: "ask_creator",
    arguments: JSON.stringify({ question, is_fork: false, options: [] }),
  },
});

describe("the skills' eval checks", () => {
  it("pass an answer that asks one question and says nothing it was not given", () => {
    const answer = { content: "¡Hola!", toolCalls: [ask("¿Cómo te llamas?")] };
    expect(
      problemsOf(
        golden({
          oneQuestion: true,
          mustNotContain: ["Juan"],
          mustMatchAny: ["llamas"],
          calls: ["ask_creator"],
        }),
        answer,
      ),
    ).toEqual([]);
  });

  it("read what the page shows: a question in the words gives way to the one asked", () => {
    const asked = { content: "¿Qué enseñas?", toolCalls: [ask("¿Cómo te llamas?")] };
    expect(problemsOf(golden({ oneQuestion: true }), asked)).toEqual([]);
    const twice = { content: "¿Qué enseñas? ¿Para quién?", toolCalls: [] };
    expect(problemsOf(golden({ oneQuestion: true }), twice)).toEqual(["asked more than one question"]);
  });

  it("catch invented content in the words or in a tool call's arguments", () => {
    const answer = {
      content: "",
      toolCalls: [
        { function: { name: "create_route", arguments: '{"title":{"es":"Curso de Juan"}}' } },
      ],
    };
    expect(
      problemsOf(golden({ mustNotContain: ["juan"], noCalls: ["create_route"] }), answer),
    ).toEqual(['said "juan", which the creator never gave', "called create_route"]);
  });

  it("need at least one expected pattern, and every expected call", () => {
    const answer = { content: "Vale.", toolCalls: [] };
    expect(
      problemsOf(golden({ mustMatchAny: ["nombre", "llamas"], calls: ["ask_creator"] }), answer),
    ).toEqual(["matched none of nombre | llamas", "did not call ask_creator"]);
  });
});
