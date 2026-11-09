import { describe, expect, it } from "vitest";
import { askText, readStudioCall, STUDIO_TOOLS } from "../../src/studio/studio-tools";

const call = (name: string, args: unknown) => readStudioCall(name, JSON.stringify(args));

describe("the assistant's own tools", () => {
  it("are described to the model as functions with a JSON schema", () => {
    expect(STUDIO_TOOLS.map((tool) => tool.function.name)).toEqual([
      "ask_creator",
      "set_step",
      "show_lesson",
      "ask_to_publish",
    ]);
    for (const tool of STUDIO_TOOLS) {
      expect(tool.function.parameters).toMatchObject({ type: "object" });
    }
  });

  it("turn one question with its answers into the page's choices, keeping each decision short", () => {
    const read = call("ask_creator", {
      question: "¿Para quién es?",
      is_fork: true,
      options: [
        { label: "Colegio", decision: "Para colegio" },
        { label: "Universidad", decision: "Para universidad" },
      ],
    });
    expect(read).toEqual({
      ok: true,
      call: {
        name: "ask_creator",
        question: "¿Para quién es?",
        isFork: true,
        options: [
          { id: "o1", label: "Colegio", decision: "Para colegio" },
          { id: "o2", label: "Universidad", decision: "Para universidad" },
        ],
      },
    });
  });

  it("refuse more than one question, too many answers, or a fork without decisions", () => {
    const options = [{ label: "Sí" }, { label: "No" }];
    expect(call("ask_creator", { question: "¿A? ¿B?", is_fork: false, options }).ok).toBe(false);
    expect(
      call("ask_creator", {
        question: "¿Cuál?",
        is_fork: false,
        options: ["a", "b", "c", "d", "e"].map((label) => ({ label })),
      }).ok,
    ).toBe(false);
    expect(call("ask_creator", { question: "¿Cuál?", is_fork: true, options }).ok).toBe(false);
  });

  it("let an open question, like a name, come with no answers to tap; a fork needs two or more", () => {
    expect(
      call("ask_creator", { question: "¿Cómo te llamas?", is_fork: false, options: [] }),
    ).toEqual({
      ok: true,
      call: { name: "ask_creator", question: "¿Cómo te llamas?", isFork: false, options: [] },
    });
    expect(
      call("ask_creator", {
        question: "¿Para quién?",
        is_fork: true,
        options: [{ label: "Colegio", decision: "Para colegio" }],
      }).ok,
    ).toBe(false);
  });

  it("know only the guided steps, and ids that look like ids", () => {
    expect(call("set_step", { step: "plan" })).toEqual({
      ok: true,
      call: { name: "set_step", step: "plan" },
    });
    expect(call("set_step", { step: "hack" }).ok).toBe(false);
    expect(call("show_lesson", { route_id: "x", lesson_id: "y" }).ok).toBe(false);
  });

  it("answer a broken or unknown call with words the model can act on", () => {
    expect(readStudioCall("ask_creator", "{not json")).toEqual({
      ok: false,
      error: "The arguments are not valid JSON.",
    });
    expect(call("publish_route", {})).toEqual({
      ok: false,
      error: "There is no tool publish_route.",
    });
  });
});

describe("what the page shows with a question", () => {
  it("is the assistant's words, then the question, never the question twice", () => {
    expect(askText("", "¿Cómo te llamas?")).toBe("¿Cómo te llamas?");
    expect(askText("¡Hola!", "¿Cómo te llamas?")).toBe("¡Hola! ¿Cómo te llamas?");
    expect(askText("¡Hola! ¿Cómo te llamas?", "¿Cómo te llamas?")).toBe("¡Hola! ¿Cómo te llamas?");
  });
});
