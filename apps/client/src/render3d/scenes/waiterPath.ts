// Pure path planning, gait timing and outfit logic for the 3D Orange waiter (sketch book v8 p22–27, W1–W6).
// No WebGL here, so vitest can check it. The waiter is a standing Orange guy on the terrace floor (FLOOR_Y). He
// works in shifts: a ~60 s shift walking round the WHOLE table on a ring behind the chairs, stopping beside every
// seated player to pour their tea, then he walks off through the kitchen exit (off-screen), takes a 60 s break and
// walks back in wearing the next outfit.
//
// Everything he does is a time-indexed plan of `walk` segments (polylines on the floor, walked at a constant calm
// pace with a short ease in/out) and `hold` segments (standing still, e.g. pouring). samplePlan(plan, t) gives his
// position, the distance walked so far (the leg cycle is driven by that distance, so feet never slide and he never
// steps in place) and the travel direction (he faces where he walks). The plan depends only on the layout and t,
// so real-time play and the deterministic animstep clock behave exactly the same.
import type { Layout3, V3 } from '../layout3d';
import { TABLE_R, FLOOR_Y, CHAR_SCALE, CHAIR_BACK } from '../sceneConfig';

export const WAITER_OUTFITS = ['full', 'suit', 'tie', 'plain', 'tuxedo', 'chef'] as const;
export const OUTFIT_ORDER = WAITER_OUTFITS;
export type WaiterOutfit = (typeof WAITER_OUTFITS)[number];

/** Outfit for the n-th shift: rotates through all 6, so two shifts in a row never share an outfit. */
export function waiterOutfitForCycle(cycleIndex: number): WaiterOutfit {
  const idx = ((Math.floor(cycleIndex) % OUTFIT_ORDER.length) + OUTFIT_ORDER.length) % OUTFIT_ORDER.length;
  return OUTFIT_ORDER[idx]!;
}

/** Picks an outfit at random, never repeating `prevOutfit` when provided. */
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

// ---- body & scene dimensions (world units, table top y = 0) ----
/** He stands on the real terrace floor. */
export const WAITER_FLOOR_Y = FLOOR_Y;
/** Height of the normalised orange-guy.glb inside his body group (outfits are modelled for this size). */
export const WAITER_MODEL_H = 0.8;
/** Standing height in the world (about as tall as the badminton Orange guys, head a little below the seated heads). */
export const WAITER_HEIGHT = 1.1;
export const WAITER_SCALE = WAITER_HEIGHT / WAITER_MODEL_H;
/** Footprint radius of his egg body incl. the tray / teapot held out at his sides (measured top-down). */
export const WAITER_BODY_R = 0.42;
/** Footprint radius of a seated character's body (round Orange guy / Mint / Ammar figures at CHAR_SCALE, incl. arms). */
export const SEATED_R = 0.36;
/** Garden chair footprint in the seat group's local frame (before CHAR_SCALE): seat box 0.48 x 0.44 centred on
 *  CHAIR_BACK, ladder back at CHAIR_BACK - 0.2 (props.tsx GardenChair), with 2 cm for the posts / cushion. */
export const CHAIR_HALF_X = 0.26;
export const CHAIR_Z0 = CHAIR_BACK - 0.245;
export const CHAIR_Z1 = CHAIR_BACK + 0.24;
/** Free space he always keeps between his body and any chair / seated player (walking and pouring). */
export const WALK_MARGIN = 0.25;
/** Walking ring, outside every chair and seated body by WAITER_BODY_R + WALK_MARGIN (and in front of the hedge). */
export const WALK_R = 2.55;
/** Kept for the old API: radius of the chair footprint and its centre behind the character root. */
export const CHAIR_R = Math.hypot(CHAIR_HALF_X, (CHAIR_Z1 - CHAIR_Z0) / 2) * CHAR_SCALE;
export const CHAIR_OFFSET = -((CHAIR_Z0 + CHAIR_Z1) / 2) * CHAR_SCALE;
/** Radius of the pour spots beside each player (body stays clear of the table rim at TABLE_R + 0.07). */
export const POUR_R = 1.56;
/** Kitchen exit: off-screen at the front-left of the terrace (inside the stone edge at r = 3.6). */
export const DOOR_R = 3.4;
export const DOOR_ANGLE = -1.25;
export const KITCHEN_DOOR: V3 = [Math.sin(DOOR_ANGLE) * DOOR_R, WAITER_FLOOR_Y, Math.cos(DOOR_ANGLE) * DOOR_R];
/** He walks round the table clockwise seen from above (left side -> far side -> right side -> my side). */
export const WALK_DIR = -1;
/** Hedge line z (he never goes towards the badminton court beyond it). */
export const HEDGE_Z = -2.25;

