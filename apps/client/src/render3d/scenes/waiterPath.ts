// Pure geometry, 60s-active / 60s-away cycle & outfit logic for the 3D Orange waiter (sketch book v8 p22–27, W1–W6).
// Kept free of WebGL so vitest can verify that:
//  - outfits rotate across all 6 styles per cycle (OUTFIT_ORDER[cycleIndex % OUTFIT_ORDER.length]) and pickWaiterOutfit
//    never repeats the previous outfit,
//  - the real-game waiter cycle is 60s ACTIVE cup-refill tour followed by 60s OFF-SCREEN break (120s period),
//  - pickRefillOrder visits EVERY active seated player's cup in circular order around the table perimeter,
//  - the walking path and stops stay strictly in the open outer stone patio corridors (STOP_R = 2.52, LOOP_R = 2.66,
//    |x| in [1.66, 1.82], z in [-1.90, -1.74]) on the patio floor (WAITER_FLOOR_Y = -0.42) with >140px horizontal and
//    >65px vertical screen-space separation from the tabletop rim and zero overlap with any seated character.
import type { Layout3, V3 } from '../layout3d';
import { TABLE_R, SEAT_DIST } from '../sceneConfig';

export const WAITER_OUTFITS = ['full', 'suit', 'tie', 'plain', 'tuxedo', 'chef'] as const;
export const OUTFIT_ORDER = WAITER_OUTFITS;
export type WaiterOutfit = (typeof WAITER_OUTFITS)[number];

/** Returns the deterministic outfit for a given 60s-active / 60s-away cycle index. */
export function waiterOutfitForCycle(cycleIndex: number): WaiterOutfit {
  const idx = ((Math.floor(cycleIndex) % OUTFIT_ORDER.length) + OUTFIT_ORDER.length) % OUTFIT_ORDER.length;
  return OUTFIT_ORDER[idx]!;
}

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

/** Stone patio floor height for the waiter's standing/walking plane (strictly below the tabletop y=0). */
export const WAITER_FLOOR_Y = -0.42;
/** Kitchen door / off-stage garden spawn on the outer left/right terrace path. */
export const KITCHEN_DOOR: V3 = [-1.92, WAITER_FLOOR_Y, -2.02];
export const KITCHEN_DOOR_R: V3 = [1.92, WAITER_FLOOR_Y, -2.02];
export const OFF_STAGE: V3 = [-1.92, WAITER_FLOOR_Y, -2.02];
/** Radius of the outer walking loop around the table & chairs on the wide stone patio. */
export const LOOP_R = 2.66;
/** Radius when standing in the open stone patio corridors (|x| ~ 1.68..1.79, z ~ -1.77..-1.88, >140px clear of tabletop & seats). */
export const STOP_R = 2.52;
/** Minimum allowed distance from the waiter to any seated character's root. */
export const CHAR_CLEAR_R = 0.52;
/** Hedge line z (waiter must never cross onto the badminton court z < HEDGE_Z). */
export const HEDGE_Z = -2.25;

/** Real-game waiter cycle: 60 seconds (1 minute) active cup-refill tour + 60 seconds (1 minute) off-screen break = 120s period. */
export const WAITER_ACTIVE_SEC = 60;
export const WAITER_AWAY_SEC = 60;
export const WAITER_CYCLE_SEC = WAITER_ACTIVE_SEC + WAITER_AWAY_SEC;

/** Seconds spent pouring tea at each player's cup and walking between adjacent seats (used for test/unit checks & relative pacing). */
export const REFILL_POUR = 2.2;
export const REFILL_WALK = 2.3;
export const WAITER_BREAK_RANGE: readonly [number, number] = [60, 60];

export interface WaiterCycleStatus {
  cycleIndex: number;
  active: boolean;
  /** 0..1 progress within the 60s active tour (or 0 when away). */
  progress: number;
  /** Seconds elapsed inside the current 120s cycle (0..120). */
  cycleTime: number;
  outfit: WaiterOutfit;
}

