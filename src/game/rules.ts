/**
 * Chausar rules — pure logic, no three.js, no DOM. Unit-testable with node.
 *
 * Board: a cross of four 3x8 arms around a 3x3 centre (the char koni) on a
 * 19x19 grid. Column c runs left→right (x), row r runs far→near (z). The human
 * sits at the near arm (rows 11..18); Shakuni sits at the far arm.
 *
 * "Short chausar" for a ~3-minute match in VR (see docs/RESEARCH.md):
 *  - 3 long pasa dice, faces 1, 2, 5, 6; a throw moves ONE piece by the sum.
 *  - 2 pieces each. A piece runs one anticlockwise lap of the outer track,
 *    then up its own middle column into the char koni.
 *  - First player to bring ONE piece home wins.
 *  - Landing exactly on an opponent piece outside a safe square sends it back
 *    to start and earns another throw. A triple (all dice equal) earns
 *    another throw too.
 */

export type Seat = 0 | 1; // 0 = human (near arm), 1 = Shakuni (far arm)
export type Cell = readonly [c: number, r: number];

export const GRID = 19;
export const PIECES_PER_SEAT = 2;
export const PASA_FACES = [1, 2, 6, 5] as const; // order around the long axis; opposite faces sum to 7
export const START = -1;

function buildHumanPath(): Cell[] {
  const p: Cell[] = [];
  // Near arm, right column, travelling towards the centre.
  for (let r = 18; r >= 11; r--) p.push([10, r]);
  // Right arm: near row outward, tip, far row inward.
  for (let c = 11; c <= 18; c++) p.push([c, 10]);
  p.push([18, 9]);
  for (let c = 18; c >= 11; c--) p.push([c, 8]);
  // Far arm: right column outward, tip, left column inward.
  for (let r = 7; r >= 0; r--) p.push([10, r]);
  p.push([9, 0]);
  for (let r = 0; r <= 7; r++) p.push([8, r]);
  // Left arm: far row outward, tip, near row inward.
  for (let c = 7; c >= 0; c--) p.push([c, 8]);
  p.push([0, 9]);
  for (let c = 0; c <= 7; c++) p.push([c, 10]);
  // Near arm, left column outward, tip, then home up the middle column.
  for (let r = 11; r <= 18; r++) p.push([8, r]);
  p.push([9, 18]);
  for (let r = 17; r >= 11; r--) p.push([9, r]);
  return p;
}

const rotate = ([c, r]: Cell): Cell => [GRID - 1 - c, GRID - 1 - r];

export const PATHS: readonly (readonly Cell[])[] = (() => {
  const human = buildHumanPath();
  return [human, human.map(rotate)];
})();

/** Path index meaning "reached the char koni". */
export const HOME = PATHS[0].length; // 75

const key = (c: number, r: number) => c * 100 + r;

export const SAFE_CELLS: ReadonlySet<number> = new Set(
  (
    [
      [9, 18], [18, 9], [9, 0], [0, 9], // arm tips
      [8, 15], [10, 15], [15, 8], [15, 10], // castles
      [8, 3], [10, 3], [3, 8], [3, 10],
      [10, 18], [8, 0], // entry squares
    ] as Cell[]
  ).map(([c, r]) => key(c, r)),
);

export const isSafeCell = (cell: Cell) => SAFE_CELLS.has(key(cell[0], cell[1]));

export function isBoardCell(c: number, r: number): boolean {
  if (c < 0 || r < 0 || c >= GRID || r >= GRID) return false;
  const inMidCols = c >= 8 && c <= 10;
  const inMidRows = r >= 8 && r <= 10;
  return inMidCols || inMidRows;
}

export interface GameState {
  /** pos[seat][piece] = path index, START (-1) or HOME. */
  pos: number[][];
  turn: Seat;
  winner: Seat | null;
}

export function newGame(): GameState {
  return {
    pos: [
      Array(PIECES_PER_SEAT).fill(START),
      Array(PIECES_PER_SEAT).fill(START),
    ],
    turn: 0,
    winner: null,
  };
}

export function cloneState(s: GameState): GameState {
  return { pos: s.pos.map((a) => a.slice()), turn: s.turn, winner: s.winner };
}

export function cellOf(seat: Seat, index: number): Cell | null {
  if (index < 0 || index >= HOME) return null;
  return PATHS[seat][index];
}

export interface Move {
  seat: Seat;
  piece: number;
  from: number;
  to: number;
  /** Opponent piece captured by this move, if any. */
  captures: number[];
  reachesHome: boolean;
}

export function rollTotal(faces: readonly number[]): number {
  return faces.reduce((a, b) => a + b, 0);
}

export function isTriple(faces: readonly number[]): boolean {
  return faces.length === 3 && faces[0] === faces[1] && faces[1] === faces[2];
}

/** All distinct legal moves for `seat` with a throw totalling `steps`. */
export function legalMoves(s: GameState, seat: Seat, steps: number): Move[] {
  const moves: Move[] = [];
  const seen = new Set<number>();
  const opp = (1 - seat) as Seat;
  s.pos[seat].forEach((from, piece) => {
    if (from >= HOME) return;
    if (seen.has(from)) return; // two pieces on the same square: one choice
    seen.add(from);
    const to = Math.min(HOME, (from === START ? -1 : from) + steps);
    const captures: number[] = [];
    const cell = cellOf(seat, to);
    if (cell && !isSafeCell(cell)) {
      s.pos[opp].forEach((oi, op) => {
        const oc = cellOf(opp, oi);
        if (oc && oc[0] === cell[0] && oc[1] === cell[1]) captures.push(op);
      });
    }
    moves.push({ seat, piece, from, to, captures, reachesHome: to >= HOME });
  });
  return moves;
}

