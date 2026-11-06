import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "../../src/content/html-to-markdown";
import { problemsIn } from "../../src/content/route-document";
import { structureDocument } from "../../src/content/structure-document";

// upload_document's parser (Platform STEP 8 §2): the creator's document, as it is. The server does
// the structuring, deterministically, and invents nothing.

const SLUG = /^fracciones-para-todos-[a-z0-9]+$/;

const COURSE = `# Fracciones para todos

Introducción que **nadie** debe perder.

## Lo básico

### Qué es una fracción

Una fracción es una parte de un todo.

| Parte | Todo |
| --- | --- |
| 1 | 2 |

> Por ejemplo, media pizza.

![Una pizza partida](https://example.com/pizza.png)

https://www.youtube.com/watch?v=dQw4w9WgXcQ

¿Cuánto es 1/2 + 1/2?

- 1 ✅
- 2
- 3

Respuesta: porque dos mitades hacen un entero.

### Practica

Ejercicio: suma 1/4 + 1/4

Respuesta: 1/2

## Más

### Comparar

Texto final.
`;

const structured = (markdown: string, options = {}) =>
  structureDocument({ source: markdown, format: "markdown", locale: "es", ...options });
const lessonsOf = (result: ReturnType<typeof structured>) =>
  result.document.modules.flatMap((module) => module.lessons);
const kinds = (result: ReturnType<typeof structured>) =>
  lessonsOf(result).flatMap((lesson) => lesson.blocks.map((block) => block.type));

describe("a creator's document", () => {
  const result = structured(COURSE);

  it("makes # the title, ## a module and ### a lesson", () => {
    expect(result.document.title).toEqual({ es: "Fracciones para todos" });
    expect(result.document.modules.map((module) => module.title.es)).toEqual(["Lo básico", "Más"]);
    expect(lessonsOf(result).map((lesson) => lesson.title.es)).toEqual([
      "Qué es una fracción",
      "Practica",
      "Comparar",
    ]);
  });

  it("keeps what comes before the first module, and says where it went", () => {
    const intro = result.report.find((item) => item.what.includes("Introducción"));
    expect(intro?.kind).toBe("plain_text");
    expect(intro?.line).toBe(3);
  });

  it("maps each piece to its block", () => {
    expect(kinds(result)).toEqual([
      "concept", // what came before the first module, kept
      "concept",
      "example",
      "visual",
      "video",
      "check",
      "cards",
      "concept",
    ]);
  });

  it("keeps a table inside the concept, word for word", () => {
    const first = lessonsOf(result)[0]?.blocks[1] as { body: { es: string } };
    expect(first.body.es).toContain("Una fracción es una parte de un todo.");
    expect(first.body.es).toContain("| Parte | Todo |");
  });

  it("reads a ✅ question, with its explanation", () => {
    const check = lessonsOf(result)[0]?.blocks[5] as {
      question: { es: string };
      options: { label: { es: string }; correct: boolean }[];
      explanation: { es: string };
    };
    expect(check.question.es).toBe("¿Cuánto es 1/2 + 1/2?");
    expect(check.options.map((option) => [option.label.es, option.correct])).toEqual([
      ["1", true],
      ["2", false],
      ["3", false],
    ]);
    expect(check.explanation.es).toBe("porque dos mitades hacen un entero.");
  });

  it("turns Ejercicio and Respuesta into a card", () => {
    const cards = lessonsOf(result)[1]?.blocks[0] as {
      cards: { front: { es: string }; back: { es: string } }[];
    };
    expect(cards.cards[0]?.front.es).toBe("suma 1/4 + 1/4");
    expect(cards.cards[0]?.back.es).toBe("1/2");
  });

  it("is a valid document", () => {
    expect(problemsIn(result.document).ok).toBe(true);
  });

  it("never invents: no description, no exam, no question nobody wrote", () => {
    expect(result.document.description).toBeUndefined();
    expect(JSON.stringify(result.document)).not.toContain("Examen");
    expect(kinds(result).filter((kind) => kind === "check")).toHaveLength(1);
  });

  it("gives every report line its place in the source", () => {
    expect(result.report.every((item) => item.line >= 1)).toBe(true);
    expect(result.report.some((item) => item.kind === "imported")).toBe(true);
  });

  it("gives the same slug for the same document, and another for another", () => {
    expect(structured(COURSE).document.slug).toBe(result.document.slug);
    expect(structured(`${COURSE}\nMás.`).document.slug).not.toBe(result.document.slug);
    expect(result.document.slug).toMatch(SLUG);
  });
});

