import type { BlockTypeName } from "@learning-routes/core/blocks/types";
import { LESSON_TEXT } from "@learning-routes/core/copy/lesson";
import type { LocalizedText } from "@learning-routes/core/localized-text";
import type { ReactNode } from "react";
import { inLocale } from "../storefront/words";
import type { ViewContext } from "./lesson-context";
import { Cards, Figure, safeAddress, Video } from "./lesson-media";
import { Markdown } from "./markdown-view";

// Every block kind a creator can bring, on the lesson page (Platform STEP 8 §1). BLOCK_VIEWS is
// keyed by the schema's kinds: one with no view fails the build, never the page. The exercises that
// grade an answer arrive with learning, in STEP 9; until then what they hold is there to read.

function Aside({ context, label }: { context: ViewContext; label: string }) {
  const { block, md } = context;
  return (
    <aside className={`lesson-aside lesson-${block.kind} settle-2`}>
      <p className="lesson-aside-label">{label}</p>
      <div className="lesson-prose">
        <Markdown nodes={md("body")} />
      </div>
    </aside>
  );
}

function Listening({ context, url }: { context: ViewContext; url: unknown }) {
  const { block, md, text, words } = context;
  const address = safeAddress(url);
  const transcript = text(block.data.transcript);
  return (
    <section className="lesson-aside settle-2">
      <div className="lesson-prose">
        <Markdown nodes={md("body")} />
      </div>
      {/* biome-ignore lint/a11y/useMediaCaption: the transcript below is the text alternative */}
      {address ? <audio controls preload="none" src={address} /> : null}
      {transcript ? (
        <details>
          <summary>{words.transcript}</summary>
          <p>{transcript}</p>
        </details>
      ) : null}
    </section>
  );
}

const Body = ({ md }: ViewContext) => (
  <div className="lesson-prose lesson-body settle-2">
    <Markdown nodes={md("body")} />
  </div>
);

export const BLOCK_VIEWS = {
  concept: Body,
  check: ({ block, question }) => question(block),
  tip: (context) => <Aside context={context} label={context.words.tipLabel} />,
  example: (context) => <Aside context={context} label={context.words.exampleLabel} />,
  summary: ({ block, md, text }) => (
    <section className="lesson-aside lesson-summary settle-2">
      <div className="lesson-prose">
        <Markdown nodes={md("body")} />
      </div>
      <ul>
        {((block.data.key_points as LocalizedText[] | undefined) ?? []).map((point, index) => (
          <li key={index}>{text(point)}</li>
        ))}
      </ul>
    </section>
  ),
  drag_drop: ({ block, md, text }) => (
    <section className="lesson-aside settle-2">
      <div className="lesson-prose">
        <Markdown nodes={md("intro")} />
        <Markdown nodes={md("body")} />
      </div>
      <dl className="lesson-pairs">
        {((block.data.pairs as { term: LocalizedText; definition: LocalizedText }[]) ?? []).map(
          (pair, index) => (
            <div key={index}>
              <dt>{text(pair.term)}</dt>
              <dd>{text(pair.definition)}</dd>
            </div>
          ),
        )}
      </dl>
    </section>
  ),
  fill_blank: ({ block, md, text, words }) => (
    <section className="lesson-aside settle-2">
      <div className="lesson-prose">
        <Markdown nodes={md("body")} />
      </div>
      <p>{text(block.data.sentence)}</p>
      <details>
        <summary>{words.seeAnswer}</summary>
        <p>{((block.data.blanks as LocalizedText[]) ?? []).map(text).join(", ")}</p>
      </details>
    </section>
  ),
  code_playground: ({ block, md, words }) => (
    <section className="lesson-aside settle-2">
      <div className="lesson-prose">
        <Markdown nodes={md("body")} />
      </div>
      <pre className="lesson-pre">
        <code>{String(block.data.code ?? "")}</code>
      </pre>
      {block.data.expected_output ? (
        <details>
          <summary>{words.expectedOutput}</summary>
          <pre className="lesson-pre">
            <code>{String(block.data.expected_output)}</code>
          </pre>
        </details>
      ) : null}
    </section>
  ),
  simulation: ({ block, md }) => (
    <section className="lesson-aside settle-2">
      <div className="lesson-prose">
        <Markdown nodes={md("body")} />
      </div>
      {block.data.formula ? <code>{String(block.data.formula)}</code> : null}
      <ul>
        {((block.data.variables as { name: string; min: number; max: number }[]) ?? []).map(
          (variable) => (
            <li key={variable.name}>{`${variable.name}: ${variable.min} – ${variable.max}`}</li>
          ),
        )}
      </ul>
    </section>
  ),
  scenario: ({ block, md, text }) => (
    <section className="lesson-aside settle-2">
      <div className="lesson-prose">
        <Markdown nodes={md("situation")} />
        <Markdown nodes={md("body")} />
      </div>
      {((block.data.options as { label: LocalizedText; consequence: LocalizedText }[]) ?? []).map(
        (option, index) => (
          <details key={index}>
            <summary>{text(option.label)}</summary>
            <p>{text(option.consequence)}</p>
          </details>
        ),
      )}
    </section>
  ),
  cards: Cards,
  visual: (context) => <Figure context={context} />,
  motion: ({ block, md, text }) => (
    <section className="lesson-aside settle-2">
      <div className="lesson-prose">
        <Markdown nodes={md("body")} />
      </div>
      <p>{text(block.data.narration)}</p>
    </section>
  ),
  audio: (context) => <Listening context={context} url={context.block.data.audio_url} />,
  audio_explainer: (context) => <Listening context={context} url={context.block.data.audio_url} />,
  video: (context) => <Video context={context} />,
  // The creation's frame comes with STEP 9 §3; until then, what the creator wrote about it.
  interactive: ({ block, text }) => (
    <section className="lesson-aside settle-2">
      {block.data.description ? <p>{text(block.data.description)}</p> : null}
      {block.data.alt_text ? <p>{text(block.data.alt_text)}</p> : null}
    </section>
  ),
} satisfies Record<BlockTypeName, (context: ViewContext) => ReactNode>;

/** One block, with whatever the author wrote after it. */
export function BlockView({
  block,
  locale,
  source,
  question,
}: Pick<ViewContext, "block" | "locale" | "source" | "question">) {
  const View = BLOCK_VIEWS[block.kind as BlockTypeName] as (context: ViewContext) => ReactNode;
  const text = (value: unknown) =>
    inLocale(value as LocalizedText | null | undefined, locale, source);
  const md: ViewContext["md"] = (field) => {
    const trees = block.md[field];
    return trees?.[locale] ?? trees?.[source] ?? Object.values(trees ?? {})[0];
  };
  const context = { block, locale, source, question, text, md, words: LESSON_TEXT[locale] };
  const title = text(block.data.title);
  return (
    <>
      {title && block.kind !== "check" ? <h2 className="lesson-block-title">{title}</h2> : null}
      {View(context)}
      {md("trailing_content") ? (
        <div className="lesson-prose lesson-body">
          <Markdown nodes={md("trailing_content")} />
        </div>
      ) : null}
    </>
  );
}
