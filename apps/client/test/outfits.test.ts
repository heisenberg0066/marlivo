import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OUTFITS, outfitOf, figKey, splitKey, byKey, outfitDef } from '../src/outfits';
import { entryFor, type Manifest } from '../src/render3d/registry';
import { restArmsFor, computeIdlePose, computeSeatedLegPose, STANDING_IDS, isChibiLivo } from '../src/render3d/actors';

const manifest = JSON.parse(readFileSync(resolve(__dirname, '../public/assets/characters/manifest.json'), 'utf8')) as Manifest;

describe('Livo outfits', () => {
  it('labels the 4 looks Livo 1-4 in both languages (ids unchanged)', () => {
    expect(OUTFITS.livo!.list.map((o) => [o.id, o.name.en, o.name.fr])).toEqual([['streetwear', 'Livo 1', 'Livo 1'], ['sporty', 'Livo 2', 'Livo 2'], ['denim', 'Livo 3', 'Livo 3'], ['stockholm', 'Livo 4', 'Livo 4']]);
  });
  it('offers the 4 adult looks with streetwear as default; the chibi beanie stays available but hidden', () => {
    expect(OUTFITS.livo!.list.map((o) => o.id)).toEqual(['streetwear', 'sporty', 'denim', 'stockholm']);
    expect(outfitOf('livo')).toBe('streetwear');
    expect(outfitOf('livo', 'nope')).toBe('streetwear');
    expect(outfitOf('livo', 'beanie')).toBe('beanie');
    expect(outfitOf('mint', 'denim')).toBeUndefined();
    expect(figKey('livo', 'denim')).toBe('livo@denim');
    expect(figKey('livo')).toBe('livo@streetwear');
    expect(figKey('mint', 'denim')).toBe('mint');
    expect(splitKey('livo@sporty')).toEqual(['livo', 'sporty']);
    expect(byKey({ livo: 1, 'livo@denim': 2 }, 'livo@denim')).toBe(2);
    expect(byKey({ livo: 1 }, 'livo@sporty')).toBe(1);
  });
  it('jacket/coat outfits rest with hands in pockets, the hoodie with arms at her sides', () => {
    expect(outfitDef('livo', 'streetwear')!.rest).toBe('sides');
    for (const o of ['sporty', 'denim', 'stockholm']) expect(outfitDef('livo', o)!.rest).toBe('pockets');
    expect(outfitDef('livo', 'beanie')!.rest).toBeUndefined();
  });
  it('every outfit has a model + low model in the manifest; entries merge over the base livo entry', () => {
    for (const o of [...OUTFITS.livo!.list, ...(OUTFITS.livo!.hidden ?? [])]) {
      const e = entryFor(manifest, 'livo@' + o.id);
      expect(e.model, o.id).toBeTruthy();
      expect(e.modelLow, o.id).toBeTruthy();
      expect(readFileSync(resolve(__dirname, '../public/assets/characters', e.model!)).length).toBeGreaterThan(1000);
      expect(readFileSync(resolve(__dirname, '../public/assets/characters', e.modelLow!)).length).toBeGreaterThan(1000);
      expect(readFileSync(resolve(__dirname, '../public/assets/characters/portraits', o.id === 'beanie' ? 'livo.webp' : `livo_${o.id}.webp`)).length).toBeGreaterThan(1000);
    }
    expect(entryFor(manifest, 'livo@beanie').model).toBe(entryFor(manifest, 'livo').model);
    expect(entryFor(manifest, 'mint').model).toBe(manifest.characters.mint!.model);
  });
  it('rest pose: pockets at the hips in front of the body, sides lower and wider; no gesture swings', () => {
    const p = restArmsFor('livo@denim', 1.0, 1)!, s = restArmsFor('livo@streetwear', 1.0, 1)!;
    expect(restArmsFor('livo@beanie', 1, 1)).toBeNull();
    expect(restArmsFor('mint', 1, 1)).toBeNull();
    expect(p.tL[0]).toBeLessThan(0); expect(p.tR[0]).toBeGreaterThan(0);
    expect(p.cL).toBeGreaterThan(s.cL);
    expect(Math.abs(s.tR[0])).toBeGreaterThan(Math.abs(p.tR[0]));
    expect(s.tR[1]).toBeLessThan(p.tR[1] + 1e-9);
    // stable over time (only a small breathing sway), unlike the idle hover gestures
    for (let t = 0; t < 10; t += 0.37) {
      const q = restArmsFor('livo@sporty', t, 2)!;
      expect(Math.abs(q.tR[1] - restArmsFor('livo@sporty', 0, 2)!.tR[1])).toBeLessThan(0.03);
    }
    expect(computeIdlePose('livo@denim', 0, 1, 'idle').tL).toHaveLength(3);
  });
  it('standing figures are registered by figure key; the chibi tuning only applies to the beanie build', () => {
    expect(STANDING_IDS.has('ammar')).toBe(true);
    expect(isChibiLivo('livo')).toBe(true); expect(isChibiLivo('livo@beanie')).toBe(true); expect(isChibiLivo('livo@denim')).toBe(false);
    STANDING_IDS.add('livo@denim');
    const st = computeSeatedLegPose('livo@denim', 0, 1, 'happy', 0, { kind: 'cheer', u: 0.3 } as never);
    const sit = computeSeatedLegPose('livo@beanie', 0, 1, 'happy', 0, { kind: 'cheer', u: 0.3 } as never);
    expect(Math.abs(st.L.hipPitch)).toBeLessThan(Math.abs(sit.L.hipPitch) + 1e-9);
  });
});
