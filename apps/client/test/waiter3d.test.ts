// Unit tests for the 3D Orange waiter's 6 outfits, non-repeating outfit switch, full-table cup-by-cup refill tour,
// short 7–10s break, lively tea drain, and safe terrace walking path (sketch book v8 p22–27).
import { describe, it, expect } from 'vitest';
import { layout3, TABLE_R } from '../src/render3d/layout3d';
import { propLayout } from '../src/render3d/scenes/propLayout';
import { TEA_DRAIN, teaLevel, refillTea, setTeaLevel, tickTea } from '../src/render3d/scenes/tea';
import {
  WAITER_OUTFITS,
  pickWaiterOutfit,
  pickRefillOrder,
  cupStopForSeat,
  computeWaiterStops,
  buildWaiterRoute,
  isSafeWaiterPoint,
  nearestStop,
  HEDGE_Z,
  CHAR_CLEAR_R,
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

describe('Orange waiter outfits, full-table cup refill tour & safe terrace path', () => {
  it('picks outfits at random across all 6 styles and never repeats the previous outfit on return', () => {
    expect(WAITER_OUTFITS.length).toBeGreaterThanOrEqual(6);
    let s = 42;
    const rng = () => ((s = (s * 48271) % 2147483647) / 2147483647);
    const picks = Array.from({ length: 100 }, () => pickWaiterOutfit(rng));
    for (const o of WAITER_OUTFITS) expect(picks).toContain(o);
    const sequential = picks.every((p, i) => p === WAITER_OUTFITS[i % WAITER_OUTFITS.length]);
    expect(sequential).toBe(false);

    // Verify non-repeating outfit change when returning from break
    let prev: WaiterOutfit = 'full';
    for (let i = 0; i < 120; i++) {
      const next = pickWaiterOutfit(rng, prev);
      expect(next).not.toBe(prev);
      prev = next;
    }
  });

  it('configures 2.2s pour per cup, 7–10s break between tours, and lively tea drain/refill', () => {
    expect(REFILL_POUR).toBeCloseTo(2.2, 2);
    expect(WAITER_BREAK_RANGE).toEqual([7, 10]);
    expect(TEA_DRAIN.minutes).toBeLessThanOrEqual(2);
    setTeaLevel(0, 0.58);
    expect(teaLevel(0)).toBeCloseTo(0.58, 2);
    refillTea(0);
    tickTea(10, 2.0, [0]);
    expect(teaLevel(0)).toBeGreaterThan(0.85);
  });

  for (const n of [2, 3, 4]) {
    for (const portrait of [false, true]) {
      it(`${n} players${portrait ? ' phone' : ''}: visits EVERY player's cup in circular order and keeps stops/route safe`, () => {
        const L = layout3(view(n, 0), false, portrait);
        const P = propLayout(L);
        const order = pickRefillOrder(L, Object.keys(P.tea).map(Number));
        // Must visit every single seated player (never sliced to 2!)
        expect(order).toHaveLength(n);
        expect(new Set(order).size).toBe(n);

        for (const seat of order) {
          const cup = P.tea[seat]!.p;
          const cStop = cupStopForSeat(L, seat, cup);
          expect(Math.hypot(cStop.standPos[0], cStop.standPos[2])).toBeGreaterThan(TABLE_R + 0.22);
          expect(cStop.standPos[2]).toBeGreaterThan(HEDGE_Z);
          for (const c of Object.values(L.chars)) {
            expect(Math.hypot(cStop.standPos[0] - c.p[0], cStop.standPos[2] - c.p[2])).toBeGreaterThan(CHAR_CLEAR_R);
          }
        }

        const stops = computeWaiterStops(L);
        for (const st of Object.values(stops)) {
          expect(Math.hypot(st.standPos[0], st.standPos[2])).toBeGreaterThan(TABLE_R + 0.22);
          expect(st.standPos[2]).toBeGreaterThan(HEDGE_Z);
          expect(isSafeWaiterPoint(L, st.standPos[0], st.standPos[2], true)).toBe(true);
          for (const c of Object.values(L.chars)) {
            expect(Math.hypot(st.standPos[0] - c.p[0], st.standPos[2] - c.p[2])).toBeGreaterThan(CHAR_CLEAR_R);
          }
        }
        const route = buildWaiterRoute([stops.A, stops.D, stops.C, stops.B]);
        expect(route.length).toBeGreaterThan(10);
        for (const wp of route) {
          expect(wp.pos[2]).toBeGreaterThan(HEDGE_Z);
          expect(Math.hypot(wp.pos[0], wp.pos[2])).toBeGreaterThan(TABLE_R + 0.22);
        }
        expect(nearestStop(stops, -1, 1).id).toBe('A');
        expect(nearestStop(stops, 1, 1).id).toBe('B');
      });
    }
  }
});
