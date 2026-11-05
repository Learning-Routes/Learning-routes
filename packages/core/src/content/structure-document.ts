import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { gfmTable } from "micromark-extension-gfm-table";
import { htmlToMarkdown } from "./html-to-markdown";
import type { RouteDocument } from "./route-document";
import { MOST } from "./route-document";

// upload_document's parser (Platform STEP 8 §2). A creator's document, as they made it, becomes a
// route by the same rules every time: the model never rewrites it, and nothing is invented. Text is
// kept word for word, as slices of the source. What doesn't map stays as plain text, and the report
// says so, with its place in the source.

export interface ReportItem {
  line: number;
  kind: "imported" | "plain_text" | "skipped";
  what: string;
  why?: string;
}

interface Node {
  type: string;
  value?: string;
  url?: string;
  alt?: string | null;
  depth?: number;
  position?: { start: { line: number; offset?: number }; end: { offset?: number } };
  children?: Node[];
}

type Block = RouteDocument["modules"][number]["lessons"][number]["blocks"][number];

const TICK = /\s*✅\s*/u;
const ANSWER = /^\**(?:respuesta|answer|explicaci[oó]n)\**\s*:\**\s*/iu;
const EXERCISE = /^\**(?:ejercicio|exercise)\b[^:]*:\**\s*/iu;
const QUOTE_MARK = /^ {0,3}> ?/gm;
const VIDEO = /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/|youtu\.be\/|vimeo\.com\/)\S+$/i;
const MARKS = /\p{M}/gu;
const NOT_SLUG = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;
const MOST_SLUG_WORDS = 60;
const HASH_START = 2_166_136_261;
const HASH_PRIME = 16_777_619;
const HASH_BASE = 36;
const SHOWN_IN_REPORT = 60;

/** A short, stable fingerprint: the same document always gives the same route. */
function fingerprint(source: string): string {
  let first = HASH_START;
  let second = HASH_START ^ source.length;
  for (let at = 0; at < source.length; at++) {
    const code = source.charCodeAt(at);
    first = Math.imul(first ^ code, HASH_PRIME);
    second = Math.imul(second + code, HASH_PRIME) ^ (second >>> 13);
  }
  return `${(first >>> 0).toString(HASH_BASE)}${(second >>> 0).toString(HASH_BASE)}`;
}

const slugOf = (title: string, source: string) => {
  const words = title
    .normalize("NFD")
    .replace(MARKS, "")
    .toLowerCase()
    .replace(NOT_SLUG, "-")
    .replace(EDGE_HYPHENS, "")
    .slice(0, MOST_SLUG_WORDS)
    .replace(EDGE_HYPHENS, "");
  return `${words || "ruta"}-${fingerprint(source)}`;
};

const plain = (node: Node): string =>
  node.value ?? node.alt ?? (node.children ?? []).map(plain).join("");

const only = (node: Node, type: string) =>
  node.type === "paragraph" && node.children?.length === 1 && node.children[0]?.type === type
    ? node.children[0]
    : null;

class Builder {
  readonly report: ReportItem[] = [];
  readonly modules: {
    title: Record<string, string>;
    lessons: { title: Record<string, string>; blocks: Block[] }[];
  }[] = [];
  private prose: string[] = [];
  private proseLine = 0;
  title: string | null;

  constructor(
    private readonly source: string,
    private readonly locale: string,
    title: string | undefined,
  ) {
    this.title = title ?? null;
  }

  slice(node: Node) {
    return this.source.slice(node.position?.start.offset ?? 0, node.position?.end.offset ?? 0);
  }

  note(node: Node, kind: ReportItem["kind"], what: string, why?: string) {
    this.report.push({
      line: node.position?.start.line ?? 1,
      kind,
      what: what.slice(0, SHOWN_IN_REPORT),
      ...(why ? { why } : {}),
    });
  }

  text(words: string) {
    return { [this.locale]: words } as Record<string, string>;
  }

  flush() {
    if (this.prose.length > 0) {
      const body = this.prose.join("\n\n");
      this.prose = [];
      this.push({ type: "concept", body: this.text(body) } as Block, this.proseLine, "concept");
    }
  }