describe("what doesn't map", () => {
  it("takes the title it is given, and says when there is none", () => {
    expect(structured("Solo texto.", { title: "Mi ruta" }).document.title.es).toBe("Mi ruta");
    const noTitle = structured("Solo texto.");
    expect(noTitle.problems[0]).toContain("title");
  });

  it("gives a document with no headings one module and one lesson, under its title", () => {
    const flat = structured("# Ruta\n\nTexto.");
    expect(flat.document.modules).toHaveLength(1);
    expect(lessonsOf(flat)[0]?.title.es).toBe("Ruta");
  });

  it("keeps raw HTML as plain text, and reports it", () => {
    const risky = structured("# R\n\n## M\n\n<script>alert(1)</script>");
    expect(risky.report.some((item) => item.kind === "plain_text")).toBe(true);
    expect(problemsIn(risky.document).ok).toBe(true);
  });

  it("points an interactive creation, or a link to one, at upload_creation", () => {
    const made = structured(
      "# R\n\n## M\n\n```html\n<button>Do</button>\n<script>play()</script>\n```\n\nhttps://claude.ai/public/artifacts/0192d3a0-piano",
    );
    const pointed = made.report.filter(
      (item) => item.why === "send it as it is with upload_creation",
    );
    expect(pointed.map((item) => item.line)).toEqual([5, 7, 10]);
  });

  it("skips an image that isn't https, and says why", () => {
    const http = structured("# R\n\n## M\n\n![a](http://x.example/a.png)");
    const skipped = http.report.find((item) => item.kind === "skipped");
    expect(skipped?.why).toContain("https");
    expect(kinds(http)).not.toContain("visual");
  });
});

describe("a page pasted from a browser", () => {
  it("becomes the same structure, with the scripts gone", () => {
    const markdown =
      htmlToMarkdown(`<html><head><style>a{}</style><script>evil()</script></head><body>
      <h1>Título</h1><h2>Mod</h2><h3>Tema</h3><p>Un <b>texto</b> con <a href="https://a.example/">enlace</a>.</p>
      <ul><li>uno</li><li>dos</li></ul><blockquote>Dicho</blockquote><img src="https://a.example/i.png" alt="Foto">
      <table><tr><th>A</th></tr><tr><td>1</td></tr></table></body></html>`);
    expect(markdown).not.toContain("evil");
    const result = structured(markdown);
    expect(result.document.title.es).toBe("Título");
    expect(kinds(result)).toEqual(["concept", "example", "visual", "concept"]);
    expect(JSON.stringify(result.document)).toContain("**texto**");
    expect(JSON.stringify(result.document)).toContain("| A |");
  });
});

describe("the rest of what a document can hold", () => {
  it("reads a question with no explanation, two cards in a row, and a video link", () => {
    const result = structured(`# R

## M

### T

¿Cuál?

- a ✅
- b

Ejercicio: uno

Respuesta: 1

Ejercicio: dos

Respuesta: 2

[El video](https://youtu.be/dQw4w9WgXcQ)

![](https://example.com/sin-alt.png)
`);
    expect(kinds(result)).toEqual(["check", "cards", "video", "visual"]);
    const cards = lessonsOf(result)[0]?.blocks[1] as { cards: unknown[] };
    expect(cards.cards).toHaveLength(2);
    const check = lessonsOf(result)[0]?.blocks[0] as { explanation?: unknown };
    expect(check.explanation).toBeUndefined();
  });

  it("keeps deeper headings and dividers out of the structure", () => {
    const result = structured("# R\n\n## M\n\n### T\n\n#### Más hondo\n\nTexto.\n\n---\n\nFin.");
    expect(kinds(result)).toEqual(["concept", "concept"]);
    expect(result.report.some((item) => item.kind === "skipped")).toBe(true);
  });
});

describe("a pasted page's odd corners", () => {
  it("drops comments and the tags it doesn't know, and keeps the words", () => {
    const markdown = htmlToMarkdown(
      "<!-- nota --><ol><li>uno</li></ol><a>sin destino</a><code>x</code><p>a&amp;b&nbsp;c<br>d</p><iframe>oculto</iframe><span>texto</span>",
    );
    expect(markdown).not.toContain("nota");
    expect(markdown).not.toContain("oculto");
    expect(markdown).toContain("- uno");
    expect(markdown).toContain("sin destino");
    expect(markdown).toContain("`x`");
    expect(markdown).toContain("a&b c");
    expect(markdown).toContain("texto");
  });
});
