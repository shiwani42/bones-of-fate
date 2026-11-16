/**
 * Progress between sessions (the "reason to come back"): the stakes climb the
 * way they do in the Sabha Parva, and a small ledger remembers your record.
 * localStorage only, wrapped in try/catch — private mode simply forgets.
 */

export const STAKES = [
  'a chest of gold',
  'the royal chariot',
  'a thousand elephants',
  'the army',
  'the treasury',
  'the kingdom of Indraprastha',
] as const;

export interface Ledger {
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  /** Index into STAKES of the stake currently being played for. */
  stake: number;
  cheatsLanded: number;
  timesCaught: number;
  shakuniCaught: number;
  matches: number;
}

const KEY = 'chausar.ledger.v1';

const fresh = (): Ledger => ({
  wins: 0,
  losses: 0,
  streak: 0,
  bestStreak: 0,
  stake: 0,
  cheatsLanded: 0,
  timesCaught: 0,
  shakuniCaught: 0,
  matches: 0,
});

export function loadLedger(): Ledger {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...(JSON.parse(raw) as Partial<Ledger>) };
  } catch {
    /* storage unavailable */
  }
  return fresh();
}

export function saveLedger(l: Ledger): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    /* storage unavailable */
  }
}

export const stakeName = (l: Ledger) => STAKES[Math.min(l.stake, STAKES.length - 1)];

/** Record a finished match; returns the line to show. */
export function recordMatch(l: Ledger, playerWon: boolean): string {
  l.matches++;
  if (playerWon) {
    l.wins++;
    l.streak++;
    l.bestStreak = Math.max(l.bestStreak, l.streak);
    const won = stakeName(l);
    if (l.stake < STAKES.length - 1) {
      l.stake++;
      saveLedger(l);
      return `You win back ${won}. Next time Shakuni wagers ${stakeName(l)}.`;
    }
    saveLedger(l);
    return `You hold ${won}. The whole court bows. Streak: ${l.streak}.`;
  }
  l.losses++;
  l.streak = 0;
  saveLedger(l);
  return `Shakuni keeps ${stakeName(l)}. Come back and win it.`;
}

export function ledgerLine(l: Ledger): string {
  if (!l.matches) return `Stake: ${stakeName(l)}`;
  return `Stake: ${stakeName(l)}   ·   Won ${l.wins} – Lost ${l.losses}   ·   Shakuni caught ${l.shakuniCaught}×`;
}
