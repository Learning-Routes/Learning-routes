import { useEffect, useState } from "react";
import { list, usePlayer } from "../shared";
import type { SimProps } from "./index";

// Ohm's law: a battery, a resistor and a bulb. Voltage and resistance on sliders; the current flows
// faster and the bulb glows brighter as it rises. Resistance moves on a log scale.

const STEPS = 100;

export default function Ohm({ sim, setState, result }: SimProps) {
  const { words, locale } = usePlayer();
  const [vlo, vhi] = list<number>(sim.v);
  const [rlo, rhi] = list<number>(sim.r);
  const target = Number(sim.target_amps ?? 1);
  const [v, setV] = useState(Math.round(((vlo ?? 0) + (vhi ?? 12)) / 2));
  const [k, setK] = useState(STEPS / 2);
  const r = Number(((rlo ?? 1) * ((rhi ?? 100) / (rlo ?? 1)) ** (k / STEPS)).toPrecision(3));
  const amps = v / r;

  useEffect(() => {
    setState({ v, r });
  }, [v, r, setState]);

  const glow = Math.min(1, amps / (target * 1.5));
  const speed = amps > 0 ? Math.max(0.3, 2.4 - glow * 2) : 0;
  const fmt = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 3 });
  return (
    <div className="s-ohm">
      <svg viewBox="0 0 320 170" className="s-circuit" aria-hidden="true">
        <rect
          x="30"
          y="25"
          width="260"
          height="120"
          rx="14"
          className={`s-wire ${speed ? "p-flow" : ""}`}
          style={{ animationDuration: `${speed}s` }}
        />
        <rect x="14" y="60" width="32" height="50" rx="5" className="s-battery" />
        <text x="30" y="90" textAnchor="middle" className="s-svg-label">
          {v}V
        </text>
        <path
          d="M120 145 l8 -10 l10 20 l10 -20 l10 20 l10 -20 l10 20 l8 -10"
          className="s-resistor"
        />
        <circle
          cx="290"
          cy="85"
          r="24"
          className="s-bulb"
          style={{
            opacity: 0.25 + glow * 0.75,
            filter: `drop-shadow(0 0 ${glow * 18}px var(--p-a))`,
          }}
        />
      </svg>
      <p className={`s-amps ${result?.correct ? "is-right" : ""}`} aria-live="polite">
        I = <b>{fmt(amps)}</b> A <small>· {fmt(target)} A</small>
      </p>
      <label className="s-dial">
        <span className="s-dial-head">
          <span className="p-label">{words.voltage}</span>
          <b>{fmt(v)} V</b>
        </span>
        <input
          type="range"
          className="p-range"
          min={vlo ?? 0}
          max={vhi ?? 12}
          step={1}
          value={v}
          onChange={(e) => setV(Number(e.target.value))}
        />
      </label>
      <label className="s-dial">
        <span className="s-dial-head">
          <span className="p-label">{words.resistance}</span>
          <b>{fmt(r)} Ω</b>
        </span>
        <input
          type="range"
          className="p-range"
          min={0}
          max={STEPS}
          step={1}
          value={k}
          aria-valuetext={`${fmt(r)} Ω`}
          onChange={(e) => setK(Number(e.target.value))}
        />
      </label>
    </div>
  );
}
