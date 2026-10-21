// Smoke tests for the 3D renderer's layout: every card has a place, stays on the table, faces its owner,
// and no seat's cards ever overlap another seat's cards, the deck or the pile — for 2, 3 and 4 players,
// through whole bot matches (including penalty-heavy rounds).
import { describe, it, expect } from 'vitest';
import { projectView } from '@marlivo/engine';
import { simulateMatch } from '@marlivo/room';
import { layout3, TABLE_R, PILE, DECK, SEAT_ANGLE, type Place3 } from '../src/render3d/layout3d';
import { seatPositions } from '../src/render/geometry';

type P = [number, number];
const corners = (c: Place3): P[] => {
  const hw = c.w / 2, hh = c.h / 2, ca = Math.cos(c.yaw), sa = Math.sin(c.yaw);
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [c.p[0] + x * ca + y * sa, c.p[2] - x * sa + y * ca] as P);
};
function overlap(a: P[], b: P[]) {
  for (const poly of [a, b]) for (let i = 0; i < 4; i++) {
    const p1 = poly[i]!, p2 = poly[(i + 1) % 4]!;
    const nx = p2[1] - p1[1], ny = p1[0] - p2[0];
    const pa = a.map((p) => p[0] * nx + p[1] * ny), pb = b.map((p) => p[0] * nx + p[1] * ny);
    if (Math.max(...pa) <= Math.min(...pb) + 1e-9 || Math.max(...pb) <= Math.min(...pa) + 1e-9) return false;
  }
  return true;
}

describe('3D layout', () => {
  for (const players of [2, 3, 4]) {
    it(`${players} players: all cards placed, on the table, facing their owner, never overlapping`, () => {
      let checked = 0, maxCards = 0;
      for (const seed of [1, 2, 3]) {
        let step = 0;
        simulateMatch(`l3-${players}-${seed}`, {
          players, target: 2, cards: 4 + seed, randomLayouts: true,
          onStep: (s) => {
            if (++step % 7 || !s.round || s.phase !== 'PLAY') return;
            for (let me = 0; me < players; me++) {
              const v = projectView(s, me, { helper: 'full', log: false });
              const L = layout3(v, false, (step + me) % 2 === 0);
              const deck = corners({ p: DECK, yaw: 0.06, w: 0.118, h: 0.165 });
              const bySeat: Record<number, P[][]> = {};
              for (const seat of v.round!.participants) {
                const slots = v.round!.areas[seat] ?? [];
                maxCards = Math.max(maxCards, slots.length);
                for (const sv of slots) {
                  const c = L.slots[sv.id];
                  expect(c, `slot ${sv.id}`).toBeTruthy();
                  expect(c!.owner).toBe(seat);
                  expect(c!.yaw).toBeCloseTo(L.seats[seat]!.a);
                  const cs = corners(c!);
                  for (const [x, z] of cs) expect(Math.hypot(x, z)).toBeLessThan(TABLE_R - 0.04);
                  expect(overlap(cs, deck)).toBe(false);
                  expect(Math.min(...cs.map(([x, z]) => Math.hypot(x - PILE.x, z - PILE.z)))).toBeGreaterThan(PILE.r * 0.9);
                  (bySeat[seat] ??= []).push(cs);
                  checked++;
                }
              }
              const seats = Object.keys(bySeat).map(Number);
              for (let i = 0; i < seats.length; i++) for (let j = i + 1; j < seats.length; j++)
                for (const a of bySeat[seats[i]!]!) for (const b of bySeat[seats[j]!]!) expect(overlap(a, b)).toBe(false);
              // I always sit at the bottom (towards the camera)
              expect(L.seats[me]!.a).toBe(SEAT_ANGLE.bottom);
            }
          },
        });
      }
      expect(checked).toBeGreaterThan(200);
      expect(maxCards).toBeGreaterThan(4);
    });
  }

  it('seat placement follows the brief: 2 = opposite, 3 = left/right, 4 = left/opposite/right', () => {
    const fake = (n: number) => ({ you: 0, seats: Array.from({ length: n }, () => ({})), players: Array.from({ length: n }, (_, i) => i), round: null } as never);
    expect(Object.values(seatPositions(fake(2)))).toEqual(['bottom', 'top']);
    expect(Object.values(seatPositions(fake(3)))).toEqual(['bottom', 'topLeft', 'topRight']);
    expect(Object.values(seatPositions(fake(4)))).toEqual(['bottom', 'left', 'top', 'right']);
    expect(SEAT_ANGLE.topLeft).toBeLessThan(-Math.PI / 2); expect(SEAT_ANGLE.topRight).toBeGreaterThan(Math.PI / 2);
  });
});
