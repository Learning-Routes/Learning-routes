import { describe, expect, it } from "vitest";
import { boardOf, movesFrom } from "../src/blocks/chess-moves";

// Platform STEP 12 PR 1: the squares the player highlights for the piece the creator made movable.
// No chess library: a small rule set for rook, queen, bishop, knight and king, from the FEN.

const MATE = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
const sorted = (squares: string[]) => [...squares].sort();

describe("the moves of a piece, from the FEN", () => {
  it("slides a rook until a piece blocks it", () => {
    expect(sorted(movesFrom(MATE, "a1"))).toEqual(
      sorted(["a2", "a3", "a4", "a5", "a6", "a7", "a8", "b1", "c1", "d1", "e1", "f1"]),
    );
  });

  it("lets a piece take an enemy piece but not its own", () => {
    // The white queen on d1 sees the black pawn on d7 and stops at it; the white king on e1 blocks.
    const moves = movesFrom("4k3/3p4/8/8/8/8/8/3QK3 w - - 0 1", "d1");
    expect(moves).toContain("d7");
    expect(moves).not.toContain("d8");
    expect(moves).not.toContain("e1");
    expect(moves).toContain("a4");
    expect(moves).toContain("h5");
  });

  it("moves a bishop on its diagonals, a knight in an L and a king one square", () => {
    // The black king on a1 can be taken; the white king on h1 is off the bishop's lines.
    expect(sorted(movesFrom("8/8/8/8/3B4/8/8/k6K w - - 0 1", "d4"))).toEqual(
      sorted(["a7", "b6", "c5", "e5", "f6", "g7", "h8", "c3", "b2", "a1", "e3", "f2", "g1"]),
    );
    expect(sorted(movesFrom("8/8/8/8/8/8/8/N6K w - - 0 1", "a1"))).toEqual(["b3", "c2"]);
    expect(sorted(movesFrom("8/8/8/8/8/8/8/K7 w - - 0 1", "a1"))).toEqual(["a2", "b1", "b2"]);
  });

  it("moves only the side to play, and has no moves for pawns or empty squares", () => {
    expect(movesFrom(MATE, "g8")).toEqual([]);
    expect(movesFrom(MATE, "f2")).toEqual([]);
    expect(movesFrom(MATE, "d4")).toEqual([]);
    expect(movesFrom("6k1/8/8/8/8/8/8/r5K1 b - - 0 1", "a1")).toContain("a8");
  });

  it("reads the board and refuses a FEN it cannot read", () => {
    expect(boardOf(MATE)?.squares.get("a1")).toBe("R");
    expect(boardOf(MATE)?.toMove).toBe("w");
    for (const fen of [
      "",
      "8/8/8 w",
      "9/8/8/8/8/8/8/8 w",
      "8/8/8/8/8/8/8/7X w",
      "8/8/8/8/8/8/8/8 x",
    ]) {
      expect(boardOf(fen)).toBeNull();
      expect(movesFrom(fen, "a1")).toEqual([]);
    }
  });
});
