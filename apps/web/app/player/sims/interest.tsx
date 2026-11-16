import { futureValue } from "@learning-routes/core/blocks/sim-numbers";
import { fill } from "@learning-routes/core/copy/player";
import { useEffect, useState } from "react";
import { usePlayer } from "../shared";
import type { SimProps } from "./sim-props";

// Saving every month: a slider for how much, the years as bars of what you put and what it earned,
// and the goal as a line.

export default function Interest({ sim, setState }: SimProps) {
  const { words, locale } = usePlayer();
  const min = Number(sim.min ?? 0);
  const max = Number(sim.max ?? 500);
  const step = Number(sim.step ?? 10);
  const rate = Number(sim.rate ?? 0.05);
  const years = Number(sim.years ?? 10);
  const goal = Number(sim.goal ?? 0);
  const currency = String(sim.currency ?? "$");
  const [monthly, setMonthly] = useState(Math.round((min + max) / 2 / step) * step);
  const money = (n: number) => `${currency}${Math.round(n).toLocaleString(locale)}`;

  useEffect(() => {
    setState({ monthly });
  }, [monthly, setState]);

  const total = futureValue(monthly, rate, years);
  const put = monthly * 12 * years;
  const top = Math.max(goal, futureValue(max, rate, years)) * 1.05;
  const bars = Array.from({ length: years }, (_, y) => ({
    value: futureValue(monthly, rate, y + 1),
    put: monthly * 12 * (y + 1),
  }));
  const reached = total >= goal;

  return (
    <div className="s-interest">
      <div className="s-figures">
        <div>
          <span className="p-label">{words.willHave}</span>
          <b className={reached ? "is-right" : ""}>{money(total)}</b>
        </div>
        <div>
          <span className="p-label">{words.youPut}</span>
          <b>{money(put)}</b>
        </div>
        <div>
          <span className="p-label">{words.interest}</span>
          <b className="s-accent">{money(total - put)}</b>
        </div>
      </div>
      <div className="s-chart" aria-hidden="true">
        <span className="s-goal" style={{ bottom: `${(goal / top) * 100}%` }}>
          <em>{money(goal)}</em>
        </span>
        {bars.map((bar, i) => (
          <span key={i} className="s-bar" style={{ height: `${(bar.value / top) * 100}%` }}>
            <i style={{ height: `${(bar.put / Math.max(bar.value, 1)) * 100}%` }} />
          </span>
        ))}
      </div>
      <p className={`p-note ${reached ? "p-soft" : ""}`} aria-live="polite">
        {reached ? words.goalReached : fill(words.goalMissing, { n: money(goal - total) })}
      </p>
      <label className="s-dial">
        <span className="s-dial-head">
          <span className="p-label">{words.monthly}</span>
          <b>{money(monthly)}</b>
        </span>
        <input
          type="range"
          className="p-range"
          min={min}
          max={max}
          step={step}
          value={monthly}
          aria-valuetext={money(monthly)}
          onChange={(event) => setMonthly(Number(event.target.value))}
        />
      </label>
    </div>
  );
}
