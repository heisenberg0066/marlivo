// Pure geometry & outfit logic for the 3D Orange waiter (sketch book v8 p22–27, W1–W6).
// Kept free of WebGL so vitest can verify that:
//  - outfits are picked at random (never a fixed cycle) from the full set of styles,
//  - the walking path stays on the terrace side of the hedge, outside the table and outside every seated player,
//  - every stop point sits in a gap between seats with clear reach to the cup / player / centre piles.
import type { Layout3, V3 } from '../layout3d';
import { TABLE_R, SEAT_DIST, FLOOR_Y } from '../sceneConfig';

export const WAITER_OUTFITS = ['full', 'suit', 'tie', 'plain', 'tuxedo'] as const;
export type WaiterOutfit = (typeof WAITER_OUTFITS)[number];

/** Picks an outfit at random on each visit (not in sequence). */
export function pickWaiterOutfit(rng: () => number = Math.random): WaiterOutfit {
  const idx = Math.floor(rng() * WAITER_OUTFITS.length) % WAITER_OUTFITS.length;
  return WAITER_OUTFITS[Math.max(0, idx)]!;
}

/** Kitchen door spawn at the bottom-left terrace edge (v8 p27). */
export const KITCHEN_DOOR: V3 = [-2.65, FLOOR_Y, 1.55];
/** Radius of the dashed walking loop around the table (outside chairs at ~1.35, inside stone rim at 2.38). */
export const LOOP_R = 1.64;
/** Radius when stepped into a gap between seats to pour tea / splash / present medal. */
export const STOP_R = 1.28;
/** Minimum allowed distance from the waiter to any seated character's root. */
export const CHAR_CLEAR_R = 0.44;
/** Hedge line z (waiter must never cross onto the badminton court z < HEDGE_Z). */
export const HEDGE_Z = -2.25;

export interface WaiterStop {
  id: 'A' | 'B' | 'C' | 'D';
  angle: number;
  loopPos: V3;
  standPos: V3;
  faceYaw: number;
}

const normAngle = (a: number) => {
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
};

/** Computes the 4 gap stop points (A = bottom-left, D = top-left, C = top-right, B = bottom-right)
 *  nudged away from any occupied seat in 2p, 3p or 4p so the waiter never collides with a seated player. */
export function computeWaiterStops(L: Layout3): Record<'A' | 'B' | 'C' | 'D', WaiterStop> {
  const occupied = Object.values(L.seats).map((s) => s.a);
  const base: { id: 'A' | 'B' | 'C' | 'D'; a: number }[] = [
    { id: 'A', a: -Math.PI * 0.25 },
    { id: 'D', a: -Math.PI * 0.75 },
    { id: 'C', a: Math.PI * 0.75 },
    { id: 'B', a: Math.PI * 0.25 },
  ];
  const out = {} as Record<'A' | 'B' | 'C' | 'D', WaiterStop>;
  for (const b of base) {
    // Search around the nominal gap angle for the angle with greatest angular clearance from occupied seats
    let bestA = b.a, bestClear = -1;
    for (let step = -12; step <= 12; step++) {
      const cand = normAngle(b.a + step * 0.035);
      const minDiff = occupied.reduce((m, sa) => Math.min(m, Math.abs(normAngle(cand - sa))), Math.PI);
      if (minDiff > bestClear + 1e-4) {
        bestClear = minDiff;
        bestA = cand;
      }
    }
    const sx = Math.sin(bestA), sz = Math.cos(bestA);
    out[b.id] = {
      id: b.id,
      angle: bestA,
      loopPos: [sx * LOOP_R, FLOOR_Y, sz * LOOP_R],
      standPos: [sx * STOP_R, FLOOR_Y, sz * STOP_R],
      faceYaw: bestA + Math.PI, // facing the table centre
    };
  }
  return out;
}

/** Picks the stop point closest to a target (x, z) (e.g. a seat's teacup or character). */
export function nearestStop(stops: Record<'A' | 'B' | 'C' | 'D', WaiterStop>, x: number, z: number): WaiterStop {
  let best = stops.A, bestD = Infinity;
  for (const s of Object.values(stops)) {
    const d = Math.hypot(s.standPos[0] - x, s.standPos[2] - z);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

/** Builds a smooth polyline along the safe terrace loop from startAngle to endAngle (clockwise via the kitchen side
 *  if shorter, staying on the terrace side z > HEDGE_Z and outside LOOP_R). */
export function arcWaypoints(fromAngle: number, toAngle: number, steps = 10): V3[] {
  let diff = normAngle(toAngle - fromAngle);
  const pts: V3[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = fromAngle + (diff * i) / steps;
    pts.push([Math.sin(a) * LOOP_R, FLOOR_Y, Math.cos(a) * LOOP_R]);
  }
  return pts;
}

/** Full waypoint list from KITCHEN_DOOR -> stop1 -> stop2 ... -> KITCHEN_DOOR. */
export function buildWaiterRoute(stops: WaiterStop[]): { pos: V3; pauseIdx?: number }[] {
  if (!stops.length) return [{ pos: KITCHEN_DOOR }];
  const route: { pos: V3; pauseIdx?: number }[] = [{ pos: KITCHEN_DOOR }];
  const entryA = -Math.PI * 0.25;
  route.push({ pos: [Math.sin(entryA) * LOOP_R, FLOOR_Y, Math.cos(entryA) * LOOP_R] });
  let curA = entryA;
  stops.forEach((st, idx) => {
    for (const p of arcWaypoints(curA, st.angle, 8).slice(1)) route.push({ pos: p });
    route.push({ pos: st.standPos, pauseIdx: idx });
    route.push({ pos: st.loopPos });
    curA = st.angle;
  });
  for (const p of arcWaypoints(curA, entryA, 8).slice(1)) route.push({ pos: p });
  route.push({ pos: KITCHEN_DOOR });
  return route;
}

/** Validates that a point (x, z) on the waiter's route never enters the table or hits the court. */
export function isSafeWaiterPoint(L: Layout3, x: number, z: number, atStop = false): boolean {
  const r = Math.hypot(x, z);
  if (r < (atStop ? TABLE_R + 0.22 : SEAT_DIST + 0.32)) return false;
  if (z < HEDGE_Z) return false;
  for (const c of Object.values(L.chars)) {
    if (Math.hypot(x - c.p[0], z - c.p[2]) < CHAR_CLEAR_R) return false;
  }
  return true;
}
