// The garden-scene table props (tea + sugar per seat, the chocolate bar) never sit in a keep-clear zone
// (a seat's biggest card area, the centre piles) and stay on the table: 2, 3 and 4 players, phone and laptop,
// normal and large cards (sketch book v8 p05).
import { describe, it, expect } from 'vitest';
import { layout3, TABLE_R, type Place3 } from '../src/render3d/layout3d';
import { propLayout } from '../src/render3d/scenes/propLayout';
import { TEA, CHOCO, CENTRE_CLEAR_R, SEAT_DIST } from '../src/render3d/sceneConfig';

type P = [number, number];
const corners = (c: Place3): P[] => {
  const hw = c.w / 2, hh = c.h / 2, ca = Math.cos(c.yaw), sa = Math.sin(c.yaw);
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [c.p[0] + x * ca + y * sa, c.p[2] - x * sa + y * ca] as P);
};
function overlap(a: P[], b: P[]) {
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const p1 = poly[i]!, p2 = poly[(i + 1) % poly.length]!;
    const nx = p2[1] - p1[1], ny = p1[0] - p2[0];
    const pa = a.map((p) => p[0] * nx + p[1] * ny), pb = b.map((p) => p[0] * nx + p[1] * ny);
    if (Math.max(...pa) <= Math.min(...pb) + 1e-9 || Math.max(...pb) <= Math.min(...pa) + 1e-9) return false;
  }
  return true;
}
const octagon = (x: number, z: number, r: number): P[] => Array.from({ length: 8 }, (_, i) => [x + r * Math.cos((i * Math.PI) / 4) / Math.cos(Math.PI / 8), z + r * Math.sin((i * Math.PI) / 4) / Math.cos(Math.PI / 8)] as P);
const view = (n: number, me: number) => ({ you: me, seats: Array.from({ length: n }, () => ({})), players: Array.from({ length: n }, (_, i) => i), round: null } as never);

describe('table props', () => {
  for (const n of [2, 3, 4]) for (const portrait of [false, true]) for (const large of [false, true]) {
    it(`${n} players${portrait ? ' phone' : ''}${large ? ' large' : ''}: tea, sugar and chocolate stay out of every keep-clear zone`, () => {
      const L = layout3(view(n, 0), large, portrait);
      const P = propLayout(L);
      const zones = Object.values(L.maxAreas).map(corners);
      expect(Object.keys(P.tea)).toHaveLength(n);
      for (const [seat, t] of Object.entries(P.tea)) {
        const saucer = octagon(t.p[0], t.p[2], TEA.saucerR);
        for (const z of zones) expect(overlap(saucer, z), `tea ${seat}`).toBe(false);
        expect(Math.hypot(t.p[0], t.p[2]) + TEA.saucerR).toBeLessThan(TABLE_R);
        expect(Math.hypot(t.p[0], t.p[2]) - TEA.saucerR).toBeGreaterThan(CENTRE_CLEAR_R);
        // at the owner's right: on the owner's side of the table, to their right
        const a = L.seats[Number(seat)]!.a;
        const lx = t.p[0] * Math.cos(a) - t.p[2] * Math.sin(a), ly = t.p[0] * Math.sin(a) + t.p[2] * Math.cos(a);
        expect(lx).toBeGreaterThan(0.3); expect(ly).toBeGreaterThan(0.1);
        for (const c of P.sugar[Number(seat)]!) { const cube = octagon(c[0], c[2], 0.014); for (const z of zones) expect(overlap(cube, z)).toBe(false); expect(Math.hypot(c[0], c[2])).toBeLessThan(TABLE_R - 0.01); }
      }
      const ch = P.choco!;
      expect(ch).toBeTruthy();
      const bar = corners({ p: ch.p, yaw: ch.yaw, w: CHOCO.w, h: CHOCO.d });
      for (const z of zones) expect(overlap(bar, z)).toBe(false);
      for (const [x, z] of bar) { expect(Math.hypot(x, z)).toBeLessThan(TABLE_R - 0.005); expect(Math.hypot(x, z)).toBeGreaterThan(CENTRE_CLEAR_R); }
      for (const t of Object.values(P.tea)) expect(overlap(bar, octagon(t.p[0], t.p[2], TEA.saucerR))).toBe(false);
      // and with a visible gap (no bar touching a saucer rim)
      for (const t of Object.values(P.tea)) expect(overlap(bar, octagon(t.p[0], t.p[2], TEA.saucerR + 0.012))).toBe(false);
      // seated characters sit outside the table
      for (const c of Object.values(L.chars)) expect(Math.hypot(c.p[0], c.p[2])).toBeCloseTo(SEAT_DIST);
    });
  }
});
