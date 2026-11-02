import { describe, expect, it } from "vitest";
import { dark, light } from "../tokens";

// WCAG AA for every text-on-surface pair the components use (Platform STEP 3 §2.1).
// A failing pair fails the build: fix the token, not this list.

const BODY = 4.5;
const LARGE = 3;
const WHITE: Rgb = [255, 255, 255];

type Rgb = [number, number, number];
type Pair = [text: string, surface: string, min: number, over?: string];

const HEX = /^#[0-9a-f]{6}$/i;
const RGBA = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/;

function solid(value: string): Rgb {
  if (!HEX.test(value)) {
    throw new Error(`not a solid colour: ${value}`);
  }
  return [1, 3, 5].map((start) => Number.parseInt(value.slice(start, start + 2), 16)) as Rgb;
}

/** A token's colour, a translucent one composited over what it sits on. */
function paint(value: string, under: Rgb): Rgb {
  const match = value.match(RGBA);
  if (!match) {
    return solid(value);
  }
  const alpha = Number(match[4]);
  return under.map((channel, i) => Number(match[i + 1]) * alpha + channel * (1 - alpha)) as Rgb;
}

function luminance(colour: Rgb): number {
  const [r, g, b] = colour.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const PAIRS: Pair[] = [
  ["--color-txt", "--color-bg", BODY],
  ["--color-txt", "--color-card", BODY],
  ["--color-txt", "--color-bg-2", BODY],
  ["--color-sub", "--color-bg", BODY],
  ["--color-sub", "--color-card", BODY],
  ["--color-sub", "--color-bg-2", BODY],
  ["--color-muted", "--color-bg", BODY],
  ["--color-muted", "--color-card", BODY],
  ["--color-link", "--color-bg", BODY],
  ["--color-link", "--color-card", BODY],
  ["--color-accent-text", "--color-accent", BODY],
  ["--color-accent-text", "--color-accent-hover", BODY],
  ["--color-accent-strong", "--color-accent-soft", BODY],
  ["--color-signal-text", "--color-bg", BODY],
  ["--color-signal-text", "--color-card", BODY],
  ["--color-reinforce", "--color-bg", BODY],
  ["--color-reinforce", "--color-card", BODY],
  ["--color-positive", "--color-positive-bg", BODY, "--color-card"],
  ["--color-negative", "--color-negative-bg", BODY, "--color-card"],
  ["--color-info", "--color-info-bg", BODY, "--color-card"],
  ["--color-positive", "--color-positive-bg", BODY, "--color-bg"],
  ["--color-negative", "--color-negative-bg", BODY, "--color-bg"],
  ["--color-info", "--color-info-bg", BODY, "--color-bg"],
  ["--color-negative", "--color-card", BODY],
  // Large display text.
  ["--color-txt", "--color-bg", LARGE],
  // Not text, but what shows a control is there (WCAG 1.4.11).
  ["--color-field-border", "--color-card", LARGE],
  ["--color-field-border", "--color-bg", LARGE],
  ["--color-accent", "--color-bg", LARGE],
  ["--color-accent", "--color-card", LARGE],
];

describe.each([
  ["light", light as Record<string, string>],
  ["dark", { ...light, ...dark } as Record<string, string>],
])("contrast, %s theme", (_theme, tokens) => {
  it.each(PAIRS)("%s on %s is at least %d:1", (text, surface, min, over) => {
    const value = (name: string) => tokens[name] as string;
    const base = over ? paint(value(over), WHITE) : WHITE;
    const ground = paint(value(surface), base);
    expect(contrast(paint(value(text), ground), ground)).toBeGreaterThanOrEqual(min);
  });
});