/** Calm walking pace (world units / s) and the ease in / ease out time of every walk. */
export const WALK_SPEED = 0.35;
export const WALK_SPEED_RANGE: readonly [number, number] = [0.32, 0.37];
export const WALK_EASE = 0.5;
/** Turning on the spot before walking off from a cup: seconds = TURN_BASE + TURN_PER_RAD * angle. */
export const TURN_BASE = 0.25;
export const TURN_PER_RAD = 0.35;
/** Pour at each cup: min / preferred / max seconds standing still. */
export const POUR_MIN = 3.0;
export const POUR_PREF = 4.2;
export const POUR_MAX = 5.2;

/** Shift / break cycle. */
export const WAITER_ACTIVE_SEC = 60;
export const WAITER_AWAY_SEC = 60;
export const WAITER_CYCLE_SEC = WAITER_ACTIVE_SEC + WAITER_AWAY_SEC;

export interface WaiterCycleStatus { cycleIndex: number; active: boolean; progress: number; cycleTime: number; outfit: WaiterOutfit }
/** Pure evaluator of the nominal 60 s shift / 60 s break cycle (used for the outfit order and by tests). */
export function evaluateWaiterCycle(elapsedSec: number, timeScale = 1): WaiterCycleStatus {
  const scaled = Math.max(0, elapsedSec * (timeScale > 0 ? timeScale : 1));
  const cycleIndex = Math.floor(scaled / WAITER_CYCLE_SEC);
  const cycleTime = scaled - cycleIndex * WAITER_CYCLE_SEC;
  const active = cycleTime < WAITER_ACTIVE_SEC;
  return { cycleIndex, active, progress: active ? Math.min(1, cycleTime / WAITER_ACTIVE_SEC) : 0, cycleTime, outfit: waiterOutfitForCycle(cycleIndex) };
}

// ---- geometry helpers ----
type P2 = [number, number];
const TAU = Math.PI * 2;
export const normAngle = (a: number) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
/** Angle round the table of a floor point (0 = towards the camera / my seat, +PI/2 = right). */
export const angleOf = (x: number, z: number) => Math.atan2(x, z);
const onRing = (a: number, r: number): P2 => [Math.sin(a) * r, Math.cos(a) * r];

/** Measured floor footprints (scripts/waiter-footprints.mjs: real skinned vertices of every seated group - figure,
 *  chair, backpack, props - and of the waiter with tray + teapot, walking and pouring, +2 cm). Max distance from the
 *  root per 10-degree bin; angle 0 = the way the seat / the waiter faces, counter-clockwise seen from above like yaw. */
export const SEAT_PROFILE = [0.35, 0.41, 0.47, 0.47, 0.47, 0.45, 0.39, 0.32, 0.35, 0.4, 0.37, 0.32, 0.38, 0.37, 0.37, 0.36, 0.3, 0.31, 0.31, 0.32, 0.36, 0.37, 0.33, 0.33, 0.34, 0.4, 0.39, 0.32, 0.37, 0.43, 0.45, 0.43, 0.44, 0.44, 0.27, 0.27] as const;
export const WAITER_PROFILE = [0.42, 0.41, 0.41, 0.42, 0.56, 0.64, 0.64, 0.63, 0.51, 0.48, 0.49, 0.43, 0.56, 0.56, 0.42, 0.41, 0.41, 0.4, 0.4, 0.4, 0.41, 0.41, 0.56, 0.56, 0.43, 0.47, 0.49, 0.53, 0.65, 0.69, 0.7, 0.69, 0.65, 0.58, 0.42, 0.41] as const;
const NB = 36;
/** Local boundary points (bin edges and centres) of a star-shaped profile. */
const ring = (prof: readonly number[]) => { const out: P2[] = []; for (let b = 0; b < NB; b++) for (const f of [0, 0.5]) { const a = ((b + f) / NB) * TAU; out.push([Math.sin(a) * prof[b]!, Math.cos(a) * prof[b]!]); } return out; };
const SEAT_PTS = ring(SEAT_PROFILE), WAITER_PTS = ring(WAITER_PROFILE);
const SEAT_MAX = Math.max(...SEAT_PROFILE), WAITER_MAX = Math.max(...WAITER_PROFILE);
const profAt = (prof: readonly number[], a: number) => prof[Math.floor((((a % TAU) + TAU) % TAU) / TAU * NB) % NB]!;

