import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { gfmTable } from "micromark-extension-gfm-table";

// What a student reads of a creator's Markdown (Platform STEP 8 §1). This tree is the allowlist:
// each node names a kind the page knows how to draw, drawn through React, so raw HTML has no way
// out. HTML in a document stays as its words. Links go to https only. Run it on the server: the
// parser is too large to send to a browser.

export type MdNode =
  | { t: "text"; v: string }
  | { t: "code"; c: MdNode[] }
  | { t: "pre"; v: string }
  | { t: "br" }
  | { t: "a"; href: string; c: MdNode[] }
  | {
      t:
        | "p"
        | "strong"
        | "em"
        | "h3"
        | "h4"
        | "ul"
        | "ol"
        | "li"
        | "blockquote"
        | "table"
        | "thead"
        | "tbody"
        | "tr"
        | "th"
        | "td";
      c: MdNode[];
    };

const DEEPEST = 24;
const LONGEST = 200_000;
const FIRST_HEADING_KEPT = 3;
const TAGS = /<[^>]*>/g;
const SAFE_LINK = /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:[/?#][^\s]*)?$/i;

interface Parsed {
  type: string;
  value?: string;
  url?: string;
  alt?: string | null;
  ordered?: boolean | null;
  depth?: number;
  children?: Parsed[];
}

/** An https address on a plain host, with no credentials in it, or null. */
export function safeHttps(address: unknown): string | null {
  return typeof address === "string" && SAFE_LINK.test(address) ? address : null;
}

const words = (node: Parsed): string =>
  node.value ?? node.alt ?? (node.children ?? []).map(words).join("");

const kids = (node: Parsed, depth: number) =>
  depth >= DEEPEST
    ? [{ t: "text" as const, v: words(node) }]
    : (node.children ?? []).flatMap((child) => convert(child, depth + 1));

function tableOf(node: Parsed, depth: number): MdNode {
  const row = (each: Parsed, cell: "th" | "td"): MdNode => ({
    t: "tr",
    c: (each.children ?? []).map((one) => ({ t: cell, c: kids(one, depth + 1) })),
  });
  const [head, ...body] = node.children ?? [];
  return {
    t: "table",
    c: [
      { t: "thead", c: head ? [row(head, "th")] : [] },
      { t: "tbody", c: body.map((each) => row(each, "td")) },
    ],
  };
}

function convert(node: Parsed, depth: number): MdNode[] {
  const c = () => kids(node, depth);
  switch (node.type) {
    case "text":
      return [{ t: "text", v: node.value ?? "" }];
    case "paragraph":
      return [{ t: "p", c: c() }];
    case "strong":
    case "emphasis":
      return [{ t: node.type === "strong" ? "strong" : "em", c: c() }];
    case "inlineCode":
      return [{ t: "code", c: [{ t: "text", v: node.value ?? "" }] }];
    case "code":
      return [{ t: "pre", v: node.value ?? "" }];
    case "break":
      return [{ t: "br" }];
    case "heading":
      return [{ t: (node.depth ?? 1) <= FIRST_HEADING_KEPT ? "h3" : "h4", c: c() }];
    case "list":
      return [{ t: node.ordered ? "ol" : "ul", c: c() }];
    case "listItem":
      return [{ t: "li", c: c() }];
    case "blockquote":
      return [{ t: "blockquote", c: c() }];
    case "table":
      return [tableOf(node, depth)];
    case "link": {
      const href = safeHttps(node.url);
      return href ? [{ t: "a", href, c: c() }] : c();
    }
    case "html":
      // The words a person can read, and no tag: it can't be an element here anyway.
      return [{ t: "text", v: (node.value ?? "").replace(TAGS, " ").trim() }];
    case "image":
      return [{ t: "text", v: node.alt ?? "" }];
    case "thematicBreak":
    case "definition":
      return [];
    default:
      return [{ t: "text", v: words(node) }];
  }
}

export function markdownTree(source: string): MdNode[] {
  const tree = fromMarkdown(source.slice(0, LONGEST), {
    extensions: [gfmTable()],
    mdastExtensions: [gfmTableFromMarkdown()],
  }) as unknown as Parsed;
  return (tree.children ?? []).flatMap((child) => convert(child, 0));
}
