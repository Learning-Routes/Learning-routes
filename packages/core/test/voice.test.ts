import { describe, expect, it } from "vitest";
import { VOICE_FILE, voicedPhrases, voicePath, voiceText } from "../src/voice";

describe("recorded voice", () => {
  it("gives a phrase one address however it was typed, and another per language", async () => {
    const path = await voicePath("en-US", "Hi! Good morning.");
    expect(path).toMatch(VOICE_FILE);
    expect(await voicePath(" EN-us ", "  Hi!   Good morning. ")).toBe(path);
    expect(await voicePath("en-GB", "Hi! Good morning.")).not.toBe(path);
    expect(await voicePath("en-US", "Hi! Good morning")).not.toBe(path);
    expect(voiceText("en-US", "caf\u0065\u0301")).toBe(voiceText("en-US", "caf\u00e9"));
  });

  it("finds what a route says aloud: speaking beats and a conversation's lines, each once", () => {
    const blocks = [
      { kind: "concept", data: { body: "Not said aloud." } },
      { kind: "speak", data: { lang: "en-US", phrase: "Hi! Good morning." } },
      { kind: "speak", data: { lang: "en-US", phrase: "Hi!  Good morning." } },
      { kind: "speak", data: { lang: "", phrase: "No language, no voice." } },
      {
        kind: "sim",
        data: {
          sim: {
            kind: "roleplay",
            lang: "en-US",
            turns: [
              { line: "What's your name?", choices: [{ text: "I'm Lucía.", reply: "Nice!" }] },
              { line: "Hi! Good morning.", choices: [] },
            ],
          },
        },
      },
      { kind: "sim", data: { sim: { kind: "piano_chord", lang: "en-US" } } },
    ];
    expect(voicedPhrases(blocks)).toEqual([
      { lang: "en-US", text: "Hi! Good morning." },
      { lang: "en-US", text: "What's your name?" },
    ]);
  });
});
