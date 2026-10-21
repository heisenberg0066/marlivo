import type { Card, Rng, RoundState, SeatId, Slot } from './types';
import { randInt } from './rng';

export const MAX_ROW = 6;
export const slotId = (seat: SeatId, num: number) => `S${seat + 1}-${String(num).padStart(2, '0')}`;

/** A starting layout is a number of rows: 'r1' single line, 'r2' two rows (the default, §7.2), 'r3', 'r4'.
 *  Each player picks one before the match (v0.7); it is locked once play starts. */
export type LayoutId = 'r1' | 'r2' | 'r3' | 'r4';
export const DEFAULT_LAYOUT: LayoutId = 'r2';
/** Row lengths for n cards in k rows: the top rows take the extra card (5 → 3+2, 7 → 4+3). */
export function rowLengths(n: number, k: number): number[] {
  const out: number[] = []; let left = n;
  for (let i = 0; i < k; i++) { const len = Math.ceil(left / (k - i)); out.push(len); left -= len; }
  return out;
}
/** The layouts on offer for n cards: rows no longer than MAX_ROW, even rows (or 2 rows), never one card per row. */
export function layoutOptions(n: number): LayoutId[] {
  const out: LayoutId[] = [];
  for (const k of [1, 2, 3, 4]) {
    if (k >= n || Math.ceil(n / k) > MAX_ROW || Math.ceil(n / k) < 2) continue;
    if (k !== 2 && n % k !== 0) continue;
    out.push(`r${k}` as LayoutId);
  }
  return out;
}
export const validLayout = (n: number, id: string | undefined): LayoutId =>
  id && layoutOptions(n).includes(id as LayoutId) ? (id as LayoutId) : DEFAULT_LAYOUT;

/** Starting grid (§7.2) for n cards in the chosen layout (default 2 rows: 4 → 2×2, 5 → 3+2, 6 → 2×3, 7 → 4+3, 8 → 2×4). */
export function initialGrid(n: number, layout: string = DEFAULT_LAYOUT): { row: number; col: number }[] {
  const k = Number(validLayout(n, layout).slice(1));
  const out: { row: number; col: number }[] = [];
  rowLengths(n, k).forEach((len, row) => { for (let col = 0; col < len; col++) out.push({ row, col }); });
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
