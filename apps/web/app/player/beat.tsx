import { fill } from "@learning-routes/core/copy/player";
import type { ReactNode } from "react";
import { BlockView } from "../app-pages/lesson-blocks";
import { Diagram } from "./diagrams";
import { CodeCheck, OpenAnswer, WorkedExample } from "./practice";
import { Cards, Check, Scenario } from "./questions-choose";
import { Estimate, Hotspot, TrueFalse } from "./questions-judge";
import { FillBlank, Match, Order } from "./questions-place";
import { BeatMarkdown, type BeatProps, obj, usePlayer } from "./shared";
import { SimBeat } from "./sims";
import { Speak } from "./speak";

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

/** A simulator is named by what it simulates; every other beat by its kind. */
function kindName(beat: BeatProps["beat"], kinds: Record<string, string>) {
  const sim = beat.kind === "sim" ? String(obj(beat.data.sim).kind) : "";
  return kinds[sim] ?? kinds[beat.kind] ?? beat.kind;
}

function BeatHead({
  props,
  index,
  total,
  titled = true,
}: {
  props: BeatProps;
  index: number;
  total: number;
  titled?: boolean;
}) {
  const { t, words, kinds } = usePlayer();
  const { beat } = props;
  const field = TITLE_FIELD[beat.kind];
  const title = (field ? t(beat.data[field]) : "") || t(beat.data.title) || kinds[beat.kind] || "";
  return (
    <header className="p-beat-head">
      <p className="p-eyebrow p-in">
        <span className="p-mark" aria-hidden="true">
          {index + 1}
        </span>
        {kindName(beat, kinds)}
        <span className="p-eyebrow-count">{fill(words.beatOf, { n: index + 1, total })}</span>
      </p>
      {titled ? <h1 className="p-title p-in d1">{title}</h1> : null}
    </header>
  );
}

export function Beat({ props, index, total }: { props: BeatProps; index: number; total: number }) {
  const { locale, source } = usePlayer();
  const { beat } = props;
  const Asks = ASKS[beat.kind];
  if (!Asks) {
    return (
      <div className="p-reading">
        <BeatHead props={props} index={index} total={total} titled={false} />
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
