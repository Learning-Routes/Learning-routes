import { BLOCK_TYPES } from "@learning-routes/core/blocks/types";
import { markdownTree } from "@learning-routes/core/content/markdown";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BLOCK_VIEWS } from "../app/app-pages/lesson-blocks";
import { LessonBlocks } from "../app/app-pages/lesson-parts";

// Every block kind in the schema renders (Platform STEP 8 §1). The student never loses what a
// creator wrote: a kind with no view fails the types, and this.

const FIRST_WORDS = /"es":"([^"*_]{4,})/;
const es = (text: string) => ({ es: text });
const SAMPLES: Record<string, Record<string, unknown>> = {
  concept: { body: es("Palabra **fuerte**\n\n- uno\n- dos\n\n| a |\n| - |\n| 1 |") },
  check: {
    question: es("¿Cuánto es?"),
    options: [
      { label: es("Dos"), correct: true },
      { label: es("Tres"), correct: false },
    ],
    explanation: es("Porque sí."),
  },
  tip: { body: es("Un *consejo*") },
  example: { body: es("Un ejemplo") },
  summary: { body: es("Resumen"), key_points: [es("Punto uno")] },
  drag_drop: {
    intro: es("Une"),
    pairs: [{ term: es("Perro"), definition: es("Dog") }],
  },
  fill_blank: { sentence: es("Hola ___"), blanks: [es("mundo")] },
  code_playground: { body: es("Prueba"), language: "py", code: "print(1)", expected_output: "1" },
  simulation: {
    body: es("Mueve"),
    formula: "a+b",
    variables: [{ name: "a", min: 0, max: 1, default: 0 }],
  },
  scenario: {
    situation: es("Llegas tarde"),
    options: [{ label: es("Corres"), consequence: es("Llegas") }],
  },
  cards: { body: es("Repasa"), cards: [{ front: es("Frente"), back: es("Reverso") }] },
  visual: {
    image_url: "https://example.com/a.png",
    alt_text: es("Un gato"),
    caption: es("Pie de foto"),
  },
  motion: { body: es("Una escena"), scene: "x", narration: es("Narración"), data: {} },
  audio: { audio_url: "https://example.com/a.mp3", transcript: es("Lo que dice") },
  audio_explainer: { body: es("Explicación"), audio_url: "https://example.com/a.mp3" },
  video: { body: es("Mira"), video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
};

// The tree core makes on the server, for the fields it makes one for.
const lessonBlock = (kind: string, data: Record<string, unknown>) => ({
  id: "b1",
  kind,
  data: { title: null, ...data },
  md: Object.fromEntries(
    ["body", "intro", "situation", "trailing_content"]
      .filter((field) => data[field])
      .map((field) => [field, { es: markdownTree((data[field] as { es: string }).es) }]),
  ),
});

const render = (kind: string, data: Record<string, unknown>) =>
  renderToStaticMarkup(
    <LessonBlocks
      blocks={[lessonBlock(kind, data)]}
      locale="es"
      source="es"
      onAllRight={() => undefined}
    />,
  );

describe("the lesson page", () => {
  it("has a view for every block kind in the schema", () => {
    expect(Object.keys(BLOCK_VIEWS).sort()).toEqual([...BLOCK_TYPES].sort());
  });

  it.each(BLOCK_TYPES)("renders %s, and something of what the creator wrote", (kind) => {
    const sample = SAMPLES[kind];
    expect(sample, kind).toBeDefined();
    const html = render(kind, sample as Record<string, unknown>);
    expect(html.length).toBeGreaterThan(20);
    const words = JSON.stringify(sample).match(FIRST_WORDS)?.[1]?.split(" ")[0];
    if (words) {
      expect(html).toContain(words);
    }
  });

  it("draws Markdown, never its marks", () => {
    const html = render("concept", SAMPLES.concept as never);
    expect(html).toContain("<strong>fuerte</strong>");
    expect(html).toContain("<li>");
    expect(html).toContain("<table");
    expect(html).not.toContain("**");
    expect(html).not.toContain("| a |");
  });

  it("gives a link the safe rel, and no raw HTML ever gets out", () => {
    const html = render("concept", {
      body: es('[a](https://example.com) <script>alert(1)</script> <img src=x onerror="y()">'),
    });
    expect(html).toContain('rel="noopener nofollow ugc"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
  });

  it("sets an example apart", () => {
    expect(render("example", SAMPLES.example as never)).toContain("lesson-example");
  });

  it("gives an image its alt text, lazily, and refuses one that isn't https", () => {
    const html = render("visual", SAMPLES.visual as never);
    expect(html).toContain('alt="Un gato"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("Pie de foto");
    const refused = render("visual", {
      image_url: "javascript:alert(1)",
      alt_text: es("Un gato"),
    });
    expect(refused).not.toContain("<img");
    expect(refused).toContain("Un gato");
  });

  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ"],
    ["https://vimeo.com/76979871"],
  ])("loads no third party until asked, for %s", (url) => {
    const html = render("video", { video_url: url });
    expect(html).not.toContain("<iframe");
    expect(html).toContain("<button");
  });

  it("makes any other video address a link, and an unsafe one nothing", () => {
    const other = render("video", { video_url: "https://example.com/a.mp4" });
    expect(other).toContain('href="https://example.com/a.mp4"');
    expect(other).not.toContain("<button");
    const unsafe = render("video", { video_url: "javascript:alert(1)" });
    expect(unsafe).not.toContain("javascript:");
  });

  it("makes each card a button, with both faces there to read", () => {
    const html = render("cards", SAMPLES.cards as never);
    expect(html).toContain("<button");
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("Frente");
    expect(html).toContain("Reverso");
  });
});
