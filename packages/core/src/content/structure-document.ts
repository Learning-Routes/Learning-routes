import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { gfmTable } from "micromark-extension-gfm-table";
import { htmlToMarkdown } from "./html-to-markdown";
import type { RouteDocument } from "./route-document";
import { type Block, Builder, type Node, plain } from "./structure-builder";
import { asCard, asCheck, asImage, asVideo } from "./structure-pieces";

// upload_document's parser (Platform STEP 8 §2). A creator's document, as they made it, becomes a
// route by the same rules every time: the model never rewrites it, and nothing is invented. Text is
// kept word for word, as slices of the source. What doesn't map stays as plain text, and the report
// says so, with its place in the source.

const QUOTE_MARK = /^ {0,3}> ?/gm;
const MARKS = /\p{M}/gu;
const NOT_SLUG = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;
const MOST_SLUG_WORDS = 60;
const HASH_START = 2_166_136_261;
const HASH_PRIME = 16_777_619;
const HASH_BASE = 36;
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

export type { ReportItem } from "./structure-builder";