export interface Obstacle { kind: 'seat'; x: number; z: number; yaw: number; seat: number; r: number }
/** One obstacle per seat: the measured footprint of the figure + chair (+ backpack etc.) at its real root and yaw. */
export function waiterObstacles(L: Layout3): Obstacle[] {
  return Object.entries(L.chars).map(([s, c]) => ({ kind: 'seat' as const, x: c.p[0], z: c.p[2], yaw: c.yaw, seat: Number(s), r: SEAT_MAX }));
}
const toWorld = (pts: P2[], x: number, z: number, yaw: number): P2[] => { const c = Math.cos(yaw), sn = Math.sin(yaw); return pts.map(([px, pz]) => [x + px * c + pz * sn, z - px * sn + pz * c]); };
const inside = (prof: readonly number[], ox: number, oz: number, yaw: number, x: number, z: number) => { const dx = x - ox, dz = z - oz; return Math.hypot(dx, dz) < profAt(prof, Math.atan2(dx, dz) - yaw); };
/** Free distance between the waiter's footprint (at x, z facing yaw) and one seat's footprint (negative = overlap). */
export function obstacleDist(o: Obstacle, x: number, z: number, yaw = 0): number {
  const cd = Math.hypot(x - o.x, z - o.z);
  if (cd > SEAT_MAX + WAITER_MAX + 0.6) return cd - SEAT_MAX - WAITER_MAX;
  const wp = toWorld(WAITER_PTS, x, z, yaw), sp = toWorld(SEAT_PTS, o.x, o.z, o.yaw);
  let d = Infinity;
  for (const a of wp) { if (inside(SEAT_PROFILE, o.x, o.z, o.yaw, a[0], a[1])) return -0.01; for (const b of sp) d = Math.min(d, Math.hypot(a[0] - b[0], a[1] - b[1])); }
  for (const b of sp) if (inside(WAITER_PROFILE, x, z, yaw, b[0], b[1])) return -0.01;
  return d;
}
/** Fast (search) version: radial gaps between the two star-shaped footprints (accurate to ~1 cm near the closest point). */
export function obstacleDistFast(o: Obstacle, x: number, z: number, yaw: number): number {
  const cd = Math.hypot(x - o.x, z - o.z);
  if (cd > SEAT_MAX + WAITER_MAX + 0.6) return cd - SEAT_MAX - WAITER_MAX;
  let d = Infinity;
  for (const [px, pz] of toWorld(WAITER_PTS, x, z, yaw)) { const dx = px - o.x, dz = pz - o.z; d = Math.min(d, Math.hypot(dx, dz) - profAt(SEAT_PROFILE, Math.atan2(dx, dz) - o.yaw)); }
  for (const [px, pz] of toWorld(SEAT_PTS, o.x, o.z, o.yaw)) { const dx = px - x, dz = pz - z; d = Math.min(d, Math.hypot(dx, dz) - profAt(WAITER_PROFILE, Math.atan2(dx, dz) - yaw)); }
  return d;
}
export const fastClear = (obs: Obstacle[], x: number, z: number, yaws: number[]) => {
  let c = Math.hypot(x, z) - (TABLE_R + 0.07) - WAITER_BODY_R;
  for (const o of obs) { if (Math.hypot(x - o.x, z - o.z) > SEAT_MAX + WAITER_MAX + c + 0.01) continue; for (const y of yaws) c = Math.min(c, obstacleDistFast(o, x, z, y)); }
  return c;
};
const ALL_YAWS = Array.from({ length: 16 }, (_, i) => (i / 16) * TAU);
/** Free distance between the waiter (at x, z facing yaw; worst heading if yaw is omitted) and the nearest seat or the
 *  table rim (his body circle must stay off the table). */
export function waiterClearance(obs: Obstacle[], x: number, z: number, yaw?: number): number {
  let c = Math.hypot(x, z) - (TABLE_R + 0.07) - WAITER_BODY_R;
  const yaws = yaw === undefined ? Array.from({ length: 12 }, (_, i) => (i / 12) * TAU) : [yaw];
  for (const o of obs) for (const y of yaws) c = Math.min(c, obstacleDist(o, x, z, y));
  return c;
}
/** Headings he takes at a plan sample (walking: travel direction; standing: the cup, plus the turns in / out). */
function planPoses(plan: WaiterPlan, step: number, visit: (x: number, z: number, yaw: number) => void) {
  const segs = plan.segs;
  for (let i = 0; i < segs.length; i++) {
    const sg = segs[i]!;
    if (sg.k === 'walk') { for (let s = 0; s <= sg.poly.len + 1e-9; s += step) { const p = polyAt(sg.poly, s); visit(p.x, p.z, Math.atan2(p.hx, p.hz)); } continue; }
    const face = Math.atan2(sg.face[0] - sg.at[0], sg.face[1] - sg.at[1]);
    const turns: number[] = [face];
    const prev = segs[i - 1], next = segs[i + 1];
    if (prev?.k === 'walk') { const e = polyAt(prev.poly, prev.poly.len); turns.push(Math.atan2(e.hx, e.hz)); }
    if (next?.k === 'walk') { const e = polyAt(next.poly, 0); turns.push(Math.atan2(e.hx, e.hz)); }
    for (const h of [prev, next]) if (h?.k === 'hold') turns.push(Math.atan2(h.face[0] - h.at[0], h.face[1] - h.at[1]));
    for (const t of turns.slice(1)) { const d = normAngle(t - face); for (let k = 0; k <= 8; k++) visit(sg.at[0], sg.at[1], face + (d * k) / 8); }
    visit(sg.at[0], sg.at[1], face);
  }
}
/** Per seat: the smallest free distance between his footprint and that seat's footprint along a plan. */
export function seatClearances(L: Layout3, plan: WaiterPlan, step = 0.02): Record<number, number> {
  const obs = waiterObstacles(L);
  const out: Record<number, number> = {};
  planPoses(plan, step, (x, z, yaw) => { for (const o of obs) out[o.seat] = Math.min(out[o.seat] ?? Infinity, obstacleDist(o, x, z, yaw)); });
  return out;
}