export interface MoveResult {
  extraTurn: boolean;
  winner: Seat | null;
}

/** Apply a move in place. `faces` decides the triple bonus. */
export function applyMove(
  s: GameState,
  m: Move,
  faces: readonly number[],
): MoveResult {
  const opp = (1 - m.seat) as Seat;
  s.pos[m.seat][m.piece] = m.to;
  for (const op of m.captures) s.pos[opp][op] = START;
  if (m.reachesHome) s.winner = m.seat;
  const over = s.winner !== null; // note: seat 0 is falsy, never test `!s.winner`
  const extraTurn = !over && (m.captures.length > 0 || isTriple(faces));
  if (!extraTurn && !over) s.turn = opp;
  return { extraTurn, winner: s.winner };
}

/** Pass the turn without moving (e.g. a forfeited throw). */
export function passTurn(s: GameState): void {
  s.turn = (1 - s.turn) as Seat;
}

/**
 * Penalties cost ground, not everything: sending a piece all the way back to
 * the start made matches loop (he cheats often and is easy to catch; a cheating
 * player gets caught often), so a catch sets the leading piece back this far.
 */
export const PENALTY_SQUARES = 12;

/** Where a caught piece falls back to (the start only if it was that close to it). */
export const setBack = (pos: number): number =>
  pos === START || pos - PENALTY_SQUARES < 0 ? START : pos - PENALTY_SQUARES;

/** Squares from `index` until home, for the leading-piece heuristics. */
export const remaining = (index: number) =>
  index >= HOME ? 0 : HOME - Math.max(index, -1);

/** The seat's piece closest to home (and not yet home). */
export function leadingPiece(s: GameState, seat: Seat): number {
  let best = 0;
  let bestPos = -Infinity;
  s.pos[seat].forEach((p, i) => {
    if (p < HOME && p > bestPos) {
      best = i;
      bestPos = p;
    }
  });
  return best;
}

/** How exposed a square is: number of opponent pieces 1..18 squares behind it. */
function danger(s: GameState, seat: Seat, index: number): number {
  const cell = cellOf(seat, index);
  if (!cell || isSafeCell(cell)) return 0;
  const opp = (1 - seat) as Seat;
  let d = 0;
  for (const oi of s.pos[opp]) {
    if (oi >= HOME) continue;
    for (let k = 3; k <= 18; k++) {
      const oc = cellOf(opp, (oi === START ? -1 : oi) + k);
      if (oc && oc[0] === cell[0] && oc[1] === cell[1]) {
        d++;
        break;
      }
    }
  }
  return d;
}

/** Heuristic value of a move — used by Shakuni and by the loaded dice. */
export function scoreMove(s: GameState, m: Move): number {
  let v = 0;
  if (m.reachesHome) v += 1000;
  v += m.captures.length * 120;
  const fromProgress = m.from === START ? 0 : m.from + 1;
  v += (m.to + 1 - fromProgress) * 1.5;
  v += (m.to / HOME) * 20; // prefer advancing the leader
  const cell = cellOf(m.seat, m.to);
  if (cell && isSafeCell(cell)) v += 12;
  v -= danger(s, m.seat, m.to) * 25;
  if (m.from >= 0) v += danger(s, m.seat, m.from) * 10; // escaping a threat
  return v;
}

export function bestMove(s: GameState, seat: Seat, steps: number): Move {
  const moves = legalMoves(s, seat, steps);
  let best = moves[0];
  let bestV = -Infinity;
  for (const m of moves) {
    const v = scoreMove(s, m);
    if (v > bestV) {
      bestV = v;
      best = m;
    }
  }
  return best;
}

/** Every ordered dice outcome (64 of them). */
export const ALL_THROWS: readonly (readonly number[])[] = (() => {
  const out: number[][] = [];
  for (const a of PASA_FACES)
    for (const b of PASA_FACES) for (const c of PASA_FACES) out.push([a, b, c]);
  return out;
})();

/**
 * Loaded dice: the throw that gives `seat` its best available move.
 * Ties are broken randomly so loaded throws don't look identical.
 */
export function loadedThrow(
  s: GameState,
  seat: Seat,
  rng: () => number = Math.random,
): number[] {
  let best: number[] = [6, 6, 6];
  let bestV = -Infinity;
  for (const t of ALL_THROWS) {
    const steps = rollTotal(t);
    const v =
      Math.max(...legalMoves(s, seat, steps).map((m) => scoreMove(s, m))) +
      (isTriple(t) ? -4 : 0) + // a triple is too obvious
      rng() * 6;
    if (v > bestV) {
      bestV = v;
      best = t.slice();
    }
  }
  return best;
}

export function honestThrow(rng: () => number = Math.random): number[] {
  return [0, 1, 2].map(() => PASA_FACES[Math.floor(rng() * 4)]);
}

/** Next face when a die is flipped a quarter turn (the "nudge" cheat). */
export function flipFace(face: number): number {
  const i = PASA_FACES.indexOf(face as (typeof PASA_FACES)[number]);
  return PASA_FACES[(i + 1) % 4];
}
