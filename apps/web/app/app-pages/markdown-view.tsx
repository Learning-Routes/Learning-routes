import type { MdNode } from "@learning-routes/core/content/markdown";
import { createElement, type ReactNode } from "react";

// Draws the tree core made of a creator's Markdown. Every kind here is one the tree allows, through
// React, so nothing in a document can become anything else.

function one(node: MdNode, key: number): ReactNode {
  switch (node.t) {
    case "text":
      return node.v;
    case "br":
      return <br key={key} />;
    case "pre":
      return (
        <pre key={key} className="lesson-pre">
          <code>{node.v}</code>
        </pre>
      );
    case "a":
      return (
        <a key={key} className="text-link" href={node.href} rel="noopener nofollow ugc">
          <Markdown nodes={node.c} />
        </a>
      );
    case "table":
      // Its own scroll, so a wide table never moves the page.
      return (
        <div key={key} className="lesson-table" tabIndex={-1}>
          <table>
            <Markdown nodes={node.c} />
          </table>
        </div>
      );
    default:
      return createElement(node.t, { key }, <Markdown nodes={node.c} />);
  }
}

export function Markdown({ nodes }: { nodes: MdNode[] | undefined }) {
  return (nodes ?? []).map(one);
}
