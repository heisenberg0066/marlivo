import { describe, it, expect, beforeEach } from 'vitest';
import {
  HUD_EMOTES,
  computeEmotePose,
  triggerEmote,
  activeEmoteFor,
  clearEmotes,
  seatCupBounce,
  type EmoteKind,
} from '../src/render3d/actors';

describe('3D win/lose character reactions & HUD emotes', () => {
  beforeEach(() => clearEmotes());

  it('exposes the 4 compact HUD emotes (Wave, Cheer, Boo, Slam)', () => {
    expect(HUD_EMOTES.map((e) => e.kind)).toEqual(['wave', 'cheer', 'boo', 'slam']);
  });

  it('slam reaction keeps fists above the tabletop (y >= 0.025), droops eyelids (~0.55), and bounces the teacup 3 times', () => {
    let minHandY = Infinity;
    let maxBounce = 0;
    let peaks = 0;
    let prevB = 0;
    for (let i = 0; i <= 120; i++) {
      const u = i / 120;
      const p = computeEmotePose('slam', u);
      expect(p.tL).not.toBeNull();
      expect(p.tR).not.toBeNull();
      minHandY = Math.min(minHandY, p.tL![1], p.tR![1]);
      if (u >= 0.2 && u <= 0.8) {
        expect(p.blink).toBeCloseTo(0.55, 2);
        expect(p.lean).toBeGreaterThan(0.3);
      }
      if (p.cupBounce > 0.008 && prevB <= 0.008) peaks++;
      prevB = p.cupBounce;
      maxBounce = Math.max(maxBounce, p.cupBounce);
    }
    expect(minHandY).toBeGreaterThanOrEqual(0.025);
    expect(maxBounce).toBeGreaterThan(0.015);
    expect(peaks).toBe(3);
  });

  it('win reaction combines overhead victory pump/clap with cheeky boo gesture and happy squint', () => {
    const pPump = computeEmotePose('win', 0.18);
    const pClap = computeEmotePose('win', 0.40);
    const pBoo = computeEmotePose('win', 0.75);
    expect(pPump.tR![1]).toBeGreaterThan(0.50);
    expect(Math.abs(pClap.tL![0] - pClap.tR![0])).toBeLessThan(0.25);
    expect(pBoo.lean).toBeGreaterThan(0.15);
    expect(pBoo.blink).toBeGreaterThan(0.4);
  });

  it('tracks active per-seat emotes and propagates cup bounce to the table', () => {
    triggerEmote(2, 'slam', { progress: 0.22 });
    const act = activeEmoteFor(2);
    expect(act?.kind).toBe('slam');
    expect(seatCupBounce(2)).toBeGreaterThan(0.01);
    expect(seatCupBounce(1)).toBeGreaterThan(0.004);
    for (const k of ['wave', 'cheer', 'boo', 'sputter'] as EmoteKind[]) {
      const pose = computeEmotePose(k, 0.5);
      expect(pose.wR).toBeGreaterThan(0.5);
    }
  });
});
