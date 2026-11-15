import { useEffect, useState } from "react";
import { list, obj, usePlayer } from "../shared";
import type { SimProps } from "./sim-props";

// Mate in one: the creator says which pieces may move. Tap one of them, then the square it goes to.

// One solid set for both sides, so a white piece reads as clearly as a black one.
const GLYPH: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const FILES = "abcdefgh";
const DIGIT = /\d/;

/** The FEN's board part as square → piece. */
function board(fen: string) {
  const out: Record<string, string> = {};
  fen.split("/").forEach((rank, row) => {
    let file = 0;
    for (const ch of rank) {
      if (DIGIT.test(ch)) {
        file += Number(ch);
      } else {
        out[`${FILES[file]}${8 - row}`] = ch;
        file++;
      }
    }
  });
  return out;
}

interface Marks {
  square: string;
  i: number;
  from: string | null;
  move: string | null;
  solution: string;
  result: SimProps["result"];
  movable: string[];
}

function moveTone(result: SimProps["result"]) {
  if (!result) {
    return "is-to";
  }
  return result.correct ? "is-right" : "is-wrong";
}

function marksOf({ square, i, from, move, solution, result, movable }: Marks) {
  return [
    (Math.floor(i / 8) + (i % 8)) % 2 === 1 ? "is-dark" : "",
    from === square ? "is-from" : "",
    move?.slice(2, 4) === square ? moveTone(result) : "",
    solution.slice(2, 4) === square && !result?.correct ? "is-hint" : "",
    movable.includes(square) && !result ? "is-movable" : "",
  ].join(" ");
}

export default function Chess({ sim, setState, result }: SimProps) {
  const { words } = usePlayer();
  const pieces = board(String(sim.fen ?? "8/8/8/8/8/8/8/8"));
  const movable = list<string>(sim.movable);
  const [from, setFrom] = useState<string | null>(null);
  const [move, setMove] = useState<string | null>(null);
  const solution = String(obj(result?.solution).move ?? "");

  useEffect(() => {
    setState(move ? { move } : null);
  }, [move, setState]);
  useEffect(() => {
    if (!result) {
      setMove(null);
      setFrom(null);
    }
  }, [result]);

  const tap = (square: string) => {
    if (result) {
      return;
    }
    if (movable.includes(square)) {
      setFrom(square);
      setMove(null);
    } else if (from) {
      setMove(`${from}${square}`);
    }
  };
  const shown = { ...pieces };
  if (move) {
    shown[move.slice(2, 4)] = pieces[move.slice(0, 2)] ?? "";
    delete shown[move.slice(0, 2)];
  }

  return (
    <div className="s-chess">
      <div className="s-board-8">
        {Array.from({ length: 64 }, (_, i) => {
          const square = `${FILES[i % 8]}${8 - Math.floor(i / 8)}`;
          const piece = shown[square];
          const marks = marksOf({ square, i, from, move, solution, result, movable });
          return (
            <button
              key={square}
              type="button"
              className={`s-sq ${marks}`}
              aria-label={`${square}${piece ? ` ${piece}` : ""}`}
              onClick={() => tap(square)}
            >
              {piece ? (
                <span className={piece === piece.toUpperCase() ? "s-white-piece" : "s-black-piece"}>
                  {GLYPH[piece.toLowerCase()]}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="p-sub" aria-live="polite">
        {from ? words.pieceChosen : words.pickPiece}
      </p>
    </div>
  );
}
