import { useEffect, useState } from "react";
import type { SimProps } from "./index";

// A pie cut in equal parts: tap the parts to shade them.

function slice(i: number, parts: number, r: number) {
  const a0 = (i / parts) * Math.PI * 2 - Math.PI / 2;
  const a1 = ((i + 1) / parts) * Math.PI * 2 - Math.PI / 2;
  const [x0, y0, x1, y1] = [Math.cos(a0) * r, Math.sin(a0) * r, Math.cos(a1) * r, Math.sin(a1) * r];
  return `M0 0 L${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${parts === 1 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

export default function Pie({ sim, setState, result }: SimProps) {
  const parts = Number(sim.parts ?? 4);
  const [shaded, setShaded] = useState<number[]>([]);

  useEffect(() => {
    setState(shaded.length ? { parts: shaded } : null);
  }, [shaded, setState]);

  const toggle = (i: number) => {
    if (!result?.correct) {
      setShaded((now) => (now.includes(i) ? now.filter((p) => p !== i) : [...now, i]));
    }
  };
  const tone = result ? (result.correct ? "is-right" : "is-wrong") : "";

  return (
    <div className="s-pie">
      <svg
        viewBox="-110 -110 220 220"
        className={`s-pie-svg ${tone}`}
        aria-label={`${shaded.length} / ${parts}`}
      >
        {Array.from({ length: parts }, (_, i) => (
          // biome-ignore lint/a11y/useSemanticElements: an SVG slice cannot be a <button>
          <path
            key={i}
            d={slice(i, parts, 100)}
            className={shaded.includes(i) ? "is-on" : ""}
            role="button"
            tabIndex={0}
            aria-pressed={shaded.includes(i)}
            aria-label={`${i + 1}`}
            onClick={() => toggle(i)}
            onKeyDown={(event) => {
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                toggle(i);
              }
            }}
          />
        ))}
      </svg>
      <p className="s-fraction" aria-live="polite">
        <b>{shaded.length}</b>
        <span />
        <b>{parts}</b>
      </p>
    </div>
  );
}
