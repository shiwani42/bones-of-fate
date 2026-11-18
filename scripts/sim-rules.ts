// Plays many AI-vs-AI games to sanity-check the rules and estimate match length.
// Run: node scripts/sim-rules.ts
import * as R from '../src/game/rules.ts';

const p = R.PATHS[0];
const uniq = new Set(p.map(([c, r]) => c * 100 + r));
console.log('path length', p.length, 'unique', uniq.size, 'HOME', R.HOME);
for (const [c, r] of p) if (!R.isBoardCell(c, r)) throw new Error(`off board ${c},${r}`);
for (let i = 1; i < p.length; i++) {
  const d = Math.max(Math.abs(p[i][0] - p[i - 1][0]), Math.abs(p[i][1] - p[i - 1][1]));
  if (d !== 1) throw new Error(`gap at ${i}`);
}
let throws = 0, wins = [0, 0], caps = 0;
const N = 2000;
for (let g = 0; g < N; g++) {
  const s = R.newGame();
  let guard = 0;
  while (s.winner === null && guard++ < 500) {
    const faces = R.honestThrow();
    throws++;
    const m = R.bestMove(s, s.turn, R.rollTotal(faces));
    caps += m.captures.length;
    R.applyMove(s, m, faces);
  }
  wins[s.winner!]++;
}
console.log('avg throws/game', (throws / N).toFixed(1), 'wins', wins, 'captures/game', (caps / N).toFixed(2));
const s = R.newGame();
console.log('loaded throw from start', R.loadedThrow(s, 0));

// Regression: the human (seat 0, falsy) winning must not pass the turn.
{
  const s = R.newGame();
  s.pos[0][0] = R.HOME - 3;
  const m = R.legalMoves(s, 0, 5).find((x) => x.piece === 0)!;
  const res = R.applyMove(s, m, [1, 2, 2]);
  if (res.winner !== 0 || s.turn !== 0 || res.extraTurn) throw new Error('seat-0 win passed the turn');
  console.log('seat-0 win keeps turn: ok');
}

// Whole matches with the director's cheating and penalties (19 Nov match-length fix).
// He cheats on his 2nd turn and 28% of turns (45% when behind); you catch `catchHim` of those.
// You cheat `youCheat` of your turns and get caught `caughtYou` of those. A catch sets the
// leading piece back (old: to START) and moves one of 8 gold stacks; captures move one too;
// a side with no gold loses. Compare the old penalty with the new one.
function match(penalty: (p: number) => number, catchHim: number, youCheat: number, caughtYou: number, goldEnds: boolean) {
  const s = R.newGame();
  const gold = [4, 4];
  let throws = 0, sTurns = 0;
  const lead = (seat: R.Seat) => Math.max(...s.pos[seat].map((p) => (p === R.START ? 0 : p + 1)));
  const give = (to: R.Seat) => { if (gold[1 - to] > 0) { gold[1 - to]--; gold[to]++; } };
  while (s.winner === null && throws < 2000) {
    throws++;
    const seat = s.turn;
    if (seat === 1) {
      sTurns++;
      const cheat = sTurns === 2 || Math.random() < (lead(1) < lead(0) ? 0.45 : 0.28);
      if (cheat && Math.random() < catchHim) {
        const l = R.leadingPiece(s, 1);
        s.pos[1][l] = penalty(s.pos[1][l]);
        give(0);
        s.turn = 0;
      } else {
        const faces = cheat ? R.loadedThrow(s, 1) : R.honestThrow();
        const m = R.bestMove(s, 1, R.rollTotal(faces));
        if (m.captures.length) give(1);
        R.applyMove(s, m, faces);
      }
    } else {
      const cheat = Math.random() < youCheat;
      if (cheat && Math.random() < caughtYou) {
        const l = R.leadingPiece(s, 0);
        s.pos[0][l] = penalty(s.pos[0][l]);
        give(1);
        R.passTurn(s);
      } else {
        const faces = cheat ? R.loadedThrow(s, 0) : R.honestThrow();
        const m = R.bestMove(s, 0, R.rollTotal(faces));
        if (m.captures.length) give(0);
        R.applyMove(s, m, faces);
      }
    }
    if (goldEnds && s.winner === null && (gold[0] === 0 || gold[1] === 0)) return { throws, by: 'gold' };
  }
  return { throws, by: s.winner === null ? 'none' : 'race' };
}
for (const [label, pen, goldEnds] of [
  ['old: back to START, no gold ending', () => R.START, false],
  ['new: back 12, gold ending', R.setBack, true],
] as const) {
  for (const [catchHim, youCheat, caughtYou] of [[0.5, 0.3, 0.3], [0.9, 0.6, 0.5]]) {
    const M = 1000;
    let sum = 0, long = 0, byGold = 0, worst = 0;
    for (let g = 0; g < M; g++) {
      const r = match(pen, catchHim, youCheat, caughtYou, goldEnds);
      sum += r.throws; worst = Math.max(worst, r.throws);
      if (r.throws > 60) long++;
      if (r.by === 'gold') byGold++;
    }
    console.log(`${label} | catch him ${catchHim}, you cheat ${youCheat} caught ${caughtYou}: avg ${(sum / M).toFixed(1)} throws, >60: ${(100 * long / M).toFixed(1)}%, worst ${worst}, by gold ${(100 * byGold / M).toFixed(0)}%`);
  }
}
{
  if (R.setBack(R.START) !== R.START || R.setBack(5) !== R.START || R.setBack(40) !== 40 - R.PENALTY_SQUARES) throw new Error('setBack');
  console.log('setBack: ok');
}
