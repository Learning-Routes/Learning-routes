import { useEffect, useState } from "react";
import { usePlayer } from "../shared";
import type { SimProps } from "./sim-props";

// A colour wheel of twelve hues: the base is marked; tap the colour the relation asks for.

function segment(i: number) {
  const a0 = ((i - 0.5) / 12) * Math.PI * 2 - Math.PI / 2;
  const a1 = ((i + 0.5) / 12) * Math.PI * 2 - Math.PI / 2;
  const [ro, ri] = [100, 52];
  const p = (a: number, r: number) =>
    `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
  return `M${p(a0, ri)} L${p(a0, ro)} A${ro} ${ro} 0 0 1 ${p(a1, ro)} L${p(a1, ri)} A${ri} ${ri} 0 0 0 ${p(a0, ri)} Z`;
}

export default function Wheel({ sim, setState, result }: SimProps) {
  const { words } = usePlayer();
  const base = Number(sim.base ?? 0);
  const [pick, setPick] = useState<number | null>(null);

  useEffect(() => {
    setState(pick === null ? null : { pick });
  }, [pick, setState]);

  return (
    <div className="s-wheel">
      <svg viewBox="-110 -110 220 220" className="s-wheel-svg" aria-label={words.colorBase}>
        {Array.from({ length: 12 }, (_, i) => {
          const marks = [
            i === base ? "is-base" : "",
            i === pick ? (result ? (result.correct ? "is-right" : "is-wrong") : "is-on") : "",
          ].join(" ");
          return (
            // biome-ignore lint/a11y/useSemanticElements: an SVG segment cannot be a <button>
            <path
              key={i}
              d={segment(i)}
              className={`s-hue ${marks}`}
              style={{ fill: `oklch(0.7 0.16 ${(i * 30 + 25) % 360})` }}
              role="button"
              tabIndex={0}
              aria-pressed={i === pick}
              aria-label={`${i * 30}°${i === base ? ` · ${words.colorBase}` : ""}`}
              onClick={() => !result?.correct && i !== base && setPick(i)}
              onKeyDown={(event) => {
                if ((event.key === " " || event.key === "Enter") && i !== base) {
                  event.preventDefault();
                  setPick(i);
                }
              }}
            />
          );
        })}
        <circle
          r="40"
          className="s-wheel-core"
          style={{ fill: `oklch(0.7 0.16 ${(base * 30 + 25) % 360})` }}
        />
      </svg>
      <div className="s-swatches" aria-hidden="true">
        <span style={{ background: `oklch(0.7 0.16 ${(base * 30 + 25) % 360})` }} />
        {pick !== null ? (
          <span
            className="p-pop"
            style={{ background: `oklch(0.7 0.16 ${(pick * 30 + 25) % 360})` }}
          />
        ) : (
          <span className="is-empty" />
        )}
      </div>
    </div>
  );
}