export interface WaiterStop {
  seat: number;
  /** angle of the seated character round the table */
  seatAngle: number;
  angle: number;
  standPos: V3;
  /** where he looks while pouring (the cup) */
  face: V3;
}

/** The pour spot for one seat: beside the player, as close to them as the chairs allow. */
export function behindSomeone(L: Layout3, x: number, z: number, lim = 0.45): boolean {
  for (const ch of Object.values(L.chars)) {
    const sx = x - ch.p[0], sz = z - ch.p[2], d = Math.hypot(sx, sz);
    if (d > 1.7) continue;
    if ((sx * -Math.sin(ch.yaw) + sz * -Math.cos(ch.yaw)) / d > lim) return true;
  }
  return false;
}
export function cupStopForSeat(L: Layout3, seat: number, cupPos?: V3, obs = waiterObstacles(L)): WaiterStop {
  const c = L.chars[seat]?.p ?? [0, 0, TABLE_R + 0.22] as V3;
  const sa = angleOf(c[0], c[2]);
  const cup = cupPos ?? ([Math.sin(sa) * 0.7, 0, Math.cos(sa) * 0.7] as V3);
  // beside the player (in the gap next to them, never behind their back), as close to their cup as the measured
  // footprints allow; side players prefer the side further from the camera (my seat, angle 0) so the pour is on screen
  let side0 = Math.sign(normAngle(angleOf(cup[0], cup[2]) - sa)) || 1;
  if (Math.abs(sa) > 0.35 && Math.abs(sa) < 2.6) side0 = Math.sign(sa);
  const need = WALK_MARGIN + 0.04;
  let best: { a: number; r: number; score: number } | null = null;
  for (const lim of [0.45, 0.6, 0.75, 0.9]) {
  if (best) break;
  for (const side of [side0, -side0]) {
    for (let d = 0.25; d <= 1.6; d += 0.02) {
      const a = sa + side * d;
      for (let r = TABLE_R + 0.07 + WAITER_BODY_R + 0.02; r <= WALK_R + 1e-9; r += 0.04) {
        const [x, z] = onRing(a, r);
        if (z <= HEDGE_Z + 0.05) continue;
        // his own player is the nearest one (he is beside them, not beside a neighbour)
        const own = Math.hypot(x - c[0], z - c[2]);
        if (Object.entries(L.chars).some(([k, o]) => Number(k) !== seat && Math.hypot(x - o.p[0], z - o.p[2]) < own - 0.02)) continue;
        const score = Math.hypot(x - cup[0], z - cup[2]) + 0.5 * own + (side === side0 ? 0 : 0.2);
        if (best && score >= best.score) continue;
        // never behind anyone's back: off the line straight back from every nearby seat by more than 60 degrees
        if (behindSomeone(L, x, z, lim)) continue;
        // standing there turning between the way in, the cup and the way out (any heading)
        if (fastClear(obs, x, z, ALL_YAWS) < need) continue;
        // the radial step in from / out to the walking ring (facing in or out)
        let ok = true;
        const yin = Math.atan2(-x, -z), yout = yin + Math.PI;
        for (let q = r; q <= WALK_R + 1e-9 && ok; q += 0.04) { const [qx, qz] = onRing(a, q); if (fastClear(obs, qx, qz, [yin, yout]) < WALK_MARGIN + 0.015) ok = false; }
        if (ok) best = { a, r, score };
        break; // a larger radius at the same angle is only further from the cup
      }
    }
  }
  }
  const b = best ?? { a: sa + side0 * 0.6, r: WALK_R };
  const [x, z] = onRing(b.a, b.r);
  return { seat, seatAngle: sa, angle: normAngle(b.a), standPos: [x, WAITER_FLOOR_Y, z], face: [cup[0], 0, cup[2]] };
}

/** All seats in the order he meets them walking round from the kitchen exit (WALK_DIR). */
export function pickRefillOrder(L: Layout3, cupSeats?: number[]): number[] {
  const seats = cupSeats && cupSeats.length > 0 ? [...cupSeats] : Object.keys(L.seats).map(Number);
  const key = (s: number) => {
    const c = L.chars[s]?.p;
    const a = c ? angleOf(c[0], c[2]) : L.seats[s]?.a ?? 0;
    return ((WALK_DIR * (a - DOOR_ANGLE)) % TAU + TAU) % TAU;
  };
  return seats.sort((a, b) => key(a) - key(b));
}

