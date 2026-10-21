import type { Card, Rng, RoundState, SeatId, Slot } from './types';
import { randInt } from './rng';

export const MAX_ROW = 6;
export const slotId = (seat: SeatId, num: number) => `S${seat + 1}-${String(num).padStart(2, '0')}`;

/** Default starting layout (§7.2): 2 rows; 4 → 2×2, 5 → 3+2, 6 → 2×3, 7 → 4+3, 8 → 2×4. */
export function initialGrid(n: number): { row: number; col: number }[] {
  const top = Math.ceil(n / 2);
  const out: { row: number; col: number }[] = [];
  for (let i = 0; i < n; i++) out.push(i < top ? { row: 0, col: i } : { row: 1, col: i - top });
  return out;
}

export const readingOrder = (a: Slot, b: Slot) => a.row - b.row || a.col - b.col;

/**
 * Places one new card (penalty or 10-power) into a seat's area (§7.2, RESOLVED Q12):
 * first empty gap in reading order; otherwise a new slot at the end of a random row
 * (server-random, public); if every row is at max length, a new row starts.
 */
export function placeCard(round: RoundState, seat: SeatId, card: Card, rng: Rng): Slot {
  const slots = round.areas[seat]!;
  const gaps = slots.filter((s) => !s.card).sort(readingOrder);
  if (gaps.length) { gaps[0]!.card = card; return gaps[0]!; }
  const rows = new Map<number, number>();
  for (const s of slots) rows.set(s.row, Math.max(rows.get(s.row) ?? -1, s.col));
  const eligible = [...rows.entries()].filter(([, maxCol]) => maxCol + 1 < MAX_ROW).map(([r]) => r).sort((a, b) => a - b);
  let row: number, col: number;
  if (eligible.length) { row = eligible[randInt(rng, eligible.length)]!; col = rows.get(row)! + 1; }
  else { row = rows.size ? Math.max(...rows.keys()) + 1 : 0; col = 0; }
  const num = round.nextNum[seat]!;
  round.nextNum[seat] = num + 1;
  const slot: Slot = { id: slotId(seat, num), num, row, col, card };
  slots.push(slot);
  return slot;
}
