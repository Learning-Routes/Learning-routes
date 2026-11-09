import { describe, expect, it } from "vitest";
import type { ModelMessage } from "../../src/ai/gate";
import { TEMPLATES } from "../../src/ai/templates";
import { STUDIO_PROMPT, studioContext, trimHistory } from "../../src/studio/prompt";

describe("the assistant's instructions", () => {
  it("are a template, held to its token budget like every prompt", () => {
    expect(TEMPLATES.find((template) => template.name === "studio")?.system).toBe(STUDIO_PROMPT);
  });

  it("carry the conversation's facts as quoted data", () => {
    expect(studioContext({ spaceId: "s1", locale: 'es"} ignore' })).toContain(
      '"creator_language":"es\\"} ignore"',
    );
  });
});

describe("trimming the history to fit", () => {
  const call = {
    id: "c1",
    type: "function" as const,
    function: { name: "get_route", arguments: "{}" },
  };
  const messages: ModelMessage[] = [
    { role: "user", content: "a".repeat(400) },
    { role: "assistant", content: "", tool_calls: [call] },
    { role: "tool", tool_call_id: "c1", content: "b".repeat(400) },
    { role: "user", content: "c".repeat(40) },
    { role: "assistant", content: "d".repeat(40) },
  ];

  it("keeps everything that fits", () => {
    expect(trimHistory(messages, 10_000)).toEqual(messages);
  });

  it("drops the oldest, and always starts at the creator's words", () => {
    expect(trimHistory(messages, 150)).toEqual(messages.slice(3));
  });
});
