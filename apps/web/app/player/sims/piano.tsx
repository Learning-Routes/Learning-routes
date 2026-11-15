import { useEffect, useState } from "react";
import { Icon, list, obj, usePlayer } from "../shared";
import { note } from "./audio";
import type { SimProps } from "./index";

// A keyboard: tap the keys of the chord, hear them, and the server says which notes are off.

const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const BLACK = new Set([1, 3, 6, 8, 10]);
const pc = (midi: number) => ((midi % 12) + 12) % 12;

function keysOf(low: number, high: number) {
  const whites: number[] = [];
  const blacks: { midi: number; after: number }[] = [];
  for (let midi = low; midi <= high; midi++) {
    if (BLACK.has(pc(midi))) {
      blacks.push({ midi, after: whites.length });
    } else {
      whites.push(midi);
    }
  }
  return { whites, blacks };
}

export default function Piano({ sim, setState, result }: SimProps) {
  const { words } = usePlayer();
  const low = Number(sim.low ?? 60);
  const high = Number(sim.high ?? 76);
  const [notes, setNotes] = useState<number[]>([]);
  const { whites, blacks } = keysOf(low, high);
  const detail = obj(result?.detail);
  const extra = new Set(list<number>(detail.extra));
  const target = new Set(list<number>(obj(result?.solution).target));

  useEffect(() => {
    setState(notes.length ? { notes } : null);
  }, [notes, setState]);

  const toggle = (midi: number) => {
    if (result?.correct) {
      return;
    }
    note(midi, 0, 0.9);
    setNotes((now) =>
      now.includes(midi) ? now.filter((n) => n !== midi) : [...now, midi].sort((a, b) => a - b),
    );
  };
  const tone = (midi: number) => {
    const on = notes.includes(midi);
    if (result && on) {
      return extra.has(pc(midi)) ? "is-wrong" : "is-right";
    }
    return target.has(pc(midi)) && !on ? "is-hint" : "";
  };
  const keyProps = (midi: number) => ({
    type: "button" as const,
    "aria-pressed": notes.includes(midi),
    "aria-label": `${NAMES[pc(midi)]}${Math.floor(midi / 12) - 1}`,
    onClick: () => toggle(midi),
  });

  return (
    <div className="s-piano">
      <div className="s-chord-read" aria-live="polite">
        {notes.length ? notes.map((m) => NAMES[pc(m)]).join(" · ") : "—"}
      </div>
      <div className="s-keys" style={{ gridTemplateColumns: `repeat(${whites.length}, 1fr)` }}>
        {whites.map((midi) => (
          <button
            key={midi}
            className={`s-white ${notes.includes(midi) ? "is-on" : ""} ${tone(midi)}`}
            {...keyProps(midi)}
          >
            <span>{NAMES[pc(midi)]}</span>
          </button>
        ))}
        {blacks.map(({ midi, after }) => (
          <button
            key={midi}
            className={`s-black ${notes.includes(midi) ? "is-on" : ""} ${tone(midi)}`}
            style={{
              left: `calc(${(after / whites.length) * 100}% - ${100 / whites.length / 3}%)`,
              width: `${(100 / whites.length) * 0.66}%`,
            }}
            {...keyProps(midi)}
          />
        ))}
      </div>
      <div className="p-row">
        <button
          type="button"
          className="p-secondary p-small"
          disabled={!notes.length}
          onClick={() => {
            for (const m of notes) {
              note(m);
            }
          }}
        >
          <Icon name="play" /> {words.play}
        </button>
        <button
          type="button"
          className="p-link"
          disabled={!notes.length || result?.correct === true}
          onClick={() => setNotes([])}
        >
          {words.clear}
        </button>
      </div>
    </div>
  );
}
