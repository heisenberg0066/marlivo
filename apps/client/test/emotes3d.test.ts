import { describe, it, expect, beforeEach } from 'vitest';
import {
  HUD_EMOTES,
  computeEmotePose,
  triggerEmote,
  activeEmoteFor,
  clearEmotes,
  seatCupBounce,
  computeIdlePose,
  computeMouthTarget,
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
    expect(Math.abs(pClap.tL![0] - pClap.tR![0])).toBeLessThan(0.55);
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

  it('computes a living, relaxed idle posture with radial body clearance for Orange guy and Ammar', () => {
    const p0 = computeIdlePose('tango', 1, 0.0, 'idle', 0);
    const p1 = computeIdlePose('tango', 1, 2.5, 'idle', 0.25);
    const p2 = computeIdlePose('tango', 1, 5.0, 'think', -0.2);
    for (const p of [p0, p1, p2]) {
      // Orange guy's elbow is at |x_E| = 0.395 (outside the 0.34 egg torso), so |x| in 0.37..0.44 hangs straight down with full radial clearance
      expect(Math.abs(p.tL[0])).toBeGreaterThanOrEqual(0.35);
      expect(Math.abs(p.tL[0])).toBeLessThanOrEqual(0.45);
      expect(Math.abs(p.tR[0])).toBeGreaterThanOrEqual(0.35);
      expect(Math.abs(p.tR[0])).toBeLessThanOrEqual(0.45);
      expect(p.tL[1]).toBeLessThan(0.32);
      expect(p.tR[1]).toBeLessThan(0.32);
      expect(p.tL[2]).toBeGreaterThan(0.04);
      expect(p.tR[2]).toBeGreaterThan(0.04);
    }
    const pAmmar = computeIdlePose('ammar', 2, 1.0, 'idle', 0);
    expect(Math.abs(pAmmar.tL[0])).toBeLessThan(0.28);
    // Verify continuous movement across time (never static)
    expect(p0.tL[1]).not.toBeCloseTo(p1.tL[1], 3);
    expect(p0.spineRoll).not.toBeCloseTo(p1.spineRoll, 3);
    expect(p2.tL[1]).toBeGreaterThan(p0.tL[1]); // 'think' raises left hand toward chin/gesture
  });

  it('drives dynamic cartoon mouth states across cheer/laugh, peek O-mouth, slam/penalty, and relaxed idle', () => {
    const idle = computeIdlePose('tango', 1, 1.8, 'idle', 0.1);
    const mCheer = computeMouthTarget('tango', 'idle', 1.0, idle, null, {
      seat: 1, kind: 'cheer', icon: '🎉', label: 'Cheer!', startedAt: 0, duration: 2000, u: 0.3,
    });
    expect(mCheer.open).toBeGreaterThan(0.75);
    expect(mCheer.smile).toBeGreaterThan(0.35);
    expect(mCheer.width).toBeGreaterThan(1.05);

    const mPeek = computeMouthTarget('tango', 'idle', 1.0, idle, {
      arm: {}, look: null, lookW: 0, lean: 0, focus: 0.85,
    }, null);
    expect(mPeek.open).toBeGreaterThan(0.40);
    expect(mPeek.width).toBeLessThan(0.60); // narrow 'O' mouth

    const mSlam = computeMouthTarget('tango', 'sad', 1.0, idle, null, {
      seat: 1, kind: 'slam', icon: '💢', label: 'Slam!', startedAt: 0, duration: 2000, u: 0.25,
    });
    expect(mSlam.open).toBeGreaterThan(0.65);
    expect(mSlam.smile).toBeLessThan(-0.25); // downturned groaning mouth
  });
});
