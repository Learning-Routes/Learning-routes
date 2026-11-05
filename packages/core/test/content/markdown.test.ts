import { describe, expect, it } from "vitest";
import { type MdNode, markdownTree, safeHttps } from "../../src/content/markdown";

// What a student reads of a creator's Markdown (Platform STEP 8 §1). The tree is the allowlist:
// each node names a kind the page knows how to draw, and nothing else can get through.

const kinds = (nodes: MdNode[]): string[] =>
  nodes.flatMap((node) => [node.t, ...("c" in node ? kinds(node.c) : [])]);
const texts = (nodes: MdNode[]): string =>
  nodes
    .map((node) => {
      if (node.t === "text") {
        return node.v;
      }
      return "c" in node ? texts(node.c) : "v" in node ? node.v : "";
    })
    .join("");

describe("the Markdown a creator writes", () => {
  it("draws paragraphs, bold, italic and inline code", () => {
    const [paragraph] = markdownTree("Hola **fuerte** y *suave* con `x = 1`.");
    expect(kinds([paragraph as MdNode])).toEqual([
      "p",
      "text",
      "strong",
      "text",
      "text",
      "em",
      "text",
      "text",
      "code",
      "text",
      "text",
    ]);
  });

  it("keeps a list a list, with its items apart", () => {
    const [unordered] = markdownTree("- uno\n- dos\n- tres");
    expect(unordered?.t).toBe("ul");
    expect((unordered as { c: MdNode[] }).c).toHaveLength(3);
    expect(markdownTree("1. uno\n2. dos")[0]?.t).toBe("ol");
  });

  it("keeps a table a table", () => {
    const tree = markdownTree("| a | b |\n| - | - |\n| 1 | 2 |");
    expect(kinds(tree)).toEqual(
      expect.arrayContaining(["table", "thead", "tbody", "tr", "th", "td"]),
    );
    expect(texts(tree)).not.toContain("|");
  });

  it("keeps quotes and turns every heading to level 3 or below", () => {
    expect(markdownTree("> dicho")[0]?.t).toBe("blockquote");
    expect(markdownTree("# uno")[0]?.t).toBe("h3");
    expect(markdownTree("## dos")[0]?.t).toBe("h3");
    expect(markdownTree("### tres")[0]?.t).toBe("h3");
    expect(markdownTree("#### cuatro")[0]?.t).toBe("h4");
    expect(markdownTree("##### cinco")[0]?.t).toBe("h4");
  });

  it("links only to https", () => {
    const [paragraph] = markdownTree("[bien](https://example.com/a)");
    expect((paragraph as { c: MdNode[] }).c[0]).toMatchObject({
      t: "a",
      href: "https://example.com/a",
    });
  });
});

describe("a hostile document", () => {
  it.each([
    ["a script tag", "<script>alert(1)</script>"],
    ["an inline handler", '<img src=x onerror="alert(1)">'],
    ["an iframe", '<iframe src="https://evil.example"></iframe>'],
    ["a style tag", "<style>body{display:none}</style>"],
    ["html in a paragraph", 'hola <b onclick="x()">mundo</b>'],
    ["svg", "<svg onload=alert(1)></svg>"],
  ])("never yields an element from %s", (_name, source) => {
    const found = kinds(markdownTree(source));
    for (const kind of ["script", "img", "iframe", "style", "b", "svg", "html"]) {
      expect(found).not.toContain(kind);
    }
  });

  it("keeps the words of raw HTML as words", () => {
    expect(texts(markdownTree("<script>alert(1)</script>"))).toContain("alert(1)");
  });

  it.each([
    "[x](javascript:alert(1))",
    "[x](JaVaScRiPt:alert(1))",
    "[x](data:text/html,<script>alert(1)</script>)",
    "[x](http://example.com)",
    "[x](//example.com)",
    "[x](/relative)",
    "[x](vbscript:msgbox(1))",
    "[x](https://user:pw@example.com)",
  ])("gives no link for %s", (source) => {
    expect(kinds(markdownTree(source))).not.toContain("a");
    expect(texts(markdownTree(source))).toContain("x");
  });

  it("takes an image for its alt text, and loads nothing", () => {
    const tree = markdownTree("![un gato](https://evil.example/pixel.png)");
    expect(kinds(tree)).not.toContain("img");
    expect(texts(tree)).toContain("un gato");
  });

  it("survives a deep and long document", () => {
    expect(() => markdownTree(`${"> ".repeat(500)}hola`)).not.toThrow();
    expect(() => markdownTree("*".repeat(50_000))).not.toThrow();
  });
});

describe("the rest of what a document holds", () => {
  it("keeps a code block as code, a line break as a break, and drops a divider", () => {
    const tree = markdownTree("```\nlet x = 1\n```\n\nuno  \ndos\n\n---\n\nfin");
    expect(tree[0]).toEqual({ t: "pre", v: "let x = 1" });
    expect(kinds(tree)).toContain("br");
    expect(kinds(tree)).not.toContain("hr");
    expect(texts(tree)).toContain("fin");
  });

  it("drops a link's definition, and keeps the words of one it can't follow", () => {
    expect(markdownTree("[a]: https://example.com")).toEqual([]);
    expect(texts(markdownTree("[uno][nada]"))).toContain("uno");
  });

  it("refuses anything that isn't an address", () => {
    expect(safeHttps(undefined)).toBeNull();
    expect(safeHttps(42)).toBeNull();
    expect(safeHttps("https://example.com/a?b=1#c")).toBe("https://example.com/a?b=1#c");
  });
});