// ---- polylines ----
export interface Poly { pts: P2[]; cum: number[]; len: number }
export function makePoly(pts: P2[]): Poly {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  return { pts, cum, len: cum[cum.length - 1]! };
}
/** Chaikin corner rounding with fixed end points (keeps the start / end spots exact). */
function smooth(pts: P2[], iters = 3): P2[] {
  let p = pts;
  for (let k = 0; k < iters; k++) {
    if (p.length < 3) return p;
    const q: P2[] = [p[0]!];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i]!, b = p[i + 1]!;
      if (i > 0) q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      if (i < p.length - 2) q.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    q.push(p[p.length - 1]!);
    p = q;
  }
  return p;
}
export function polyAt(poly: Poly, s: number): { x: number; z: number; hx: number; hz: number } {
  const { pts, cum } = poly;
  if (pts.length === 1) return { x: pts[0]![0], z: pts[0]![1], hx: 0, hz: 1 };
  s = Math.min(poly.len, Math.max(0, s));
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m]! <= s) lo = m; else hi = m; }
  const a = pts[lo]!, b = pts[hi]!, segL = cum[hi]! - cum[lo]! || 1;
  const t = (s - cum[lo]!) / segL;
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, hx: (b[0] - a[0]) / segL, hz: (b[1] - a[1]) / segL };
}

/** Floor route from one spot to another: out to the walking ring, round it (in `dir`, or the short way when dir = 0),
 *  and in again. Points further out than the ring (the kitchen exit) join it with a short diagonal. */
export function routeBetween(from: P2, to: P2, dir: number = WALK_DIR): Poly {
  const a0 = angleOf(from[0], from[1]), a1 = angleOf(to[0], to[1]);
  const r0 = Math.hypot(from[0], from[1]), r1 = Math.hypot(to[0], to[1]);
  let da = normAngle(a1 - a0);
  if (dir !== 0) { da = ((dir * (a1 - a0)) % TAU + TAU) % TAU * dir; if (Math.abs(da) < 1e-6) da = 0; }
  const pts: P2[] = [from];
  // diagonal joins from / to the exit (they look like a natural walk-in), radial steps from / to the pour spots
  const join0 = r0 > WALK_R + 0.3 ? Math.sign(da || 1) * 0.28 : 0;
  const join1 = r1 > WALK_R + 0.3 ? Math.sign(da || 1) * 0.28 : 0;
  const s0 = a0 + join0, s1 = a1 - join1;
  let span = da - join0 - join1;
  if (Math.abs(da) > 1e-6 && Math.sign(span) !== Math.sign(da)) span = 0;
  if (Math.abs(r0 - WALK_R) > 0.02 || join0) pts.push(onRing(s0, WALK_R));
  const n = Math.max(1, Math.ceil(Math.abs(span) / 0.06));
  for (let i = 1; i < n; i++) pts.push(onRing(s0 + (span * i) / n, WALK_R));
  if (Math.abs(r1 - WALK_R) > 0.02 || join1) pts.push(onRing(s0 + span, WALK_R));
  pts.push(to);
  // drop duplicates
  const clean: P2[] = [];
  for (const p of pts) if (!clean.length || Math.hypot(p[0] - clean[clean.length - 1]![0], p[1] - clean[clean.length - 1]![1]) > 1e-4) clean.push(p);
  return makePoly(smooth(clean));
}

// ---- plans ----
export type PlanSeg =
  | { k: 'walk'; t0: number; dur: number; poly: Poly; v: number; d0: number }
  | { k: 'hold'; t0: number; dur: number; at: P2; face: P2; tag: string; seat?: number; d0: number };
export interface WaiterPlan { segs: PlanSeg[]; total: number; walked: number }

/** Distance covered after tau seconds of a walk of length len and duration dur (trapezoid speed profile). */
export function walkDist(len: number, dur: number, tau: number): { s: number; v: number } {
  if (len <= 0 || dur <= 0) return { s: 0, v: 0 };
  const ta = Math.min(WALK_EASE, dur / 2);
  const vmax = len / (dur - ta);
  tau = Math.min(dur, Math.max(0, tau));
  if (tau < ta) return { s: (vmax * tau * tau) / (2 * ta), v: (vmax * tau) / ta };
  if (tau > dur - ta) { const r = dur - tau; return { s: len - (vmax * r * r) / (2 * ta), v: (vmax * r) / ta }; }
  return { s: vmax * (tau - ta / 2), v: vmax };
}
const walkTime = (len: number, v: number) => (len <= 1e-6 ? 0 : len / v + WALK_EASE);

