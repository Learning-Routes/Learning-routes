import { describe, expect, it } from "vitest";
import { bestOf, compare, wordsOf } from "../app/player/speech-check";

describe("speech check (Platform STEP 13)", () => {
  it("reads contractions as their long form and drops punctuation and case", () => {
    expect(wordsOf("Hi, I'm Ana. What's your name?")).toEqual([
      "hi",
      "i",
      "am",
      "ana",
      "what",
      "is",
      "your",
      "name",
    ]);
  });

  it("passes the phrase said back, contracted or not", () => {
    expect(compare("Hi, I'm Ana. What's your name?", "hi I'm Ana what's your name").passed).toBe(
      true,
    );
    expect(compare("Hi, I'm Ana. What's your name?", "hi I am Ana what is your name").passed).toBe(
      true,
    );
  });

  it("fails something else entirely, and marks which words were missed", () => {
    const heard = compare("Hi, I'm Ana. What's your name?", "hola soy boludo y me lo contó");
    expect(heard.passed).toBe(false);
    expect(heard.score).toBe(0);
    expect(heard.hit.every((h) => !h)).toBe(true);
  });

  it("marks only the word that was missed", () => {
    const heard = compare("I wake up at seven", "I wake up at eleven");
    expect(heard.hit).toEqual([true, true, true, true, false]);
    expect(heard.passed).toBe(true);
  });

  it("does not count words said out of order", () => {
    expect(compare("Where are you from?", "from you are where").passed).toBe(false);
  });

  it("keeps the best of the recognizer's guesses", () => {
    const best = bestOf("See you on Friday!", ["see you un fried egg", "see you on Friday"]);
    expect(best.heard).toBe("see you on Friday");
    expect(best.result.passed).toBe(true);
  });
});
