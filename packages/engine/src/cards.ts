import type { Card, CardFace, Suit } from './types';
export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const RANK_LABEL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const face = (c: Card | CardFace): CardFace => ({ r: c.r, s: c.s });
export const faceStr = (c: CardFace) => RANK_LABEL[c.r] + c.s;
/** Parses "9H", "10s", "QC", "A♠", "k" (suit optional -> null suit = any). */
export function parseFace(str: string): { r: number; s: Suit | null } | null {
  const m = /^\s*(10|[2-9]|[AJQK1])\s*([SHDC♠♥♦♣])?\s*$/i.exec(str);
  if (!m) return null;
  const rs = m[1]!.toUpperCase();
  const r = rs === 'A' || rs === '1' ? 1 : rs === 'J' ? 11 : rs === 'Q' ? 12 : rs === 'K' ? 13 : Number(rs);
  const map: Record<string, Suit> = { S: 'S', H: 'H', D: 'D', C: 'C', '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C' };
  const s = m[2] ? map[m[2].toUpperCase()] ?? null : null;
  return { r, s };
}
export const powerOf = (r: number) => (r === 11 ? 'J' : r === 12 ? 'Q' : r === 10 ? '10' : null);
