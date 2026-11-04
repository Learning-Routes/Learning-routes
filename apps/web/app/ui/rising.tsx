import { Fragment } from "react";

const SPACES = /\s+/;

/** A headline's words, each able to rise out of its own line. Screen readers read the same text. */
export function Rising({ text }: { text: string }) {
  const words = text.split(SPACES).filter(Boolean);
  return words.map((word, index) => (
    <Fragment key={index}>
      <span className="w">
        <span>{word}</span>
      </span>
      {index < words.length - 1 ? " " : null}
    </Fragment>
  ));
}