  private push(block: Block, line: number, what: string) {
    this.lesson().blocks.push(block);
    this.report.push({ line, kind: "imported", what });
  }

  private module() {
    if (this.modules.length === 0) {
      this.modules.push({ title: this.text(this.title ?? ""), lessons: [] });
    }
    return this.modules.at(-1) as Builder["modules"][number];
  }

  private lesson() {
    const module = this.module();
    if (module.lessons.length === 0) {
      module.lessons.push({ title: { ...module.title }, blocks: [] });
    }
    return module.lessons.at(-1) as Builder["modules"][number]["lessons"][number];
  }

  openModule(node: Node) {
    this.flush();
    this.modules.push({ title: this.text(plain(node)), lessons: [] });
    this.note(node, "imported", `module: ${plain(node)}`);
  }

  openLesson(node: Node) {
    this.flush();
    this.module().lessons.push({ title: this.text(plain(node)), blocks: [] });
    this.note(node, "imported", `lesson: ${plain(node)}`);
  }

  addProse(node: Node) {
    const words = this.slice(node);
    if (this.prose.join("\n\n").length + words.length > MOST.textLength) {
      this.flush();
    }
    if (this.prose.length === 0) {
      this.proseLine = node.position?.start.line ?? 1;
    }
    this.prose.push(words);
  }

  add(block: Block, node: Node, what: string) {
    this.flush();
    this.push(block, node.position?.start.line ?? 1, what);
  }

  lastBlock(): Block | undefined {
    return this.lesson().blocks.at(-1);
  }
}

/** A question: the paragraph before a list with a ✅, and an answer's words after it. */
function asCheck(builder: Builder, nodes: Node[], at: number) {
  const [asked, list, after] = [nodes[at], nodes[at + 1], nodes[at + 2]];
  if (asked?.type !== "paragraph" || list?.type !== "list") {
    return 0;
  }
  const items = list.children ?? [];
  if (!items.some((item) => TICK.test(plain(item)))) {
    return 0;
  }
  const answer = after?.type === "paragraph" ? plain(after) : "";
  const explained = ANSWER.test(answer);
  builder.add(
    {
      type: "check",
      question: builder.text(plain(asked)),
      options: items.map((item) => ({
        label: builder.text(plain(item).replace(TICK, " ").trim()),
        correct: TICK.test(plain(item)),
      })),
      ...(explained ? { explanation: builder.text(answer.replace(ANSWER, "")) } : {}),
    } as Block,
    asked,
    `check: ${plain(asked)}`,
  );
  return explained ? 3 : 2;
}

/** A card: "Ejercicio: …" and then "Respuesta: …". Cards in a row stay one block. */
function asCard(builder: Builder, nodes: Node[], at: number) {
  const [front, back] = [nodes[at], nodes[at + 1]];
  if (front?.type !== "paragraph" || back?.type !== "paragraph") {
    return 0;
  }
  if (!(EXERCISE.test(plain(front)) && ANSWER.test(plain(back)))) {
    return 0;
  }
  const card = {
    front: builder.text(plain(front).replace(EXERCISE, "")),
    back: builder.text(plain(back).replace(ANSWER, "")),
  };
  builder.flush();
  const last = builder.lastBlock() as { type?: string; cards?: (typeof card)[] } | undefined;
  if (last?.type === "cards") {
    last.cards?.push(card);
    builder.note(front, "imported", "card");
  } else {
    builder.add({ type: "cards", cards: [card] } as Block, front, "card");
  }
  return 2;
}

function asImage(builder: Builder, node: Node) {
  const image = only(node, "image");
  if (!image) {
    return false;
  }
  if (!image.url?.startsWith("https://")) {
    builder.flush();
    builder.note(node, "skipped", `image: ${image.alt ?? ""}`, "images come from an https address");
    return true;
  }
  builder.add(
    {
      type: "visual",
      image_url: image.url,
      ...(image.alt ? { alt_text: builder.text(image.alt) } : {}),
    } as Block,
    node,
    `image: ${image.alt ?? image.url}`,
  );
  return true;
}

