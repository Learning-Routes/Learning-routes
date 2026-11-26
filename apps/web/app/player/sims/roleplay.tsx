import { useEffect, useRef, useState } from "react";
import { list, obj, usePlayer } from "../shared";
import { useVoice } from "../voice";
import type { SimProps } from "./sim-props";

// A conversation in the language being taught: the partner speaks, the learner picks a reply, and
// the partner answers it. The server scores the picks; the notes come back with the verdict.

interface Turn {
  line: string;
  choices: { text: string; reply: string }[];
}

const toneOfScore = (score: number) => {
  if (score === 2) {
    return "is-right";
  }
  return score === 0 ? "is-wrong" : "";
};

function TurnView({
  turn,
  pick,
  note,
  partner,
  lang,
  say,
}: {
  turn: Turn;
  pick: number | undefined;
  note: { score: number; note: unknown } | undefined;
  partner: unknown;
  lang: string;
  say: (text: string, lang: string) => unknown;
}) {
  const { t } = usePlayer();
  const choice = pick === undefined ? null : turn.choices[pick];
  return (
    <div className="s-turn">
      <button type="button" className="s-msg s-them p-in" onClick={() => void say(turn.line, lang)}>
        {partner ? <small>{String(partner)}</small> : null}
        {turn.line}
      </button>
      {choice ? <p className="s-msg s-me p-in">{choice.text}</p> : null}
      {note ? <p className={`s-note ${toneOfScore(note.score)}`}>{t(note.note)}</p> : null}
      {choice?.reply ? <p className="s-msg s-them p-in d1">{choice.reply}</p> : null}
    </div>
  );
}

export default function Roleplay({ sim, setState, result }: SimProps) {
  const turns = list<Turn>(sim.turns);
  const lang = String(sim.lang ?? "");
  const [picks, setPicks] = useState<number[]>([]);
  // One voice for the conversation: a new line silences the one before it.
  const say = useVoice();
  const end = useRef<HTMLDivElement>(null);
  const notes = list<{ score: number; note: unknown }>(obj(result?.detail).notes);

  useEffect(() => {
    setState(picks.length === turns.length ? { picks } : null);
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [picks, turns.length, setState]);
  // Fixing a conversation starts it over.
  const wasWrong = useRef(false);
  useEffect(() => {
    if (result?.correct === false) {
      wasWrong.current = true;
    } else if (!result && wasWrong.current) {
      wasWrong.current = false;
      setPicks([]);
    }
  }, [result]);

  const current = turns[picks.length];
  return (
    <div className="s-chat" lang={lang}>
      {turns.slice(0, picks.length + 1).map((turn, i) => (
        <TurnView
          key={i}
          turn={turn}
          pick={picks[i]}
          note={notes[i]}
          partner={sim.partner}
          lang={lang}
          say={say}
        />
      ))}
      {current && !result?.correct ? (
        <div className="s-replies">
          {current.choices.map((choice, i) => (
            <button
              key={i}
              type="button"
              className="p-option"
              onClick={() => setPicks([...picks, i])}
            >
              {choice.text}
            </button>
          ))}
        </div>
      ) : null}
      <div ref={end} />
    </div>
  );
}
