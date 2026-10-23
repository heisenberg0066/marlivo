// Unit tests for the 3D Orange waiter's random outfits and safe terrace walking path (sketch book v8 p22–27).
import { describe, it, expect } from 'vitest';
import { layout3, TABLE_R } from '../src/render3d/layout3d';
import {
  WAITER_OUTFITS,
  pickWaiterOutfit,
  computeWaiterStops,
  buildWaiterRoute,
  isSafeWaiterPoint,
  nearestStop,
  HEDGE_Z,
  CHAR_CLEAR_R,
} from '../src/render3d/scenes/waiterPath';

const view = (n: number, me = 0) => ({
  you: me,
  seats: Array.from({ length: n }, () => ({})),
  players: Array.from({ length: n }, (_, i) => i),
  round: null,
} as never);

describe('Orange waiter outfits & safe terrace path', () => {
  it('picks outfits at random across all 5 styles and not in a fixed sequence', () => {
    let s = 42;
    const rng = () => ((s = (s * 48271) % 2147483647) / 2147483647);
    const picks = Array.from({ length: 80 }, () => pickWaiterOutfit(rng));
    for (const o of WAITER_OUTFITS) expect(picks).toContain(o);
    // Verify it is not simply cycling 0, 1, 2, 3, 4
    const sequential = picks.every((p, i) => p === WAITER_OUTFITS[i % WAITER_OUTFITS.length]);
    expect(sequential).toBe(false);
  });

  for (const n of [2, 3, 4]) {
    for (const portrait of [false, true]) {
      it(`${n} players${portrait ? ' phone' : ''}: stops A–D and full refill route stay off the table, off the court, and clear of seated players`, () => {
        const L = layout3(view(n, 0), false, portrait);
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