function asVideo(builder: Builder, node: Node) {
  const link = only(node, "link")?.url;
  const words = node.type === "paragraph" ? plain(node).trim() : "";
  const address = link ?? words;
  if (!VIDEO.test(address)) {
    return false;
  }
  builder.add({ type: "video", video_url: address } as Block, node, `video: ${address}`);
  return true;
}

function headingStep(builder: Builder, node: Node) {
  if (node.depth === 1 && builder.title === null) {
    builder.title = plain(node);
    builder.note(node, "imported", `title: ${plain(node)}`);
  } else if (node.depth === 2) {
    builder.openModule(node);
  } else if (node.depth === 3) {
    builder.openLesson(node);
  } else {
    builder.addProse(node);
  }
}

/** One node that isn't a question or a card. */
function place(builder: Builder, node: Node) {
  if (node.type === "heading") {
    headingStep(builder, node);
  } else if (node.type === "blockquote") {
    const body = builder.slice(node).replace(QUOTE_MARK, "");
    builder.add({ type: "example", body: builder.text(body) } as Block, node, "example");
  } else if (node.type === "thematicBreak" || node.type === "definition") {
    builder.flush();
    builder.note(node, "skipped", node.type, "a divider holds no content");
  } else if (!(asImage(builder, node) || asVideo(builder, node))) {
    if (node.type === "html") {
      builder.note(node, "plain_text", builder.slice(node), "HTML stays as the words it is");
    }
    builder.addProse(node);
  }
}

function walk(builder: Builder, nodes: Node[]) {
  for (let at = 0; at < nodes.length; at++) {
    const taken = asCheck(builder, nodes, at) || asCard(builder, nodes, at);
    if (taken) {
      at += taken - 1;
    } else {
      place(builder, nodes[at] as Node);
    }
  }
  builder.flush();
}

/** What comes before the first module has nowhere of its own: it opens with the first lesson. */
function reportIntro(builder: Builder, nodes: Node[]) {
  const first = nodes.findIndex((node) => node.type === "heading" && node.depth === 2);
  if (first > 0) {
    for (const node of nodes.slice(0, first)) {
      if (node.type !== "heading") {
        builder.note(node, "plain_text", "Introducción", "text before the first module");
      }
    }
  }
}

export function structureDocument(input: {
  source: string;
  format: "markdown" | "html";
  locale: string;
  title?: string | undefined;
}) {
  const source = input.format === "html" ? htmlToMarkdown(input.source) : input.source;
  const tree = fromMarkdown(source, {
    extensions: [gfmTable()],
    mdastExtensions: [gfmTableFromMarkdown()],
  }) as unknown as Node;
  const nodes = tree.children ?? [];
  const builder = new Builder(source, input.locale, input.title);
  const firstModule = nodes.findIndex((node) => node.type === "heading" && node.depth === 2);
  const opening = firstModule === -1 ? nodes : nodes.slice(0, firstModule);
  const title = opening.find((node) => node.type === "heading" && node.depth === 1);
  builder.title = input.title ?? (title ? plain(title) : null);
  reportIntro(builder, nodes);
  const introless =
    firstModule > 0 ? nodes.slice(firstModule) : nodes.filter((node) => node !== title);
  // The words before the first module open its first lesson, kept and not lost.
  const before =
    firstModule > 0 ? nodes.slice(0, firstModule).filter((node) => node !== title) : [];
  walk(builder, introless);
  if (before.length > 0) {
    const lesson = builder.modules[0]?.lessons[0];
    lesson?.blocks.unshift({
      type: "concept",
      body: builder.text(before.map((node) => builder.slice(node)).join("\n\n")),
    } as Block);
  }
  const problems = builder.title
    ? []
    : ["The document needs a title: a # heading, or the title field."];
  const document = {
    slug: slugOf(builder.title ?? "", source),
    title: builder.text(builder.title ?? ""),
    source_locale: input.locale,
    modules: builder.modules.filter((module) => module.lessons.length > 0),
  } as RouteDocument;
  return { document, report: builder.report, problems };
}
