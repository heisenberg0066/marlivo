// Pure geometry & outfit logic for the 3D Orange waiter (sketch book v8 p22–27, W1–W6).
// Kept free of WebGL so vitest can verify that:
//  - outfits are picked at random (never a fixed cycle and never repeating the previous outfit when returning),
//  - pickRefillOrder visits EVERY active seated player's cup in circular order around the table perimeter,
//  - the walking path stays on the terrace side of the hedge, outside the table and outside every seated player,
//  - every stop point sits in a gap between seats with clear reach to the cup / player / centre piles.
import type { Layout3, V3 } from '../layout3d';
import { TABLE_R, SEAT_DIST, FLOOR_Y } from '../sceneConfig';

export const WAITER_OUTFITS = ['full', 'suit', 'tie', 'plain', 'tuxedo', 'chef'] as const;
export type WaiterOutfit = (typeof WAITER_OUTFITS)[number];

/** Picks an outfit at random on each visit, never repeating `prevOutfit` when provided. */
export function pickWaiterOutfit(
  rngOrPrev: (() => number) | WaiterOutfit = Math.random,
  prevOutfit?: WaiterOutfit,
): WaiterOutfit {
  const rng = typeof rngOrPrev === 'function' ? rngOrPrev : Math.random;
  const prev = typeof rngOrPrev === 'string' ? rngOrPrev : prevOutfit;
  const pool = prev ? WAITER_OUTFITS.filter((o) => o !== prev) : WAITER_OUTFITS;
  const idx = Math.floor(rng() * pool.length) % pool.length;
  return pool[Math.max(0, idx)]!;
}

/** Kitchen door / off-stage spawn on the left garden terrace path (in full view of the camera). */
export const KITCHEN_DOOR: V3 = [-2.35, FLOOR_Y, -1.65];
export const OFF_STAGE: V3 = [-2.35, FLOOR_Y, -1.65];
/** Radius of the dashed walking loop around the table (outside chairs at ~1.35, inside stone rim at 2.38). */
export const LOOP_R = 1.62;
/** Radius when stepped into a gap between seats to pour tea / splash / present medal. */
export const STOP_R = 1.34;
/** Minimum allowed distance from the waiter to any seated character's root. */
export const CHAR_CLEAR_R = 0.44;
/** Hedge line z (waiter must never cross onto the badminton court z < HEDGE_Z). */
export const HEDGE_Z = -2.25;
/** Seconds spent pouring tea at each player's cup and walking between adjacent seats. */
export const REFILL_POUR = 2.2;
export const REFILL_WALK = 2.3;
export const WAITER_BREAK_RANGE: readonly [number, number] = [7, 10];

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

/** Returns ALL active seats sorted in circular order around the table perimeter starting from the left terrace side
 *  (-PI * 0.65 -> top -> right -> bottom) so every player's cup is refilled one by one in full camera view. */
export function pickRefillOrder(L: Layout3, cupSeats?: number[]): number[] {
  const seats = cupSeats && cupSeats.length > 0 ? [...cupSeats] : Object.keys(L.seats).map(Number);
  const startRef = -Math.PI * 0.35;
  return seats.sort((sA, sB) => {
    const aA = L.seats[sA]?.a ?? 0;
    const aB = L.seats[sB]?.a ?? 0;
    const dA = ((startRef - aA) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const dB = ((startRef - aB) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    return dA - dB;
  });
}

/** Computes a safe standing stop right outside a specific seat's teacup, clear of every seated character
 *  and within the visible terrace frame (z <= 0.85 so he never walks behind the camera). */
export function cupStopForSeat(L: Layout3, seat: number, cupPos?: V3): WaiterStop {
  const seatAngle = L.seats[seat]?.a ?? 0;
  const rawCupAngle = cupPos ? Math.atan2(cupPos[0], cupPos[2]) : normAngle(seatAngle + 0.36);
  let bestA = rawCupAngle;
  let bestScore = -1e9;
  for (let step = -36; step <= 36; step++) {
    const cand = normAngle(rawCupAngle + step * 0.04);
    const sx = Math.sin(cand) * STOP_R;
    const sz = Math.cos(cand) * STOP_R;
    if (sz < HEDGE_Z + 0.08) continue;
    let minCharD = Infinity;
    for (const c of Object.values(L.chars)) {
      minCharD = Math.min(minCharD, Math.hypot(sx - c.p[0], sz - c.p[2]));
    }
    const cupD = cupPos ? Math.hypot(sx - cupPos[0], sz - cupPos[2]) : Math.abs(normAngle(cand - rawCupAngle));
    // Keep stops strictly inside the full head-to-toe camera frame (|sx| >= 0.88, sz in [-1.02, +0.28]) so he is never clipped by the bottom corners of the screen
    const flankBonus = (Math.abs(sx) >= 0.88 ? 65 : Math.abs(sx) >= 0.68 ? 25 : 0) + (sz <= 0.28 && sz >= -1.02 ? 140 : sz <= 0.45 ? 40 : -120);
    const clearBonus = minCharD >= CHAR_CLEAR_R + 0.06 ? 120 : minCharD >= CHAR_CLEAR_R + 0.01 ? 95 : minCharD * 40;
    const score = clearBonus + flankBonus - cupD * 24;
    if (score > bestScore) {
      bestScore = score;
      bestA = cand;
    }
  }
  const sx = Math.sin(bestA), sz = Math.cos(bestA);
  const standPos: V3 = [sx * STOP_R, FLOOR_Y, sz * STOP_R];
  const faceYaw = cupPos ? Math.atan2(cupPos[0] - standPos[0], cupPos[2] - standPos[2]) : bestA + Math.PI;
  return {
    id: 'A',
    angle: bestA,
    loopPos: [sx * LOOP_R, FLOOR_Y, sz * LOOP_R],
    standPos,
    faceYaw,
  };
}

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
      faceYaw: bestA + Math.PI,
    };
  }
  return out;
}

export function nearestStop(stops: Record<'A' | 'B' | 'C' | 'D', WaiterStop>, x: number, z: number): WaiterStop {
  let best = stops.A, bestD = Infinity;
  for (const s of Object.values(stops)) {
    const d = Math.hypot(s.standPos[0] - x, s.standPos[2] - z);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

export function arcWaypoints(fromAngle: number, toAngle: number, steps = 10): V3[] {
  const diff = normAngle(toAngle - fromAngle);
  const pts: V3[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = fromAngle + (diff * i) / steps;
    pts.push([Math.sin(a) * LOOP_R, FLOOR_Y, Math.cos(a) * LOOP_R]);
  }
  return pts;
}

export function buildWaiterRoute(stops: WaiterStop[]): { pos: V3; pauseIdx?: number }[] {
  if (!stops.length) return [{ pos: KITCHEN_DOOR }];
  const route: { pos: V3; pauseIdx?: number }[] = [{ pos: KITCHEN_DOOR }];
  const entryA = -Math.PI * 0.62;
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

export function isSafeWaiterPoint(L: Layout3, x: number, z: number, atStop = false): boolean {
  const r = Math.hypot(x, z);
  if (r < (atStop ? TABLE_R + 0.22 : SEAT_DIST + 0.32)) return false;
  if (z < HEDGE_Z) return false;
  for (const c of Object.values(L.chars)) {
    if (Math.hypot(x - c.p[0], z - c.p[2]) < CHAR_CLEAR_R) return false;
  }
  return true;
}
