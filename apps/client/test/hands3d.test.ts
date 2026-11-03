import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeIdlePose } from '../src/render3d/actors';

const CHAR_DIR = resolve(__dirname, '../public/assets/characters');
type Glb = { nodes?: { name?: string; extras?: Record<string, unknown> }[]; meshes?: { primitives: { material?: number }[] }[]; materials?: { name?: string }[] };
function glbJson(file: string): Glb {
  const buf = readFileSync(file);
  expect(buf.readUInt32LE(0)).toBe(0x46546c67);
  return JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
}

describe('Livo + Ammar real arms and hands (Phase 5)', () => {
  for (const c of ['livo', 'ammar']) {
    for (const suf of ['', '-low']) {
      it(`${c}${suf}.glb has the rebuilt arm mesh (arms material) and curlSign extras on both hand bones`, () => {
        const g = glbJson(`${CHAR_DIR}/${c}${suf}.glb`);
        expect((g.materials ?? []).some((m) => m.name === 'arms')).toBe(true);
        for (const side of ['armL_hand', 'armR_hand']) {
          const n = (g.nodes ?? []).find((x) => x.name === side);
          expect(n, side).toBeTruthy();
          expect(n!.extras?.curlSign).toBe(-1);
        }
      });
    }
  }

  it('reads curlSign from the hand bone userData and applies it in curlArm', () => {
    const src = readFileSync(resolve(__dirname, '../src/render3d/actors.ts'), 'utf8');
    expect(src).toMatch(/curlSign\?: number/);
    expect(src).toMatch(/userData as \{ curlSign\?: number \}/);
  });

  it('table rest pose keeps Livo/Ammar hands just above the table, in front and with bent elbows (no poles)', () => {
    for (const id of ['livo', 'ammar']) {
      for (let seat = 0; seat < 4; seat++) {
        for (let t = 0; t < 20; t += 0.37) {
          const p = computeIdlePose(id, seat, t, 'calm');
          for (const v of [p.tL, p.tR]) {
            expect(v[1], `${id} hand y`).toBeGreaterThan(0.0);
            expect(v[1], `${id} hand y`).toBeLessThan(0.2);
            expect(v[2], `${id} hand z`).toBeGreaterThan(0.2);
            expect(v[2], `${id} hand z`).toBeLessThan(0.5);
            expect(Math.abs(v[0]), `${id} hand x`).toBeLessThan(0.3);
          }
        }
      }
    }
  });

  it('first-person hand for Livo/Ammar is the fingered human hand, not the generic paw', () => {
    const src = readFileSync(resolve(__dirname, '../src/render3d/backend3d.ts'), 'utf8');
    expect(src).toContain('function createHumanFpHand');
    expect(src).toMatch(/ammar:\s+\{[^}]*human: true/);
    expect(src).toMatch(/livo:\s+\{[^}]*human: true/);
  });
});
