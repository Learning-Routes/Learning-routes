import { asText, isBlank, presence, strip } from "../../v1-import/loose-json";
import { isKnownScene, validateScene } from "../motion-scenes";
import { parseJson, splitJsonObject, stripClosingFence } from "../trailing-content";
import type { Section } from "./types";

const IMAGE = /!\[([^\]]*)\]\(([^)]+)\)/;
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * A concept, or a visual when the body holds a markdown image. Replaces v1
 * `LessonSectionParser#build_concept_or_visual`.
 */
export function conceptOrVisual(title: string | null, rawBody: string): Section {
  const body = strip(rawBody);
  const image = IMAGE.exec(body);
  const hasDiagram = body.includes("```mermaid");
  if (image)
    return { type: "visual", title, body, image_url: image[2], contains_diagram: hasDiagram };
  return hasDiagram
    ? { type: "concept", title, body, contains_diagram: true }
    : { type: "concept", title, body };
}

/**
 * `## Visual:`: the body is the image description the image is generated from.
 * Replaces v1 `LessonSectionParser#parse_heading_visual`.
 */
export function visual(title: string, body: string): Section {
  return {
    type: "visual",
    title: presence(title),
    alt_text: strip(title),
    body,
    image_description: presence(strip(body)),
    image_url: null,
    caption: null,
    contains_diagram: body.includes("```mermaid"),
  };
}

/**
 * `## Motion: <scene>` with a JSON body. Anything the scene's schema refuses
 * falls back to a concept carrying the narration: a fallback may show less, never
 * something false. Replaces v1 `LessonSectionParser#parse_heading_motion`.
 */
export function motion(sceneFromHeading: string, body: string): Section {
  const scene = strip(sceneFromHeading);
  const [json, remainder] = splitJsonObject(body);
  const payload = parseJson(json);
  const narration = isObject(payload) ? strip(asText(payload.narration)) : "";
  const valid =
    isObject(payload) &&
    !isBlank(narration) &&
    isKnownScene(scene) &&
    validateScene(scene, payload.data).length === 0;

  if (!valid) return { type: "concept", title: null, body: presence(narration) ?? strip(body) };
  return {
    type: "motion",
    scene,
    data: (payload as Record<string, unknown>).data,
    narration,
    aftermath: presence(strip(stripClosingFence(remainder))),
    body: strip(body),
  };
}

/**
 * `## Video:` with the JSON the studio's upload writes; anything unparsable falls
 * back to a concept carrying the title. Replaces v1 `LessonSectionParser#parse_heading_video`.
 */
export function video(titleFromHeading: string, body: string): Section {
  const [json, remainder] = splitJsonObject(body);
  const payload = parseJson(strip(json ?? ""));
  if (!isObject(payload) || !isPresentValue(payload.video_url)) {
    return { type: "concept", title: presence(titleFromHeading), body: strip(body) };
  }
  return {
    type: "video",
    title: presentOrNull(payload.title) ?? presence(titleFromHeading),
    video_url: payload.video_url,
    subtitles_url: presentOrNull(payload.subtitles_url),
    duration_seconds: payload.duration_seconds ?? null,
    source: payload.source ?? null,
    lesson_id: payload.lesson_id ?? null,
    voice: payload.voice ?? null,
    published_at: payload.published_at ?? null,
    aftermath: presence(strip(remainder)),
    body: strip(body),
  };
}

// v1 `present?` on a JSON value: nil, false, blank strings and empty collections are absent.
function isPresentValue(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === "string") return !isBlank(value);
  if (Array.isArray(value)) return value.length > 0;
  if (isObject(value)) return Object.keys(value).length > 0;
  return true;
}

function presentOrNull(value: unknown): unknown {
  return isPresentValue(value) ? value : null;
}