/** Pure evaluator for the alternating 60s active refill tour / 60s off-screen break cycle. */
export function evaluateWaiterCycle(elapsedSec: number, timeScale = 1): WaiterCycleStatus {
  const scaled = Math.max(0, elapsedSec * (timeScale > 0 ? timeScale : 1));
  const cycleIndex = Math.floor(scaled / WAITER_CYCLE_SEC);
  const cycleTime = scaled - cycleIndex * WAITER_CYCLE_SEC;
  const active = cycleTime < WAITER_ACTIVE_SEC;
  const progress = active ? Math.min(1, Math.max(0, cycleTime / WAITER_ACTIVE_SEC)) : 0;
  return {
    cycleIndex,
    active,
    progress,
    cycleTime,
    outfit: waiterOutfitForCycle(cycleIndex),
  };
}

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
 *  (-PI * 0.35 -> left -> top -> right -> bottom) so every player's cup is refilled one by one in full camera view. */
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

/** Computes a safe standing stop in the wide-open stone patio corridors (STOP_R = 2.52, |x| in [1.66, 1.80],
 *  z in [-1.89, -1.75]), giving >140px horizontal and >65px vertical separation from the tabletop rim. */
export function cupStopForSeat(L: Layout3, seat: number, cupPos?: V3): WaiterStop {
  const seatAngle = L.seats[seat]?.a ?? 0;
  const rawCupAngle = cupPos ? Math.atan2(cupPos[0], cupPos[2]) : normAngle(seatAngle + 0.36);
  const isLeft = cupPos ? cupPos[0] < -0.02 : Math.sin(rawCupAngle) <= 0;
  const isUpper = cupPos ? cupPos[2] < -0.35 && Math.abs(cupPos[0]) < 0.65 : Math.cos(seatAngle) < -0.5;
  const targetA = isLeft
    ? (isUpper ? -Math.PI * 0.768 : -Math.PI * 0.748)
    : (isUpper ? Math.PI * 0.768 : Math.PI * 0.748);

  let bestA = targetA;
  let bestScore = -1e9;
  for (let step = -8; step <= 8; step++) {
    const cand = normAngle(targetA + step * 0.005);
    const sx = Math.sin(cand) * STOP_R;
    const sz = Math.cos(cand) * STOP_R;
    if (sz < HEDGE_Z + 0.10 || sz > -1.70 || Math.abs(sx) < 1.64 || Math.abs(sx) > 1.84) continue;
    let minCharD = Infinity;
    for (const c of Object.values(L.chars)) {
      minCharD = Math.min(minCharD, Math.hypot(sx - c.p[0], sz - c.p[2]));
    }
    if (minCharD <= CHAR_CLEAR_R + 0.15) continue;
    const score = minCharD * 20 - Math.abs(cand - targetA) * 50;
    if (score > bestScore) {
      bestScore = score;
      bestA = cand;
    }
  }
  const sx = Math.sin(bestA), sz = Math.cos(bestA);
  const standPos: V3 = [sx * STOP_R, WAITER_FLOOR_Y, sz * STOP_R];
  const lx = sx * LOOP_R;
  const lz = Math.max(HEDGE_Z + 0.06, sz * LOOP_R);
  const faceYaw = cupPos ? Math.atan2(cupPos[0] - standPos[0], cupPos[2] - standPos[2]) : bestA + Math.PI;
  return {
    id: isLeft ? (isUpper ? 'D' : 'A') : (isUpper ? 'C' : 'B'),
    angle: bestA,
    loopPos: [lx, WAITER_FLOOR_Y, lz],
    standPos,
    faceYaw,
  };
}

/** Computes the 4 outer terrace stop points (A = mid-left, D = upper-left, C = upper-right, B = mid-right)
 *  at radius STOP_R = 2.52 in the wide-open stone patio corridors (|x| ~ 1.68..1.79, z ~ -1.77..-1.88). */
