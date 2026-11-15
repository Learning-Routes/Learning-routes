import { useEffect, useState } from "react";
import { list, obj, usePlayer } from "../shared";
import type { SimProps } from "./index";

// Balancing a chemical equation: a stepper per term, and a table of atoms on each side.

interface Term {
  formula: string;
  side: "left" | "right";
  atoms: Record<string, number>;
}

function count(terms: Term[], coefficients: number[], side: string) {
  const totals: Record<string, number> = {};
  terms.forEach((term, i) => {
    if (term.side === side) {
      for (const [element, n] of Object.entries(term.atoms)) {
        totals[element] = (totals[element] ?? 0) + n * (coefficients[i] ?? 1);
      }
    }
  });
  return totals;
}

export default function Equation({ sim, setState, result }: SimProps) {
  const { words } = usePlayer();
  const terms = list<Term>(sim.terms);
  const max = Number(sim.max ?? 6);
  const [coefficients, setCoefficients] = useState<number[]>(() => terms.map(() => 1));
  const left = count(terms, coefficients, "left");
  const right = count(terms, coefficients, "right");
  const elements = [...new Set([...Object.keys(left), ...Object.keys(right)])];
  const off = list<string>(obj(result?.detail).off);

  useEffect(() => {
    setState({ coefficients });
  }, [coefficients, setState]);

  const bump = (i: number, by: number) =>
    setCoefficients((now) => now.map((c, j) => (j === i ? Math.min(max, Math.max(1, c + by)) : c)));
  const lastLeft = terms.map((t) => t.side).lastIndexOf("left");

  return (
    <div className="s-equation">
      <div className="s-terms">
        {terms.map((term, i) => (
          <div key={i} className="s-term-wrap">
            <div className="s-term">
              <div className="s-stepper">
                <button type="button" aria-label="+" onClick={() => bump(i, 1)}>
                  +
                </button>
                <b>{coefficients[i]}</b>
                <button type="button" aria-label="−" onClick={() => bump(i, -1)}>
                  −
                </button>
              </div>
              <span className="s-formula">{term.formula}</span>
            </div>
            {i < terms.length - 1 ? (
              <span className="s-op">{i === lastLeft ? "→" : "+"}</span>
            ) : null}
          </div>
        ))}
      </div>
      <table className="s-atoms">
        <thead>
          <tr>
            <th>{words.element}</th>
            <th>{words.leftSide}</th>
            <th>{words.rightSide}</th>
          </tr>
        </thead>
        <tbody>
          {elements.map((element) => {
            const same = (left[element] ?? 0) === (right[element] ?? 0);
            return (
              <tr
                key={element}
                className={same ? "is-right" : off.includes(element) ? "is-wrong" : ""}
              >
                <th>{element}</th>
                <td>{left[element] ?? 0}</td>
                <td>{right[element] ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
