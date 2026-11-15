import { useEffect, useRef, useState } from "react";
import { Icon, list, usePlayer } from "../shared";
import { audio, drum } from "./audio";
import type { SimProps } from "./sim-props";

// A drum machine of sixteen steps: the creator's pattern to start from, played in a loop. Practice
// only: nothing here is graded.

interface Row {
  name: string;
  sound: string;
  steps: number[];
}

/** Schedules the loop ahead on the audio clock, so it keeps time even when the page is busy. */
function useLoop(
  playing: boolean,
  bpm: number,
  grid: boolean[][],
  sounds: string[],
  onStep: (s: number) => void,
) {
  const gridRef = useRef(grid);
  gridRef.current = grid;
  useEffect(() => {
    const ctx = audio();
    if (!playing || !ctx) {
      return;
    }
    const stepTime = 60 / bpm / 4;
    let next = ctx.currentTime + 0.05;
    let step = 0;
    const id = window.setInterval(() => {
      while (next < ctx.currentTime + 0.12) {
        gridRef.current.forEach((row, r) => {
          if (row[step]) {
            drum(sounds[r] ?? "kick", next);
          }
        });
        const shown = step;
        window.setTimeout(() => onStep(shown), Math.max(0, (next - ctx.currentTime) * 1000));
        next += stepTime;
        step = (step + 1) % 16;
      }
    }, 25);
    return () => window.clearInterval(id);
  }, [playing, bpm, sounds, onStep]);
}

export default function Sequencer({ sim }: SimProps) {
  const { words } = usePlayer();
  const rows = list<Row>(sim.rows);
  const [bpm, setBpm] = useState(Number(sim.bpm ?? 90));
  const [grid, setGrid] = useState(() =>
    rows.map((row) => Array.from({ length: 16 }, (_, i) => row.steps.includes(i))),
  );
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(-1);
  const [sounds] = useState(() => rows.map((r) => r.sound));
  useLoop(playing, bpm, grid, sounds, setAt);

  const toggle = (r: number, s: number) => {
    setGrid((now) =>
      now.map((row, i) => (i === r ? row.map((on, j) => (j === s ? !on : on)) : row)),
    );
    if (!grid[r]?.[s]) {
      drum(sounds[r] ?? "kick");
    }
  };

  return (
    <div className="s-seq">
      <div className="s-seq-grid">
        {rows.map((row, r) => (
          <div key={r} className="s-seq-row">
            <span className="s-seq-name">{row.name}</span>
            {grid[r]?.map((on, s) => (
              <button
                key={s}
                type="button"
                className={`s-pad ${on ? "is-on" : ""} ${s === at && playing ? "is-now" : ""} ${s % 4 === 0 ? "is-beat" : ""}`}
                aria-pressed={on}
                aria-label={`${row.name} ${s + 1}`}
                onClick={() => toggle(r, s)}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="p-row">
        <button type="button" className="p-primary p-small" onClick={() => setPlaying(!playing)}>
          <Icon name={playing ? "pause" : "play"} /> {playing ? words.pause : words.play}
        </button>
        <label className="s-bpm">
          <input
            type="range"
            className="p-range"
            min={60}
            max={180}
            step={1}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
          />
          <b className="s-bpm-n">{bpm}</b> BPM
        </label>
      </div>
    </div>
  );
}