export function computeWaiterStops(L: Layout3): Record<'A' | 'B' | 'C' | 'D', WaiterStop> {
  const base: { id: 'A' | 'B' | 'C' | 'D'; a: number }[] = [
    { id: 'A', a: -Math.PI * 0.748 }, // [-1.79, -0.42, -1.77] open left stone patio corridor
    { id: 'D', a: -Math.PI * 0.768 }, // [-1.68, -0.42, -1.88] upper-left stone patio corridor
    { id: 'C', a: Math.PI * 0.768 },  // [+1.68, -0.42, -1.88] upper-right stone patio corridor
    { id: 'B', a: Math.PI * 0.748 },  // [+1.79, -0.42, -1.77] open right stone patio corridor
  ];
  const out = {} as Record<'A' | 'B' | 'C' | 'D', WaiterStop>;
  for (const b of base) {
    let bestA = b.a, bestScore = -1e9;
    for (let step = -6; step <= 6; step++) {
      const cand = normAngle(b.a + step * 0.005);
      const sx = Math.sin(cand) * STOP_R, sz = Math.cos(cand) * STOP_R;
      if (sz > -1.70 || sz < -1.96 || Math.abs(sx) < 1.64 || Math.abs(sx) > 1.84) continue;
      let minCharD = Infinity;
      for (const c of Object.values(L.chars)) {
        minCharD = Math.min(minCharD, Math.hypot(sx - c.p[0], sz - c.p[2]));
      }
      const clearBonus = minCharD >= CHAR_CLEAR_R + 0.2 ? 100 : minCharD * 40;
      const score = clearBonus - Math.abs(step) * 3;
      if (score > bestScore) {
        bestScore = score;
        bestA = cand;
      }
    }
    const sx = Math.sin(bestA), sz = Math.cos(bestA);
    out[b.id] = {
      id: b.id,
      angle: bestA,
      loopPos: [sx * LOOP_R, WAITER_FLOOR_Y, Math.max(HEDGE_Z + 0.06, sz * LOOP_R)],
      standPos: [sx * STOP_R, WAITER_FLOOR_Y, sz * STOP_R],
      faceYaw: bestA + Math.PI,
    };
  }
  return out;
}

export function nearestStop(stops: Record<'A' | 'B' | 'C' | 'D', WaiterStop>, x: number, z: number): WaiterStop {
  if (z > 0.25 && Math.abs(x) < 0.8) {
    return x < 0 ? stops.A : stops.B;
  }
  if (Math.abs(x) < 0.35 && z < -0.5) {
    return stops.B;
  }
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
    const x = Math.sin(a) * LOOP_R;
    const z = Math.max(HEDGE_Z + 0.06, Math.cos(a) * LOOP_R);
    pts.push([x, WAITER_FLOOR_Y, z]);
  }
  return pts;
}

export function buildWaiterRoute(stops: WaiterStop[]): { pos: V3; pauseIdx?: number }[] {
  if (!stops.length) return [{ pos: KITCHEN_DOOR }];
  const route: { pos: V3; pauseIdx?: number }[] = [{ pos: KITCHEN_DOOR }];
  const entryA = -Math.PI * 0.62;
  route.push({ pos: [Math.sin(entryA) * LOOP_R, WAITER_FLOOR_Y, Math.max(HEDGE_Z + 0.06, Math.cos(entryA) * LOOP_R)] });
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
  // Must stay strictly outside the chairs and table (r >= 1.88 at stops, r >= 2.05 on the outer loop)
  if (r < (atStop ? Math.max(1.88, SEAT_DIST + 0.65) : Math.max(2.05, TABLE_R + 1.05))) return false;
  if (z < HEDGE_Z) return false;
  for (const c of Object.values(L.chars)) {
    if (Math.hypot(x - c.p[0], z - c.p[2]) < CHAR_CLEAR_R) return false;
  }
  return true;
}
