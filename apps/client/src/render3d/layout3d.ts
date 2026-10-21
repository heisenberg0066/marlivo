// World layout of the 3D table (metres-ish, table top at y = 0, the local player sits at +z looking towards -z).
// Pure functions of the view, so the scene, the hit-testing and the animation director always agree, and so it
// can be unit tested without WebGL. The slot grid comes from the same areaLayout() as 2D, so slot numbers and
// positions never shift when a card leaves (§16.2).
import type { PlayerView } from '@marlivo/engine';
import { areaLayout, pileSpot, seatPositions, type Anchor, type SeatPos } from '../render/geometry';

export type V3 = [number, number, number];
export interface Place3 { p: V3; yaw: number; w: number; h: number; tilt?: number }

export const TABLE_R = 1.0;
export const CARD_ME = { w: 0.142, h: 0.2 };
export const CARD_OPP = { w: 0.112, h: 0.157 };
export const CARD_T = 0.0016; // card thickness used for stacking

/** Seat direction angle (radians). 0 = me (towards the camera); the next player sits on my left (§4.6). */
export const SEAT_ANGLE: Record<SeatPos, number> = {
  bottom: 0,
  left: -Math.PI / 2,
  top: Math.PI,
  right: Math.PI / 2,
  // three players: one far-left, one far-right (as in the sketches)
  topLeft: -Math.PI * 0.72,
  topRight: Math.PI * 0.72,
};

interface AreaSpec { dist: number; maxW: number; maxH: number; card: { w: number; h: number } }
const AREA: Record<SeatPos, AreaSpec> = {
  bottom: { dist: 0.64, maxW: 0.86, maxH: 0.4, card: CARD_ME },
  top: { dist: 0.66, maxW: 0.7, maxH: 0.34, card: CARD_OPP },
  left: { dist: 0.68, maxW: 0.6, maxH: 0.32, card: CARD_OPP },
  right: { dist: 0.68, maxW: 0.6, maxH: 0.32, card: CARD_OPP },
  topLeft: { dist: 0.66, maxW: 0.56, maxH: 0.34, card: CARD_OPP },
  topRight: { dist: 0.66, maxW: 0.56, maxH: 0.34, card: CARD_OPP },
};

export const DECK: V3 = [-0.17, 0, 0.0];
export const PILE = { x: 0.16, z: 0, r: 0.12 };

/** local (x = owner's right, y = towards owner) → world (x, z) for a seat angle. */
export function toWorld(a: number, cx: number, cz: number, lx: number, ly: number): [number, number] {
  return [cx + lx * Math.cos(a) + ly * Math.sin(a), cz - lx * Math.sin(a) + ly * Math.cos(a)];
}
export const seatDir = (a: number): [number, number] => [Math.sin(a), Math.cos(a)];

export interface Layout3 {
  seats: Record<number, { pos: SeatPos; a: number }>;
  slots: Record<string, Place3 & { owner: number }>;
  areas: Record<number, Place3>;
  /** where each seat's held (drawn) card floats */
  hands: Record<number, Place3>;
  /** where each character sits */
  chars: Record<number, { p: V3; yaw: number }>;
  dice: Record<number, V3>;
  deck: Place3 & { count: number };
  pile: (i: number, key: string) => Place3;
}

export function layout3(view: PlayerView, large = false): Layout3 {
  const pos = seatPositions(view);
  const r = view.round;
  const k = large ? 1.12 : 1;
  const out: Layout3 = { seats: {}, slots: {}, areas: {}, hands: {}, chars: {}, dice: {}, deck: { p: [...DECK] as V3, yaw: 0.06, ...CARD_OPP, count: r?.deckCount ?? 0 }, pile: () => ({ p: [PILE.x, 0, PILE.z], yaw: 0, ...CARD_OPP }) };
  for (const [seatS, sp] of Object.entries(pos)) {
    const seat = Number(seatS);
    const a = SEAT_ANGLE[sp];
    const spec = AREA[sp];
    out.seats[seat] = { pos: sp, a };
    const [dx, dz] = seatDir(a);
    const cx = dx * spec.dist, cz = dz * spec.dist;
    const card = { w: spec.card.w * k, h: spec.card.h * k };
    const anchor: Anchor = { x: 0, y: 0, rot: 0, maxW: spec.maxW, maxH: spec.maxH, cw: card.w, ch: card.h };
    const slots = r?.areas[seat] ?? [];
    const L = areaLayout(slots, anchor);
    // areaLayout shrinks the grid to its box, so a big penalty pile never leaves the seat's part of the table.
    const s = L.scale;
    const depth = L.h * s;
    const ccx = cx, ccz = cz;
    out.areas[seat] = { p: [ccx, 0, ccz], yaw: a, w: Math.max(L.w * s, card.w), h: Math.max(depth, card.h) };
    for (const sv of slots) {
      const pl = L.places[sv.id]!;
      const [x, z] = toWorld(a, ccx, ccz, pl.x * s, pl.y * s);
      out.slots[sv.id] = { p: [x, CARD_T, z], yaw: a, w: card.w * s, h: card.h * s, owner: seat };
    }
    const handD = sp === 'bottom' ? TABLE_R - 0.05 : TABLE_R + 0.08;
    out.hands[seat] = { p: [dx * handD, sp === 'bottom' ? 0.2 : 0.36, dz * handD], yaw: a, ...card, tilt: sp === 'bottom' ? 0.5 : 1.25 };
    out.chars[seat] = { p: [dx * (TABLE_R + 0.3), 0, dz * (TABLE_R + 0.3)], yaw: a + Math.PI };
    out.dice[seat] = [dx * 0.34, 0, dz * 0.34];
  }
  const count = r?.deckCount ?? 0;
  out.deck = { p: [DECK[0], Math.max(1, count) * CARD_T * 0.6, DECK[2]], yaw: 0.06, ...CARD_OPP, count };
  out.pile = (i: number, key: string) => {
    const sp = pileSpot(i, key, { x: PILE.x, y: PILE.z, r: PILE.r });
    return { p: [sp.x, CARD_T * (1 + Math.min(i, 30) * 0.5), sp.y], yaw: (sp.rot * Math.PI) / 180, ...CARD_OPP };
  };
  return out;
}
