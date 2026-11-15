import {
  APERTURES,
  exposureOffset,
  ISOS,
  SHUTTERS,
} from "@learning-routes/core/blocks/sim-numbers";
import { useEffect, useState } from "react";
import { usePlayer } from "../shared";
import type { SimProps } from "./sim-props";

// A camera: aperture, shutter and ISO, and a scene that gets brighter, blurrier or grainier as they
// change. The meter shows the same offset the grader computes.

function Dial({
  label,
  help,
  values,
  at,
  onChange,
  show,
}: {
  label: string;
  help: string;
  values: readonly number[];
  at: number;
  onChange: (i: number) => void;
  show: (v: number) => string;
}) {
  return (
    <label className="s-dial">
      <span className="s-dial-head">
        <span className="p-label">{label}</span>
        <b>{show(values[at] ?? 0)}</b>
      </span>
      <input
        type="range"
        className="p-range"
        min={0}
        max={values.length - 1}
        step={1}
        value={at}
        aria-valuetext={show(values[at] ?? 0)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <small className="p-sub">{help}</small>
    </label>
  );
}

function Scene({
  offset,
  blur,
  aperture,
  iso,
}: {
  offset: number;
  blur: number;
  aperture: number;
  iso: number;
}) {
  const brightness = Math.max(0.15, Math.min(2.6, 2 ** (offset * 0.55)));
  return (
    <div className="s-scene" style={{ filter: `brightness(${brightness})` }} aria-hidden="true">
      <div
        className="s-scene-back"
        style={{ filter: `blur(${Math.max(0, 6 - aperture * 0.9)}px)` }}
      >
        <span className="s-sun" />
        <span className="s-hill" />
      </div>
      <span
        className="s-runner"
        style={{ filter: `blur(${blur}px)`, transform: `translateX(${blur * 1.5}px)` }}
      />
      <span
        className="s-grain"
        style={{ opacity: Math.min(0.5, (Math.log2(iso / 100) / 5) * 0.5) }}
      />
    </div>
  );
}

export default function Camera({ sim, setState, result }: SimProps) {
  const { words } = usePlayer();
  const [a, setA] = useState(3);
  const [s, setS] = useState(2);
  const [i, setI] = useState(0);
  const n = APERTURES[a] ?? 5.6;
  const t = SHUTTERS[s] ?? 125;
  const iso = ISOS[i] ?? 100;
  const minShutter = Number(sim.min_shutter ?? 0);
  // Positive: more light than the scene needs.
  const offset = -exposureOffset(Number(sim.scene_ev ?? 12), n, t, iso);
  const blur = minShutter && t < minShutter ? Math.min(8, (minShutter / t) * 2) : 0;

  useEffect(() => {
    setState({ aperture: a, shutter: s, iso: i });
  }, [a, s, i, setState]);

  const meter = Math.max(-2, Math.min(2, offset));
  const flag: Record<string, string> = {
    bright: words.tooBright,
    dark: words.tooDark,
    blur: words.blurry,
  };
  return (
    <div className="s-camera">
      <div className="s-viewfinder">
        <Scene offset={offset} blur={blur} aperture={n} iso={iso} />
        <div
          className="s-meter"
          role="img"
          aria-label={`${offset > 0 ? "+" : ""}${offset.toFixed(1)} EV`}
        >
          {[-2, -1, 0, 1, 2].map((m) => (
            <span key={m}>{m > 0 ? `+${m}` : m}</span>
          ))}
          <i
            className={Math.abs(offset) <= 0.5 ? "is-right" : ""}
            style={{ left: `${((meter + 2) / 4) * 100}%` }}
          />
        </div>
        {result && result.correct === false && typeof result.detail === "string" ? (
          <span className="s-flag">{flag[result.detail] ?? result.detail}</span>
        ) : null}
      </div>
      <div className="s-dials">
        <Dial
          label={words.aperture}
          help={words.apertureHelp}
          values={APERTURES}
          at={a}
          onChange={setA}
          show={(v) => `f/${v}`}
        />
        <Dial
          label={words.shutter}
          help={words.shutterHelp}
          values={SHUTTERS}
          at={s}
          onChange={setS}
          show={(v) => `1/${v}`}
        />
        <Dial
          label={words.iso}
          help={words.isoHelp}
          values={ISOS}
          at={i}
          onChange={setI}
          show={(v) => String(v)}
        />
      </div>
    </div>
  );
}
