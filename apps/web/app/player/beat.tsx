import { fill } from "@learning-routes/core/copy/player";
import type { ReactNode } from "react";
import { BlockView } from "../app-pages/lesson-blocks";
import { Diagram } from "./diagrams";
import { CodeCheck, OpenAnswer, Speak, WorkedExample } from "./practice";
import {
  Cards,
  Check,
  Estimate,
  FillBlank,
  Hotspot,
  Match,
  Order,
  Scenario,
  TrueFalse,
} from "./questions";
import { BeatMarkdown, type BeatProps, usePlayer } from "./shared";
import { SimBeat } from "./sims";

// One beat of a topic: the line above, its title, what it says, and what it asks.

const ASKS: Record<string, (props: BeatProps) => ReactNode> = {
  check: Check,
  order: Order,
  drag_drop: Match,
  fill_blank: FillBlank,
  true_false: TrueFalse,
  estimate: Estimate,
  hotspot: (props) => <Hotspot {...props} diagram={<Diagram name={props.beat.data.diagram} />} />,
  cards: Cards,
  scenario: Scenario,
  worked_example: WorkedExample,
  speak: Speak,
  code_check: CodeCheck,
  open_answer: OpenAnswer,
  sim: SimBeat,
};

/** The field that names what a beat asks. */
const TITLE_FIELD: Record<string, string> = {
  check: "question",
  order: "prompt",
  true_false: "prompt",
  estimate: "prompt",
  hotspot: "prompt",
  sim: "prompt",
  code_check: "prompt",
  open_answer: "prompt",
  worked_example: "problem",
};

/** Whether the player draws the beat itself, or the reading page's view does. */
export const isAsking = (kind: string) => kind in ASKS;

export function BeatHead({
  props,
  index,
  total,
}: {
  props: BeatProps;
  index: number;
  total: number;
}) {
  const { t, words } = usePlayer();
  const { beat } = props;
  const field = TITLE_FIELD[beat.kind];
  const title =
    (field ? t(beat.data[field]) : "") || t(beat.data.title) || words.kinds[beat.kind] || "";
  return (
    <header className="p-beat-head">
      <p className="p-eyebrow p-in">
        <span className="p-mark" aria-hidden="true" />
        {words.kinds[beat.kind] ?? beat.kind}
        <span className="p-eyebrow-count">{fill(words.beatOf, { n: index + 1, total })}</span>
      </p>
      <h1 className="p-title p-in d1">{title}</h1>
    </header>
  );
}

export function Beat({ props, index, total }: { props: BeatProps; index: number; total: number }) {
  const { locale, source } = usePlayer();
  const { beat } = props;
  const Asks = ASKS[beat.kind];
  if (!Asks) {
    return (
      <div className="p-reading p-in">
        <BlockView block={beat} locale={locale} source={source} question={() => null} creator="" />
      </div>
    );
  }
  return (
    <>
      <BeatHead props={props} index={index} total={total} />
      {beat.kind === "scenario" ? null : <BeatMarkdown beat={beat} field="intro" />}
      {beat.kind === "scenario" ? null : <BeatMarkdown beat={beat} field="body" />}
      <Asks {...props} />
    </>
  );
}
