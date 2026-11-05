// A page pasted from a browser: the tags that carry structure become Markdown, and everything else
// is dropped. Nothing here runs: scripts and styles go with their contents, and the words that are
// left go through the same parser as any document.
const DROPPED = /<(script|style|head|noscript|iframe|svg|template)\b[\s\S]*?<\/\1\s*>/gi;
const COMMENT = /<!--[\s\S]*?-->/g;
const ATTRIBUTE = (name: string) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i");
const REPLACED: [RegExp, (...parts: string[]) => string][] = [
  [
    /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi,
    (_w, n, t) => `\n\n${"#".repeat(Number(n))} ${t}\n\n`,
  ],
  [/<(?:b|strong)\b[^>]*>([\s\S]*?)<\/(?:b|strong)\s*>/gi, (_w, t) => `**${t}**`],
  [/<(?:i|em)\b[^>]*>([\s\S]*?)<\/(?:i|em)\s*>/gi, (_w, t) => `*${t}*`],
  [/<code\b[^>]*>([\s\S]*?)<\/code\s*>/gi, (_w, t) => `\`${t}\``],
  [
    /<img\b[^>]*>/gi,
    (tag) => {
      const src = ATTRIBUTE("src").exec(tag)?.[1] ?? "";
      return `\n\n![${ATTRIBUTE("alt").exec(tag)?.[1] ?? ""}](${src})\n\n`;
    },
  ],
  [
    /<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi,
    (tag, t) => {
      const href = ATTRIBUTE("href").exec(tag)?.[1];
      return href ? `[${t}](${href})` : String(t);
    },
  ],
  [
    /<blockquote\b[^>]*>([\s\S]*?)<\/blockquote\s*>/gi,
    (_w, t) =>
      `\n\n> ${String(t)
        .replace(/<[^>]+>/g, " ")
        .trim()}\n\n`,
  ],
  [/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi, (_w, t) => `\n- ${String(t).trim()}`],
  [
    /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi,
    (_w, row) => {
      const cells = [...String(row).matchAll(/<t([hd])\b[^>]*>([\s\S]*?)<\/t\1\s*>/gi)];
      const line = `\n| ${cells.map((cell) => String(cell[2]).trim()).join(" | ")} |`;
      return cells[0]?.[1]?.toLowerCase() === "h"
        ? `${line}\n|${" --- |".repeat(cells.length)}`
        : line;
    },
  ],
  [/<\/?(?:p|div|section|article|ul|ol|table|tbody|thead|main|body|html)\b[^>]*>/gi, () => "\n\n"],
  [/<br\b[^>]*>/gi, () => "  \n"],
  [/<[^>]+>/g, () => ""],
];
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

export function htmlToMarkdown(html: string): string {
  let text = html.replace(COMMENT, "").replace(DROPPED, "");
  for (const [pattern, replace] of REPLACED) {
    text = text.replace(pattern, replace as (substring: string, ...args: unknown[]) => string);
  }
  return text
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
