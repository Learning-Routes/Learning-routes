import { fill } from "@learning-routes/core/copy/player";
import { useEffect, useRef, useState } from "react";
import { usePlayer } from "../shared";
import { click } from "./audio";
import type { SimProps } from "./sim-props";

// Chest compressions in rhythm: tap (or press Space) at each push. The pace is measured over the
// last taps; a metronome can help. Practice only: nothing here is graded.

const WINDOW = 5;

export default function Rhythm({ sim }: SimProps) {
  const { words } = usePlayer();
  const minBpm = Number(sim.min_bpm ?? 100);
  const maxBpm = Number(sim.max_bpm ?? 120);
  const goal = Number(sim.count ?? 15);
  const [taps, setTaps] = useState<number[]>([]);
  const [inRhythm, setInRhythm] = useState(0);
  const [metronome, setMetronome] = useState(false);
  const [pressed, setPressed] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  const recent = taps.slice(-WINDOW);
  const bpm =
    recent.length >= 2
      ? Math.round(60_000 / (((recent.at(-1) ?? 0) - (recent[0] ?? 0)) / (recent.length - 1)))
      : 0;
  const state = !bpm ? "start" : bpm < minBpm ? "slow" : bpm > maxBpm ? "fast" : "good";

  const tap = () => {
    setTaps((now) => [...now.slice(-20), performance.now()]);
    setPressed(true);
    window.setTimeout(() => setPressed(false), 120);
  };
  useEffect(() => {
    if (state === "good") {
      setInRhythm((n) => n + 1);
    }
  }, [taps.length, state]);

  useEffect(() => {
    if (!metronome) {
      return;
    }
    const beat = 60_000 / ((minBpm + maxBpm) / 2);
    const id = window.setInterval(() => click(), beat);
    return () => window.clearInterval(id);
  }, [metronome, minBpm, maxBpm]);

  const message = {
    start: words.startTapping,
    slow: words.fasterPlease,
    fast: words.slowerPlease,
    good: words.keepIt,
  }[state];
  return (
    <div className="s-rhythm">
      <div className={`s-gauge is-${state}`}>
        <b>{bpm || "—"}</b>
        <span>{words.perMinute}</span>
        <small>
          {minBpm}–{maxBpm}
        </small>
      </div>
      <p className="p-note p-soft" aria-live="polite">
        {message}
      </p>
      <button
        ref={button}
        type="button"
        className={`s-chest ${pressed ? "is-down" : ""}`}
        onPointerDown={(event) => {
          event.preventDefault();
          tap();
        }}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            tap();
          }
        }}
        aria-label={words.startTapping}
      >
        <span className="s-hands" aria-hidden="true" />
      </button>
      <div className="s-progress-line">
        <span>{fill(words.scoreOf, { n: Math.min(inRhythm, goal), total: goal })}</span>
        <span>{words.inRhythm}</span>
        <i style={{ transform: `scaleX(${Math.min(1, inRhythm / goal)})` }} />
      </div>
      <button
        type="button"
        className="p-link"
        aria-pressed={metronome}
        onClick={() => setMetronome(!metronome)}
      >
        {words.rhythmHelp}: {metronome ? words.off : words.on}
      </button>
    </div>
  );
}
