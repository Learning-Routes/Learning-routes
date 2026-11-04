import { expect, test } from "vitest";
import { activePanel, leadPath, storyTime, tokenProgress } from "../app/enhance/stage/story";

const WEIGHTS = [1, 2];
const FROM_THE_HEADLINE = /^M222 20C/;
const BELOW_THE_TEXT = /^M90 118C/;
const ABOVE_THE_TEXT = /^M100 -18C/;
const LEFT_OF_THE_TEXT = /^M-22 20C/;

test("the scroll maps to a panel and the progress within it", () => {
  expect(storyTime(-1, WEIGHTS)).toBe(0);
  expect(storyTime(0.5, WEIGHTS)).toBe(0.5);
  expect(storyTime(2, WEIGHTS)).toBe(1.5);
  expect(storyTime(9, WEIGHTS)).toBeCloseTo(2 - 0.001);
});

test("a panel's text hides while the camera moves, and the last panel's stays", () => {
  expect(activePanel(0.5, true, 6)).toBe(0);
  expect(activePanel(0.9, true, 6)).toBe(-1);
  expect(activePanel(2.5, true, 6)).toBe(2);
  expect(activePanel(2.9, true, 6)).toBe(-1);
  expect(activePanel(5.95, true, 6)).toBe(5);
  expect(activePanel(2.5, false, 6)).toBe(-1);
});

test("the pin waits, walks, and rests at the end of its itinerary", () => {
  expect(tokenProgress(0.5)).toBe(0);
  expect(tokenProgress(1)).toBe(0);
  expect(tokenProgress(1.99)).toBeCloseTo(2);
  expect(tokenProgress(3.8)).toBe(9);
  expect(tokenProgress(4.5)).toBe(9);
});

test("the text's line leaves from the side nearest what it explains", () => {
  const text = { width: 300, height: 100, headlineWidth: 200, headlineMiddle: 20 };
  expect(leadPath(text, 400, 50)).toMatch(FROM_THE_HEADLINE);
  expect(leadPath(text, 100, 300)).toMatch(BELOW_THE_TEXT);
  expect(leadPath(text, 100, -200)).toMatch(ABOVE_THE_TEXT);
  expect(leadPath(text, -100, 50)).toMatch(LEFT_OF_THE_TEXT);
});
