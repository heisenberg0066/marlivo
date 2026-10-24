// Unit tests for the 3D Orange waiter's 6 outfits, non-repeating outfit switch, 60s active / 60s off-screen cycle,
// full-table cup-by-cup refill tour, lively tea drain, and safe outer terrace walking path (sketch book v8 p22–27).
import { describe, it, expect } from 'vitest';
import { layout3, TABLE_R } from '../src/render3d/layout3d';
import { propLayout } from '../src/render3d/scenes/propLayout';
import { TEA_DRAIN, teaLevel, refillTea, setTeaLevel, tickTea } from '../src/render3d/scenes/tea';
import {
  WAITER_OUTFITS,
  OUTFIT_ORDER,
  waiterOutfitForCycle,
  evaluateWaiterCycle,
  pickWaiterOutfit,
  pickRefillOrder,
  cupStopForSeat,
  computeWaiterStops,
  buildWaiterRoute,
  isSafeWaiterPoint,
  nearestStop,
  HEDGE_Z,
  CHAR_CLEAR_R,
  STOP_R,
  LOOP_R,
  WAITER_FLOOR_Y,
  WAITER_ACTIVE_SEC,
  WAITER_AWAY_SEC,
  WAITER_CYCLE_SEC,
  REFILL_POUR,
  WAITER_BREAK_RANGE,
  type WaiterOutfit,
} from '../src/render3d/scenes/waiterPath';

const view = (n: number, me = 0) => ({
  you: me,
  seats: Array.from({ length: n }, () => ({})),
  players: Array.from({ length: n }, (_, i) => i),
  round: null,
} as never);

