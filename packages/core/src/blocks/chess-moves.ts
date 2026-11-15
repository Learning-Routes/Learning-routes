// The squares a piece can reach, for chess_mate_in_one (Platform STEP 12): the schema checks the
// creator's solution against them, and the player highlights them. No chess library: rook, queen,
// bishop, knight and king only, without check, castling or en passant, which a mate in one the
// creator marks never needs.

const FILES = "abcdefgh";
const PIECES = /^[prnbqkPRNBQK]$/;
const SQUARE = /^[a-h][1-8]$/;

export interface Board {
  /** Square ("a1") to piece, FEN letters: upper case is white. */
  squares: Map<string, string>;
  toMove: "w" | "b";
}

const SPACES = /\s+/;

/** The board and the side to play, or null when the FEN is not one. */
export function boardOf(fen: string): Board | null {
  const [placement, toMove] = fen.trim().split(SPACES);
  const ranks = placement?.split("/") ?? [];
  if (ranks.length !== 8 || (toMove !== "w" && toMove !== "b")) {
    return null;
  }
  const squares = new Map<string, string>();
  const read = ranks.every((rank, index) => readRank(rank, 8 - index, squares));
  return read ? { squares, toMove } : null;
}

/** Puts one rank's pieces on the board; false when the rank is not eight squares of FEN. */
function readRank(rank: string, number: number, squares: Map<string, string>): boolean {
  let file = 0;
  for (const char of rank) {
    if (char >= "1" && char <= "8") {
      file += Number(char);
    } else if (PIECES.test(char) && file < 8) {
      squares.set(`${FILES[file]}${number}`, char);
      file += 1;
    } else {
      return false;
    }
  }
  return file === 8;
}

const LINES = {
  r: [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ],
  b: [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ],
} as const;
const KNIGHT = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
] as const;
const DIRECTIONS: Record<
  string,
  { steps: readonly (readonly [number, number])[]; slides: boolean }
> = {
  r: { steps: LINES.r, slides: true },
  b: { steps: LINES.b, slides: true },
  q: { steps: [...LINES.r, ...LINES.b], slides: true },
  n: { steps: KNIGHT, slides: false },
  k: { steps: [...LINES.r, ...LINES.b], slides: false },
};

const isWhite = (piece: string) => piece === piece.toUpperCase();

/** Where the piece on `from` can go, if it belongs to the side to play; [] otherwise. */
export function movesFrom(fen: string, from: string): string[] {
  const board = boardOf(fen);
  const piece = SQUARE.test(from) ? board?.squares.get(from) : undefined;
  const rule = piece ? DIRECTIONS[piece.toLowerCase()] : undefined;
  if (!(board && piece && rule) || isWhite(piece) !== (board.toMove === "w")) {
    return [];
  }
  return rule.steps.flatMap((step) => ray(board, piece, from, step, rule.slides));
}

/** The squares along one direction: up to a piece, which it may take if it is the other side's. */
function ray(
  board: Board,
  piece: string,
  from: string,
  [df, dr]: readonly [number, number],
  slides: boolean,
): string[] {
  const squares: string[] = [];
  let file = FILES.indexOf(from[0] as string) + df;
  let rank = Number(from[1]) + dr;
  while (file >= 0 && file < 8 && rank >= 1 && rank <= 8) {
    const square = `${FILES[file]}${rank}`;
    const there = board.squares.get(square);
    if (there === undefined || isWhite(there) !== isWhite(piece)) {
      squares.push(square);
    }
    if (there !== undefined || !slides) {
      break;
    }
    file += df;
    rank += dr;
  }
  return squares;
}