class PlanBuilder {
  segs: PlanSeg[] = []; t = 0; d = 0; at: P2;
  constructor(start: P2) { this.at = start; }
  walk(to: P2, v: number, dir = WALK_DIR) {
    const poly = routeBetween(this.at, to, dir);
    // standing at a cup facing it: first turn calmly on the spot towards the way out (no quick shuffle)
    const last = this.segs[this.segs.length - 1];
    if (poly.len > 1e-4 && last?.k === 'hold') {
      const h0 = Math.atan2(last.face[0] - last.at[0], last.face[1] - last.at[1]);
      const e = polyAt(poly, Math.min(0.05, poly.len));
      const turn = Math.abs(normAngle(Math.atan2(e.hx, e.hz) - h0));
      if (turn > 0.5) this.hold(TURN_BASE + turn * TURN_PER_RAD, [this.at[0] + e.hx, this.at[1] + e.hz], 'turn');
    }
    if (poly.len > 1e-4) { const dur = walkTime(poly.len, v); this.segs.push({ k: 'walk', t0: this.t, dur, poly, v, d0: this.d }); this.t += dur; this.d += poly.len; }
    this.at = to;
    return this;
  }
  hold(dur: number, face: P2, tag: string, seat?: number) {
    if (dur > 0) { this.segs.push({ k: 'hold', t0: this.t, dur, at: this.at, face, tag, seat, d0: this.d }); this.t += dur; }
    return this;
  }
  done(): WaiterPlan { return { segs: this.segs, total: this.t, walked: this.d }; }
}

const xz = (v: V3): P2 => [v[0], v[2]];
const DOOR2: P2 = xz(KITCHEN_DOOR);
/** Leaving for the exit: keep walking round in WALK_DIR, unless the exit is (almost) right behind him. */
function exitDir(from: P2): number {
  const a0 = angleOf(from[0], from[1]), a1 = DOOR_ANGLE - WALK_DIR * 0.28;
  const arc = ((WALK_DIR * (a1 - a0)) % TAU + TAU) % TAU;
  return arc > Math.PI + 0.3 ? 0 : WALK_DIR;
}
const exitRoute = (from: P2) => routeBetween(from, DOOR2, exitDir(from));

/** The work shift: walk in from the exit, go round the table pouring every player's tea (a second round of
 *  top-ups if the minute allows), walk out through the exit. Pour time and pace (within calm limits) are tuned so
 *  the whole shift lasts `budget` seconds. */
export function buildShiftPlan(L: Layout3, cups: Record<number, { p: V3 }>, budget = WAITER_ACTIVE_SEC): WaiterPlan & { stops: WaiterStop[]; pour: number; speed: number } {
  const obs = waiterObstacles(L);
  // visit the pour spots in the order he meets them walking round from the exit
  const entryA = DOOR_ANGLE + WALK_DIR * 0.28;
  const key = (a: number) => ((WALK_DIR * (a - entryA)) % TAU + TAU) % TAU;
  const stops = Object.keys(cups).map(Number).map((s) => cupStopForSeat(L, s, cups[s]?.p, obs)).sort((a, b) => key(a.angle) - key(b.angle));
  if (!stops.length) return { ...new PlanBuilder(DOOR2).done(), stops, pour: 0, speed: WALK_SPEED };
  // walking lengths of a route that visits k stops (wrapping round the table) then exits
  const lengths = (k: number) => {
    const legs: number[] = [];
    let at = DOOR2;
    for (let i = 0; i < k; i++) { const st = xz(stops[i % stops.length]!.standPos); legs.push(routeBetween(at, st).len); at = st; }
    legs.push(exitRoute(at).len);
    return legs;
  };
  const timeOf = (k: number, v: number, pour: number) => lengths(k).reduce((t, l) => t + walkTime(l, v), 0) + k * pour;
  let k = stops.length;
  while (k < stops.length * 3 && timeOf(k + 1, WALK_SPEED_RANGE[1], POUR_MIN) <= budget) k++;
  const legs = lengths(k);
  const walkLen = legs.reduce((a, b) => a + b, 0);
  const walkAt = (v: number) => legs.reduce((t, l) => t + walkTime(l, v), 0);
  let pour = Math.min(POUR_MAX, Math.max(POUR_MIN, (budget - walkAt(WALK_SPEED)) / k));
  // pace that fills the rest of the minute
  const walkBudget = budget - k * pour;
  const easeT = legs.filter((l) => l > 1e-6).length * WALK_EASE;
  let v = walkBudget > easeT ? walkLen / (walkBudget - easeT) : WALK_SPEED_RANGE[1];
  v = Math.min(WALK_SPEED_RANGE[1], Math.max(WALK_SPEED_RANGE[0], v));
  // any time still left goes back into the pours (capped), the rest is spent off-screen
  const rest = budget - walkAt(v) - k * pour;
  if (rest > 0) pour = Math.min(POUR_MAX, pour + rest / k);
  const b = new PlanBuilder(DOOR2);
  for (let i = 0; i < k; i++) {
    const st = stops[i % stops.length]!;
    b.walk(xz(st.standPos), v).hold(pour, xz(st.face), 'pour', st.seat);
  }
  b.walk(DOOR2, v, exitDir(b.at));
  return { ...b.done(), stops, pour, speed: v };
}