describe('Orange waiter outfits, 60s active / 60s away cycle, full-table cup refill tour & outer terrace path', () => {
  it('picks outfits across all 6 styles, rotates deterministically per cycle, and never repeats the previous outfit', () => {
    expect(WAITER_OUTFITS.length).toBeGreaterThanOrEqual(6);
    expect(OUTFIT_ORDER).toEqual(WAITER_OUTFITS);
    for (let i = 0; i < 12; i++) {
      expect(waiterOutfitForCycle(i)).toBe(OUTFIT_ORDER[i % OUTFIT_ORDER.length]);
    }
    let s = 42;
    const rng = () => ((s = (s * 48271) % 2147483647) / 2147483647);
    const picks = Array.from({ length: 100 }, () => pickWaiterOutfit(rng));
    for (const o of WAITER_OUTFITS) expect(picks).toContain(o);

    let prev: WaiterOutfit = 'full';
    for (let i = 0; i < 120; i++) {
      const next = pickWaiterOutfit(rng, prev);
      expect(next).not.toBe(prev);
      prev = next;
    }
  });

  it('alternates 60s (1 minute) active refill tour and 60s (1 minute) off-screen break with outfit rotation per cycle', () => {
    expect(WAITER_ACTIVE_SEC).toBe(60);
    expect(WAITER_AWAY_SEC).toBe(60);
    expect(WAITER_CYCLE_SEC).toBe(120);
    expect(WAITER_BREAK_RANGE).toEqual([60, 60]);
    expect(REFILL_POUR).toBeCloseTo(2.2, 2);

    // Cycle 0: 0..60s active in outfit[0] ('full'), 60..120s away (off-screen)
    const c0Start = evaluateWaiterCycle(5);
    expect(c0Start.active).toBe(true);
    expect(c0Start.cycleIndex).toBe(0);
    expect(c0Start.outfit).toBe(OUTFIT_ORDER[0]);
    expect(c0Start.progress).toBeCloseTo(5 / 60, 3);

    const c0Mid = evaluateWaiterCycle(30);
    expect(c0Mid.active).toBe(true);
    expect(c0Mid.progress).toBeCloseTo(0.5, 3);

    const c0Away = evaluateWaiterCycle(75);
    expect(c0Away.active).toBe(false);
    expect(c0Away.cycleIndex).toBe(0);
    expect(c0Away.progress).toBe(0);

    // Cycle 1: 120..180s active in outfit[1] ('suit'), 180..240s away
    const c1Active = evaluateWaiterCycle(135);
    expect(c1Active.active).toBe(true);
    expect(c1Active.cycleIndex).toBe(1);
    expect(c1Active.outfit).toBe(OUTFIT_ORDER[1]);
    expect(c1Active.progress).toBeCloseTo(15 / 60, 3);

    const c1Away = evaluateWaiterCycle(200);
    expect(c1Away.active).toBe(false);
    expect(c1Away.cycleIndex).toBe(1);

    // Cycle 2: 240..300s active in outfit[2] ('tie')
    const c2Active = evaluateWaiterCycle(250);
    expect(c2Active.active).toBe(true);
    expect(c2Active.cycleIndex).toBe(2);
    expect(c2Active.outfit).toBe(OUTFIT_ORDER[2]);
  });

  it('keeps waiter standing on the patio floor (y = -0.42) strictly outside the chair ring (STOP_R >= 1.88, LOOP_R >= 2.15)', () => {
    expect(WAITER_FLOOR_Y).toBeCloseTo(-0.42, 2);
    expect(STOP_R).toBeGreaterThanOrEqual(1.88);
    expect(STOP_R).toBeLessThanOrEqual(2.65);
    expect(LOOP_R).toBeGreaterThanOrEqual(2.15);
    expect(LOOP_R).toBeLessThanOrEqual(2.80);

    expect(TEA_DRAIN.minutes).toBeLessThanOrEqual(2);
    setTeaLevel(0, 0.58);
    expect(teaLevel(0)).toBeCloseTo(0.58, 2);
    refillTea(0);
    tickTea(10, 2.0, [0]);
    expect(teaLevel(0)).toBeGreaterThan(0.85);
  });

  for (const n of [2, 3, 4]) {
    for (const portrait of [false, true]) {
      it(`${n} players${portrait ? ' phone' : ''}: visits EVERY player's cup in circular order and keeps stops/route outside chairs (r >= 1.88)`, () => {
        const L = layout3(view(n, 0), false, portrait);
        const P = propLayout(L);
        const order = pickRefillOrder(L, Object.keys(P.tea).map(Number));
        expect(order).toHaveLength(n);
        expect(new Set(order).size).toBe(n);

        for (const seat of order) {
          const cup = P.tea[seat]!.p;
          const cStop = cupStopForSeat(L, seat, cup);
          expect(Math.hypot(cStop.standPos[0], cStop.standPos[2])).toBeGreaterThanOrEqual(1.88);
          expect(cStop.standPos[1]).toBeCloseTo(WAITER_FLOOR_Y, 2);
          expect(cStop.standPos[2]).toBeGreaterThan(HEDGE_Z);
          for (const c of Object.values(L.chars)) {
            expect(Math.hypot(cStop.standPos[0] - c.p[0], cStop.standPos[2] - c.p[2])).toBeGreaterThan(CHAR_CLEAR_R);
          }
        }

        const stops = computeWaiterStops(L);
        for (const st of Object.values(stops)) {
          expect(Math.hypot(st.standPos[0], st.standPos[2])).toBeGreaterThanOrEqual(1.88);
          expect(st.standPos[1]).toBeCloseTo(WAITER_FLOOR_Y, 2);
          expect(st.standPos[2]).toBeGreaterThan(HEDGE_Z);
          expect(isSafeWaiterPoint(L, st.standPos[0], st.standPos[2], true)).toBe(true);
          for (const c of Object.values(L.chars)) {
            expect(Math.hypot(st.standPos[0] - c.p[0], st.standPos[2] - c.p[2])).toBeGreaterThan(CHAR_CLEAR_R);
          }
        }
        const route = buildWaiterRoute([stops.A, stops.D, stops.C, stops.B]);
        expect(route.length).toBeGreaterThan(10);
        for (const wp of route) {
          expect(wp.pos[1]).toBeCloseTo(WAITER_FLOOR_Y, 2);
          expect(wp.pos[2]).toBeGreaterThan(HEDGE_Z);
          expect(Math.hypot(wp.pos[0], wp.pos[2])).toBeGreaterThanOrEqual(1.88);
        }
        expect(nearestStop(stops, -1, 1).id).toBe('A');
        expect(nearestStop(stops, 1, 1).id).toBe('B');
      });
    }
  }
});
