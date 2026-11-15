import { useEffect, useState } from "react";
import { Icon, obj, usePlayer } from "../shared";
import { pluck } from "./audio";
import type { SimProps } from "./sim-props";

// A fretboard: string 1 is the high e, string 6 the low E. Tap a fret to press it; tap it again to
// let the string ring open. Strum to hear the chord.

const STRINGS = ["1", "2", "3", "4", "5", "6"] as const;
const OPEN: Record<(typeof STRINGS)[number], number> = {
  "1": 64,
  "2": 59,
  "3": 55,
  "4": 50,
  "5": 45,
  "6": 40,
};
const NAME: Record<string, string> = { "1": "e", "2": "B", "3": "G", "4": "D", "5": "A", "6": "E" };
const FRETS = [1, 2, 3, 4, 5];

function toneOf(correct: boolean | null | undefined, on: boolean, want: boolean) {
  if (correct !== undefined && on) {
    return correct || want ? "is-right" : "is-wrong";
  }
  return want && !on ? "is-hint" : "";
}

export default function Guitar({ sim, setState, result }: SimProps) {
  const { words } = usePlayer();
  const [frets, setFrets] = useState<Record<string, number>>({});
  const target = obj(obj(result?.solution).target);

  useEffect(() => {
    setState(Object.keys(frets).length ? { frets } : null);
  }, [frets, setState]);

  const press = (string: (typeof STRINGS)[number], fret: number) => {
    if (result?.correct) {
      return;
    }
    pluck(OPEN[string] + fret);
    setFrets((now) => {
      const { [string]: was, ...rest } = now;
      return was === fret ? rest : { ...rest, [string]: fret };
    });
  };
  const strum = () => {
    for (const [i, s] of [...STRINGS].reverse().entries()) {
      pluck(OPEN[s] + (frets[s] ?? 0), i * 0.035);
    }
  };

  return (
    <div className="s-guitar">
      {sim.name ? <p className="s-chord-read">{String(sim.name)}</p> : null}
      <div className="s-board">
        <div className="s-nut" aria-hidden="true" />
        {STRINGS.map((string, row) => (
          <div key={string} className="s-string-row">
            <span className="s-string-name">{NAME[string]}</span>
            <span
              className="s-string"
              style={{ height: `${1 + row * 0.5}px` }}
              aria-hidden="true"
            />
            {FRETS.map((fret) => {
              const on = frets[string] === fret;
              const want = target[string] === fret;
              const tone = toneOf(result?.correct, on, want);
              return (
                <button
                  key={fret}
                  type="button"
                  className={`s-fret ${on ? "is-on" : ""} ${tone}`}
                  aria-pressed={on}
                  aria-label={`${NAME[string]} · ${fret}`}
                  onClick={() => press(string, fret)}
                >
                  {on || want ? <span className="s-finger p-pop">{on ? fret : ""}</span> : null}
                </button>
              );
            })}
          </div>
        ))}
        <div className="s-fret-numbers" aria-hidden="true">
          <span />
          {FRETS.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </div>
      </div>
      <div className="p-row">
        <button type="button" className="p-secondary p-small" onClick={strum}>
          <Icon name="play" /> {words.strum}
        </button>
        <button
          type="button"
          className="p-link"
          disabled={result?.correct === true}
          onClick={() => setFrets({})}
        >
          {words.clear}
        </button>
      </div>
    </div>
  );
}