/** A short event visit (medal, cheer, shuffle, wave): from `start` (the exit, or wherever he is) to the spot, the
 *  action, and back to `end` (the exit, or the spot he left so the shift can carry on seamlessly). */
export function buildEventPlan(start: P2, spot: P2, face: P2, actionSec: number, tag: string, end: P2 = start, seat?: number): WaiterPlan {
  return new PlanBuilder(start).walk(spot, WALK_SPEED, 0).hold(actionSec, face, tag, seat).walk(end, WALK_SPEED, 0).done();
}

export interface PlanSample {
  x: number; z: number;
  /** current ground speed and total distance walked since the plan started (drives the leg cycle) */
  speed: number; dist: number;
  moving: boolean;
  /** travel direction (unit, floor) while walking, or the look-at direction while standing */
  hx: number; hz: number;
  seg: number; tag: string | null; holdU: number; seat?: number;
}
export function samplePlan(plan: WaiterPlan, t: number): PlanSample {
  const segs = plan.segs;
  if (!segs.length) return { x: DOOR2[0], z: DOOR2[1], speed: 0, dist: 0, moving: false, hx: 0, hz: 1, seg: -1, tag: null, holdU: 0 };
  let i = segs.length - 1;
  for (let j = 0; j < segs.length; j++) if (t < segs[j]!.t0 + segs[j]!.dur) { i = j; break; }
  const sg = segs[i]!;
  const tau = Math.min(sg.dur, Math.max(0, t - sg.t0));
  if (sg.k === 'walk') {
    const { s, v } = walkDist(sg.poly.len, sg.dur, tau);
    const p = polyAt(sg.poly, s);
    return { x: p.x, z: p.z, speed: v, dist: sg.d0 + s, moving: v > 1e-4, hx: p.hx, hz: p.hz, seg: i, tag: null, holdU: 0 };
  }
  const fx = sg.face[0] - sg.at[0], fz = sg.face[1] - sg.at[1], fl = Math.hypot(fx, fz) || 1;
  return { x: sg.at[0], z: sg.at[1], speed: 0, dist: sg.d0, moving: false, hx: fx / fl, hz: fz / fl, seg: i, tag: sg.tag, holdU: tau / sg.dur, seat: sg.seat };
}

/** Checks a plan: every sampled floor point keeps his body clear of the table, the chairs and the seated players. */
export function planClearance(L: Layout3, plan: WaiterPlan, step = 0.05): number {
  const obs = waiterObstacles(L);
  let worst = Infinity;
  planPoses(plan, step, (x, z, yaw) => { worst = Math.min(worst, waiterClearance(obs, x, z, yaw)); });
  return worst;
}

// ---- walking gait (pure; units = the waiter's body space, i.e. the normalised 0.80-high model) ----
/** Rest geometry of one leg in body space: thigh / shin lengths, their rest angles (radians forward of straight
 *  down) and where the ankle sits relative to the hip joint. */
export interface LegGeom { l1: number; l2: number; t0: number; s0: number; depth: number; fwd: number }
export function legGeomFrom(hip: V3, knee: V3, ankle: V3): LegGeom {
  const ang = (a: V3, b: V3) => Math.atan2(b[2] - a[2], -(b[1] - a[1]));
  const len = (a: V3, b: V3) => Math.hypot(b[1] - a[1], b[2] - a[2]);
  return { l1: len(hip, knee), l2: len(knee, ankle), t0: ang(hip, knee), s0: ang(knee, ankle), depth: hip[1] - ankle[1], fwd: ankle[2] - hip[2] };
}
/** Walking (not running): a foot is on the ground 60 % of the cycle (both feet 20 %), no flight phase, the thigh
 *  swings about +-26 deg, the foot clears the floor by a few cm. */
export const GAIT = { duty: 0.6, hipMax: 0.45, lift: 0.022, reach: 0.985 } as const;
/** Body-space distance the body travels per full gait cycle (two steps): 2 x leg length x STRIDE_K, a calm walk
 *  (about 1.6-1.9 steps / s at WALK_SPEED_RANGE for his short legs). */
export const STRIDE_K = 0.65;
export const strideOf = (g: LegGeom) => 2 * (g.l1 + g.l2) * STRIDE_K;
/** Gait cycles per second for a walking speed (world units / s): cadence is constant, the stride shortens when
 *  he speeds up or slows down at the ends of a walk, so a planted foot never slides. */
export const cadenceOf = (g: LegGeom, speed: number) => speed / (strideOf(g) * WAITER_SCALE);

