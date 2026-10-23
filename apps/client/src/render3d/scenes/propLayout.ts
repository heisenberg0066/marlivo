// Where the table props go (pure, unit-tested): each player's tea + sugar at their right hand, the gold-foil
// chocolate bar on the rim in a gap between two seats. Nothing ever enters a seat's keep-clear zone (its biggest
// card area + AREA_MARGIN) or the centre piles, and everything stays on the table (sketch book v8 p05).
import type { Layout3, V3 } from '../layout3d';
import { toWorld } from '../layout3d';
import { TABLE_R, CENTRE_CLEAR_R, AREA_MARGIN, TEA, CHOCO } from '../sceneConfig';
/** radius on the saucer where the sugar cubes sit (between the cup and the rim) */
export const SUGAR_R = 0.054;

export interface PropPlace { p: V3; yaw: number }
export interface PropLayout {
  /** per seat: the saucer centre (cup sits on it) */
  tea: Record<number, PropPlace>;
  /** per seat: three sugar cubes on the saucer (x, layer, z): layer 0 on the saucer, 1 stacked */
  sugar: Record<number, V3[]>;
  choco: PropPlace | null;
  /** circles (x, z, r) the arm-reach animation must not pass through (cups) */
  avoid: { x: number; z: number; r: number }[];
}

type Box = { cx: number; cz: number; yaw: number; hw: number; hh: number };
/** distance from a point to a rotated box (0 inside) */
function boxDist(b: Box, x: number, z: number) {
  const dx = x - b.cx, dz = z - b.cz, c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  // world -> box local (inverse of toWorld)
  const lx = dx * c - dz * s, ly = dx * s + dz * c;
  const qx = Math.max(Math.abs(lx) - b.hw, 0), qy = Math.max(Math.abs(ly) - b.hh, 0);
  return Math.hypot(qx, qy);
}

export function keepClearBoxes(L: Layout3): Box[] {
  return Object.values(L.maxAreas).map((a) => ({ cx: a.p[0], cz: a.p[2], yaw: a.yaw, hw: a.w / 2 + AREA_MARGIN, hh: a.h / 2 + AREA_MARGIN }));
}

/** clearance of a circle (x, z, r) against everything: >= 0 means it fits */
function clearance(boxes: Box[], taken: { x: number; z: number; r: number }[], x: number, z: number, r: number, rim = TABLE_R - 0.015) {
  let c = rim - (Math.hypot(x, z) + r);
  c = Math.min(c, Math.hypot(x, z) - r - CENTRE_CLEAR_R);
  for (const b of boxes) c = Math.min(c, boxDist(b, x, z) - r);
  for (const t of taken) c = Math.min(c, Math.hypot(x - t.x, z - t.z) - r - t.r - 0.01);
  return c;
}

export function propLayout(L: Layout3): PropLayout {
  const boxes = keepClearBoxes(L);
  const out: PropLayout = { tea: {}, sugar: {}, choco: null, avoid: [] };
  const taken: { x: number; z: number; r: number }[] = [];
  const seats = Object.entries(L.seats).map(([s, v]) => ({ seat: Number(s), a: v.a })).sort((a, b) => a.seat - b.seat);
  const R = TEA.saucerR + 0.012; // saucer + a little air
  for (const { seat, a } of seats) {
    // candidates in the owner's frame: x = their right, y = towards them. Prefer near their right hand.
    let best: { x: number; z: number; c: number; lx: number; ly: number } | null = null;
    for (let ly = 0.72; ly >= 0.3; ly -= 0.02) for (let lx = 0.44; lx <= 0.8; lx += 0.02) {
      const [x, z] = toWorld(a, 0, 0, lx, ly);
      const c = clearance(boxes, taken, x, z, R);
      // score: must fit; then prefer close to the owner (big ly) and close to their cards (small lx)
      const score = c >= 0 ? 10 + ly - (lx - 0.44) * 0.6 : c;
      if (!best || score > best.c) best = { x, z, c: score, lx, ly };
    }
    const b = best!;
    out.tea[seat] = { p: [b.x, 0, b.z], yaw: a };
    taken.push({ x: b.x, z: b.z, r: R });
    out.avoid.push({ x: b.x, z: b.z, r: TEA.saucerR + 0.02 });
    // sugar cubes: on the saucer, on the side away from the handle (two side by side, one stacked on top)
    const cubes: V3[] = [];
    for (const [deg, y] of [[150, 0], [205, 0], [178, 1]] as const) {
      const t = (deg * Math.PI) / 180, rr = SUGAR_R;
      const [x, z] = toWorld(a, b.x, b.z, Math.cos(t) * rr, Math.sin(t) * rr);
      cubes.push([x, y, z]);
    }
    out.sugar[seat] = cubes;
  }
  // chocolate: on the rim, in the gap that has most room (prefer the one next to me, seat at the bottom)
  const cr = Math.hypot(CHOCO.w, CHOCO.d) / 2;
  // First try with the bar's full bounding circle and a little extra air next to the saucers (QA 2026-10-23: with
  // 0.8 x the radius the bar could end up touching a saucer rim); fall back to the tighter fit only if nothing fits.
  let bestC: { x: number; z: number; c: number; ang: number } | null = null;
  for (const fit of [{ r: cr, air: 0.018 }, { r: cr * 0.8, air: 0 }]) {
    const near2 = taken.map((t) => ({ ...t, r: t.r + fit.air }));
    for (let i = 0; i < 144; i++) {
      const ang = (i / 144) * Math.PI * 2;
      for (const rr of [0.78, 0.74, 0.7, 0.66, 0.62]) {
        const x = Math.sin(ang) * rr, z = Math.cos(ang) * rr;
        const c = clearance(boxes, near2, x, z, fit.r);
        const near = Math.cos(ang - 0.8); // gentle preference for my right-front side
        const score = c >= 0 ? 10 + near * 0.5 + rr + Math.min(c, 0.04) * 3 : c;
        if (!bestC || score > bestC.c) bestC = { x, z, c: score, ang };
      }
    }
    if (bestC && bestC.c >= 10) break;
    bestC = null;
  }
  if (bestC) out.choco = { p: [bestC.x, 0, bestC.z], yaw: bestC.ang + Math.PI / 2 + 0.25 };
  return out;
}

/** exposed for tests */
export const _clearance = (L: Layout3, x: number, z: number, r: number) => clearance(keepClearBoxes(L), [], x, z, r);
