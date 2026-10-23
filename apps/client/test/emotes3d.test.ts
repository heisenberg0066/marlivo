import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  HUD_EMOTES,
  computeEmotePose,
  triggerEmote,
  activeEmoteFor,
  clearEmotes,
  seatCupBounce,
  computeIdlePose,
  computeMouthTarget,
  computeWalkGait,
  computeSeatedLegPose,
  type EmoteKind,
} from '../src/render3d/actors';
import { computeBadmintonState, PERIOD as BADMINTON_PERIOD } from '../src/render3d/scenes/badminton';

const CHAR_DIR = resolve(__dirname, '../public/assets/characters');
const ALL_7_CHARS = ['ammar', 'orange-guy', 'biscuit', 'mint', 'pepper', 'choco', 'sugar'] as const;
const ALL_7_IDS = ['ammar', 'tango', 'biscuit', 'mint', 'pepper', 'choco', 'sugar'] as const;

function parseGlbJson(filePath: string): { nodes?: { name?: string }[]; skins?: { joints: number[] }[] } {
  const buf = readFileSync(filePath);
  const magic = buf.readUInt32LE(0);
  expect(magic).toBe(0x46546c67); // 'glTF'
  const jsonLen = buf.readUInt32LE(12);
  const jsonStr = buf.subarray(20, 20 + jsonLen).toString('utf8');
  return JSON.parse(jsonStr);
}

describe('All 7 characters 4-bone arm + 3-bone leg GLB rigs, animations, badminton & HUD', () => {
  beforeEach(() => clearEmotes());

  it('verifies all 14 character GLBs (7 characters x High/Low) have 4-bone arms (armL/R -> fore -> hand -> curl) AND 3-bone legs (legL/R -> knee -> foot)', () => {
    const requiredBones = [
      'armL', 'armL_fore', 'armL_hand', 'armL_curl',
      'armR', 'armR_fore', 'armR_hand', 'armR_curl',
      'legL', 'legL_knee', 'legL_foot',
      'legR', 'legR_knee', 'legR_foot',
    ];
    for (const c of ALL_7_CHARS) {
      for (const suffix of ['', '-low']) {
        const glb = parseGlbJson(`${CHAR_DIR}/${c}${suffix}.glb`);
        const skin = glb.skins?.[0];
        expect(skin, `${c}${suffix}.glb skin`).toBeTruthy();
        const jointNames = (skin!.joints ?? []).map((idx) => glb.nodes?.[idx]?.name ?? '');
        for (const reqBone of requiredBones) {
          expect(jointNames, `${c}${suffix}.glb missing ${reqBone}`).toContain(reqBone);
        }
      }
    }
  });

  it('removes the 📜 Log button from the real game (!session.test) in Game.tsx', () => {
    const gameSrc = readFileSync(resolve(__dirname, '../src/screens/Game.tsx'), 'utf8');
    expect(gameSrc).toContain("{session.test && <button className=\"icon\" onClick={() => setDrawer('log')}");
    expect(gameSrc).toContain("{session.test && drawer === 'log' && <LogView");
  });

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

  it('computes a living, relaxed idle posture and 3-bone seated leg animation for ALL 7 characters', () => {
    for (const id of ALL_7_IDS) {
      const p0 = computeIdlePose(id, 1, 0.0, 'idle', 0);
      const p1 = computeIdlePose(id, 1, 2.2, 'idle', 0.25);
      expect(p0.tL[1]).not.toBeCloseTo(p1.tL[1], 3);
      expect(p0.spineRoll).not.toBeCloseTo(p1.spineRoll, 3);

      const legsIdle0 = computeSeatedLegPose(id, 1, 0.2, 'idle', 0, null, false);
      const legsIdle1 = computeSeatedLegPose(id, 1, 1.6, 'idle', 0, null, false);
      expect(legsIdle0.L.hipPitch).not.toBeCloseTo(legsIdle1.L.hipPitch, 3);
      expect(legsIdle0.L.kneeBend).toBeGreaterThan(0.05);
      expect(legsIdle0.R.kneeBend).toBeGreaterThan(0.05);

      const legsReach = computeSeatedLegPose(id, 1, 1.0, 'idle', 0.28, null, true);
      expect(legsReach.L.kneeBend).toBeGreaterThan(0.15);
      expect(legsReach.R.kneeBend).toBeGreaterThan(0.15);

      const legsHappy = computeSeatedLegPose(id, 1, 0.5, 'happy', 0, null, false);
      expect(Math.abs(legsHappy.L.hipPitch - legsHappy.R.hipPitch)).toBeGreaterThan(0.1);
    }

    // Verify walking gait helper drives opposite-phase hip swing and forward knee bend
    const g0 = computeWalkGait(0.4, 1.0);
    const g1 = computeWalkGait(0.4 + Math.PI, 1.0);
    expect(g0.L.hipPitch).toBeGreaterThan(0.15);
    expect(g0.R.hipPitch).toBeLessThan(-0.15);
    expect(g1.L.hipPitch).toBeLessThan(-0.15);
    expect(g0.L.kneeBend).toBeGreaterThan(0.2);
  });

  it('drives continuous 2-hand + 2-leg athletic badminton footwork across the 6.4s 4-shot rally cycle', () => {
    expect(BADMINTON_PERIOD).toBeCloseTo(6.4, 2);
    const sClear = computeBadmintonState(0.45);
    const sSmash = computeBadmintonState(2.05);
    const sLungeA = computeBadmintonState(3.45);
    const sLungeB = computeBadmintonState(4.95);

    // Jump-smash at t=2.05: Player B leaps into the air (> 0.22m) with overhead racket arm and arched back
    expect(sSmash.B.jumpY).toBeGreaterThan(0.22);
    expect(sSmash.B.armR[1]).toBeGreaterThan(0.65);
    expect(sSmash.B.legL.kneeBend).toBeGreaterThan(0.3);
    expect(sSmash.B.legR.kneeBend).toBeGreaterThan(0.4);

    // Net lunges at t=3.45 (A) and t=4.95 (B): deep front-leg lunge (legR forward > 0.70, legL trailing < -0.50)
    expect(sLungeA.A.legR.hipPitch).toBeGreaterThan(0.70);
    expect(sLungeA.A.legR.kneeBend).toBeGreaterThan(0.75);
    expect(sLungeA.A.legL.hipPitch).toBeLessThan(-0.50);

    expect(sLungeB.B.legR.hipPitch).toBeGreaterThan(0.70);
    expect(sLungeB.B.legR.kneeBend).toBeGreaterThan(0.75);
    expect(sLungeB.B.legL.hipPitch).toBeLessThan(-0.50);

    // Both hands (armR and armL) and both legs move continuously across the rally
    expect(sClear.A.armL[1]).not.toBeCloseTo(sLungeA.A.armL[1], 2);
    expect(sClear.A.armR[2]).not.toBeCloseTo(sLungeA.A.armR[2], 2);
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
    expect(mPeek.width).toBeLessThan(0.60);

    const mSlam = computeMouthTarget('tango', 'sad', 1.0, idle, null, {
      seat: 1, kind: 'slam', icon: '💢', label: 'Slam!', startedAt: 0, duration: 2000, u: 0.25,
    });
    expect(mSlam.open).toBeGreaterThan(0.65);
    expect(mSlam.smile).toBeLessThan(-0.25);
  });
});
