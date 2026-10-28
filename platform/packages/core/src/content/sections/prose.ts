import { presence, strip } from "../../v1-import/loose-json";
import { lines, WS } from "../ruby-text";
import { conceptOrVisual } from "./media";
import type { Section } from "./types";

const BULLET = new RegExp(`^[-*]${WS}`);
const BULLET_PREFIX = new RegExp(`^[-*]${WS}+`);
const KEY_POINTS_LABEL = new RegExp(`^(?:PUNTOS CLAVE|KEY POINTS):${WS}*`, "i");
const KEY_POINTS_LINE = /^(?:PUNTOS CLAVE|KEY POINTS):/i;

const withTitleLine = (titleLine: string, body: string) =>
  presence(titleLine) === null ? body : `${titleLine}\n${body}`;

function bullets(text: string): string[] {
  return lines(text)
    .filter((line) => BULLET.test(strip(line)))
    .map((line) => strip(line).replace(BULLET_PREFIX, ""));
}

/** `:::concept`: the first line is the title. Replaces v1 `parse_concept_block`. */
export function fencedConcept(titleLine: string, body: string, untitled: string): Section {
  return conceptOrVisual(presence(titleLine) === null ? untitled : titleLine, body);
}

/** `:::example` and `:::tip`: the whole text is the body. Replaces v1 `parse_example_block` and `parse_tip_block`. */
export function fencedProse(type: "example" | "tip", titleLine: string, body: string): Section {
  return { type, title: null, body: strip(withTitleLine(titleLine, body)) };
}

/** `:::summary`: bullet lines are key points, the rest is the body. Replaces v1 `parse_summary_block`. */
export function fencedSummary(titleLine: string, body: string): Section {
  const text = withTitleLine(titleLine, body);
  const remaining = strip(
    lines(text)
      .filter((line) => !BULLET.test(strip(line)))
      .join(""),
  );
  return { type: "summary", title: null, key_points: bullets(text), body: presence(remaining) };
}

/** `## Resumen:` / `## Summary:`, with an optional PUNTOS CLAVE label. Replaces v1 `parse_heading_summary`. */
export function headingSummary(title: string, body: string): Section {
  const text = strip(body).replace(KEY_POINTS_LABEL, "");
  const remaining = strip(
    lines(text)
      .filter((line) => !BULLET.test(strip(line)) && !KEY_POINTS_LINE.test(strip(line)))
      .join(""),
  );
  return {
    type: "summary",
    title: presence(title),
    key_points: bullets(text),
    body: presence(remaining),
  };
}