const hermite = (p0: number, m0: number, p1: number, m1: number, w: number, T: number) => {
  const w2 = w * w, w3 = w2 * w;
  return (2 * w3 - 3 * w2 + 1) * p0 + (w3 - 2 * w2 + w) * T * m0 + (-2 * w3 + 3 * w2) * p1 + (w3 - w2) * T * m1;
};
/** Ankle target relative to the body's straight-down position for cycle position c (0..1, 0 = heel strike):
 *  forward offset f and lift above the floor. stride = body travel per cycle (body space). */
export function footPath(c: number, stride: number): { f: number; lift: number; stance: boolean; u: number } {
  const B = GAIT.duty;
  c = ((c % 1) + 1) % 1;
  if (c < B) return { f: stride * (B / 2 - c), lift: 0, stance: true, u: c / B };
  const w = (c - B) / (1 - B), T = 1 - B;
  // the foot leaves and meets the floor at zero ground speed (relative speed = -stride per cycle at both ends)
  const f = hermite(-stride * B / 2, -stride, stride * B / 2, -stride, w, T);
  return { f, lift: GAIT.lift * (0.5 - 0.5 * Math.cos(2 * Math.PI * w)) * Math.min(1, stride / 0.05 + 0.2), stance: false, u: w };
}
/** Two-bone leg IK in the sagittal plane: ankle at (fwd, down) from the hip. Returns the bone deltas from rest
 *  (hipPitch: thigh forward, kneeBend: shin back) and whether the target was out of reach. */
export function legIK(g: LegGeom, fwd: number, down: number): { hipPitch: number; kneeBend: number; thigh: number; shin: number; clamped: boolean } {
  const L = g.l1 + g.l2;
  let d = Math.hypot(fwd, down);
  const clamped = d > L * 0.9995;
  d = Math.min(d, L * 0.9995);
  const phi = Math.atan2(fwd, down);
  const cosA = (g.l1 * g.l1 + d * d - g.l2 * g.l2) / (2 * g.l1 * d);
  const cosB = (g.l2 * g.l2 + d * d - g.l1 * g.l1) / (2 * g.l2 * d);
  const thigh = phi + Math.acos(Math.min(1, Math.max(-1, cosA))); // knee bends forward, like a person
  const shin = phi - Math.acos(Math.min(1, Math.max(-1, cosB)));
  const hipPitch = thigh - g.t0;
  return { hipPitch, kneeBend: g.s0 + hipPitch - shin, thigh, shin, clamped };
}
export interface LegPose { hipPitch: number; kneeBend: number; footPitch: number }
/** Full walking pose for cycle position `cyc` (left leg; the right leg is half a cycle later) and stride amount
 *  `amt` (0 = standing, 1 = full calm stride). bodyY = how far the hips dip (body space, <= 0). */
export function walkPose(g: LegGeom, cyc: number, amt: number): { L: LegPose; R: LegPose; bodyY: number; armSwing: number; footL: ReturnType<typeof footPath>; footR: ReturnType<typeof footPath> } {
  amt = Math.min(1, Math.max(0, amt));
  const stride = strideOf(g) * amt;
  const reach = (g.l1 + g.l2) * GAIT.reach;
  const fmax = (stride * GAIT.duty) / 2;
  const high = Math.min(g.depth, reach);
  // the foot path is centred under the hip while walking (at rest the ankle sits g.fwd ahead of it)
  const fwd0 = g.fwd * (1 - amt);
  const low = Math.sqrt(Math.max(0, reach * reach - (Math.abs(fwd0) + fmax) ** 2));
  const dip = Math.max(0, high - low);
  // hips lowest at the double-support moments (both feet down, legs apart), back up at mid-stance
  const depth = high - dip * (0.5 + 0.5 * Math.cos(4 * Math.PI * (cyc - 0.05)));
  const one = (c: number): [LegPose, ReturnType<typeof footPath>] => {
    const fp = footPath(c, stride);
    const ik = legIK(g, fwd0 + fp.f, depth - fp.lift);
    // keep the sole parallel to the floor; roll onto the toes just before lift-off, toes up just before heel strike
    let foot = ik.kneeBend - ik.hipPitch - (g.s0 - g.t0) * 0;
    if (fp.stance && fp.u > 0.8) foot -= 0.32 * ((fp.u - 0.8) / 0.2) * amt;
    if (!fp.stance) foot += (fp.u < 0.5 ? -0.32 * (1 - fp.u / 0.5) : 0.18 * Math.sin(Math.PI * (fp.u - 0.5) / 0.5)) * amt;
    // blend from the exact rest pose (standing) into the walking IK so a stop always ends square on both feet
    const k = Math.min(1, amt * 3);
    return [{ hipPitch: ik.hipPitch * k, kneeBend: ik.kneeBend * k, footPitch: foot * k }, fp];
  };
  const [L, footL] = one(cyc), [R, footR] = one(cyc + 0.5);
  return { L, R, bodyY: (depth - g.depth) * Math.min(1, amt * 3), armSwing: -Math.sin(2 * Math.PI * (cyc - 0.15)) * amt, footL, footR };
}
