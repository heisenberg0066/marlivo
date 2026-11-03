import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { OUTFITS, outfitOf, figKey, splitKey, byKey, outfitDef, hasOutfitChoice } from '../src/outfits';
import { entryFor, type Manifest } from '../src/render3d/registry';
import { restArmsFor, computeIdlePose, bodySpecFor, STANDING_IDS, isChibiLivo, BODY_SPECS } from '../src/render3d/actors';

const dir = resolve(__dirname, '../public/assets/characters');
const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8')) as Manifest;
const src = (p: string) => readFileSync(resolve(__dirname, '../src', p), 'utf8');

describe('Livo: the chibi beanie build is her only look (v0.11, adult outfits dropped)', () => {
  it("'beanie' is the only and default outfit, so there is no outfit choice (picker hidden)", () => {
    expect(OUTFITS.livo!.list.map((o) => o.id)).toEqual(['beanie']);
    expect(OUTFITS.livo!.def).toBe('beanie');
    expect(OUTFITS.livo!.hidden ?? []).toEqual([]);
    expect(hasOutfitChoice('livo')).toBe(false);
    expect(hasOutfitChoice('mint')).toBe(false);
    expect(src('screens/OutfitPicker.tsx')).toMatch(/!hasOutfitChoice\(charId\)\) return null/);
  });
  it('a saved/synced adult outfit (localStorage livo=streetwear etc.) falls back to the beanie', () => {
    for (const o of ['streetwear', 'sporty', 'denim', 'stockholm', 'nope', undefined, null]) {
      expect(outfitOf('livo', o)).toBe('beanie');
      expect(figKey('livo', o)).toBe('livo');
    }
    expect(outfitOf('mint', 'denim')).toBeUndefined();
    expect(figKey('mint', 'denim')).toBe('mint');
    expect(splitKey('livo@x')).toEqual(['livo', 'x']);
    expect(byKey({ livo: 1, 'livo@x': 2 }, 'livo@x')).toBe(2);
    expect(byKey({ livo: 1 }, 'livo@x')).toBe(1);
  });
  it('renders under the plain livo id with the 417eb6d tuning (chibi, no rest pose, sitting, her body spec)', () => {
    expect(isChibiLivo(figKey('livo', 'streetwear'))).toBe(true);
    expect(restArmsFor(figKey('livo', 'denim'), 1, 1)).toBeNull();
    expect(outfitDef('livo', 'stockholm')!.rest).toBeUndefined();
    expect(STANDING_IDS.has('livo')).toBe(false);
    expect(bodySpecFor('livo')).toBe(BODY_SPECS.livo);
    expect(BODY_SPECS.livo).toEqual({ cx: 0, head: { c: [0, 0.295, 0.0], r: [0.22, 0.18, 0.20], p: 2 }, torso: { c: [0, -0.06, 0], r: [0.18, 0.18, 0.16], p: 2 }, glove: 0.045, faceLo: 0.06, faceZ: 0.17, faceHalfW: 0.17, browY: 0.235, floorY: 0.0 });
    expect(Object.keys(BODY_SPECS).filter((k) => k.includes('@'))).toEqual([]);
    expect(computeIdlePose('livo', 0, 1, 'idle').tL).toHaveLength(3);
    expect(src('render3d/Figures.tsx')).toContain("livo:  { ey: 0.635, eh: 0.031, ex: 0.055, ew: 0.026, col: '#e1bdab', my: 0.569, mh: 0.000, mw: 0.041, mcol: '#deb19e', mz: 0.12 },");
    expect(src('render3d/Figures.tsx')).not.toMatch(/'livo@/);
    expect(src('render3d/backend3d.ts')).toContain('livo: { dy: -0.075, out: 0.03, lat: 0.07 }');
  });
  it('manifest: the base livo entry (livo.glb / livo-low.glb, seated chibi), no outfit variants; adult files not shipped', () => {
    const e = manifest.characters.livo!;
    expect(e.outfits).toBeUndefined();
    expect(e.model).toBe('livo.glb'); expect(e.modelLow).toBe('livo-low.glb');
    expect(entryFor(manifest, figKey('livo', 'sporty'))).toBe(e);
    for (const f of [e.model!, e.modelLow!, 'portraits/livo.webp']) expect(readFileSync(resolve(dir, f)).length).toBeGreaterThan(1000);
    for (const o of ['streetwear', 'sporty', 'denim', 'stockholm']) {
      expect(existsSync(resolve(dir, `livo_${o}.glb`))).toBe(false);
      expect(existsSync(resolve(dir, `portraits/livo_${o}.webp`))).toBe(false);
    }
  });
});
