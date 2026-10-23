// Two Orange guys playing an athletic 4-shot badminton rally nonstop behind the terrace (sketch book v8 p10):
//  - PERIOD = 6.4s loop with 4 varied shots:
//      1. High Overhead Clear (Player A at t = 0.45s from baseline to B's rear corner)
//      2. Explosive Jump-Smash (Player B at t = 2.05s leaping 0.30m in mid-air to smash into A's forecourt)
//      3. Diving Net Lunge & Cross-Court Drive (Player A at t = 3.45s lunging deep at the net)
//      4. Net Lunge & High Defensive Lob (Player B at t = 4.95s lunging at the net to lob back to A's baseline)
//  - Both players use the full 4-bone arm rig (armR racket whip + armL balance/sighting arm) AND 3-bone leg rig
//    (legL/R -> _knee -> _foot for running strides, split-step bounces, deep front-leg lunges, and mid-air jump-smash kicks).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { loadManifest, entryFor, loadModel, normalise } from '../registry';
import {
  findArms,
  findLegs,
  poseLeg,
  solveArm,
  curlArm,
  resetArm,
  stepArmSmoothing,
  handPos,
  type ArmChain,
  type LegChain,
  type LegAngles,
  type Side,
} from '../actors';
import { FLOOR_Y } from '../sceneConfig';
import { COURT } from './garden';
import { shadowMat } from './props';

export const PERIOD = 6.4;
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x: number) => { x = clamp(x); return x * x * (3 - 2 * x); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Racket: bold high-contrast white/gold frame, visible string grid, royal-blue grip. Origin at grip end, head along +y. */
function makeRacket() {
  const g = new THREE.Group();
  const frame = new THREE.MeshLambertMaterial({ color: '#fffcf2', emissive: '#4a3810' });
  const rimAccent = new THREE.MeshLambertMaterial({ color: '#ff7a18', emissive: '#381604' });
  const grip = new THREE.MeshLambertMaterial({ color: '#2563eb', emissive: '#0a1e48' });
  const strings = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false });
  const head = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.022, 8, 24), frame); head.scale.set(1, 1.28, 1); head.position.y = 0.48;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.010, 6, 20), rimAccent); rim.scale.set(1, 1.28, 1); rim.position.y = 0.48;
  const str = new THREE.Mesh(new THREE.CircleGeometry(0.125, 18), strings); str.scale.set(1, 1.28, 1); str.position.y = 0.48;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.26, 8), frame); shaft.position.y = 0.22;
  const gr = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 8), grip); gr.position.y = 0.06;
  const tip = new THREE.Object3D(); tip.position.y = 0.48; tip.name = 'tip';
  g.add(head, rim, str, shaft, gr, tip);
  return g;
}

function makeShuttle() {
  const g = new THREE.Group();
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.095, 12, 1, true), new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide, emissive: '#777770' }));
  skirt.position.y = 0.048; skirt.rotation.x = Math.PI;
  const cork = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshLambertMaterial({ color: '#ff7a18', emissive: '#441a04' }));
  g.add(skirt, cork); g.scale.setScalar(1.85);
  return g;
}

export interface BadmintonPlayerPose {
  pos: [number, number, number];
  vel: [number, number];
  yaw: number;
  jumpY: number;
  bodyPitch: number;
  bodyYaw: number;
  bodyRoll: number;
  squashY: number;
  armR: [number, number, number];
  armL: [number, number, number];
  curlR: number;
  curlL: number;
  racketRot: [number, number, number];
  legL: LegAngles;
  legR: LegAngles;
}

export interface BadmintonRallyState {
  u: number;
  A: BadmintonPlayerPose;
  B: BadmintonPlayerPose;
  shuttlePos: [number, number, number];
  shuttleVel: [number, number, number];
}

// 4-shot rally waypoints in court space:
// Shot 0 (t=0.45): A clear from (-1.52, +0.20) -> B smash spot (+1.42, -0.20) at t=2.05
// Shot 1 (t=2.05): B jump-smash from (+1.42, -0.20) -> A forecourt (-0.84, -0.24) at t=3.45
// Shot 2 (t=3.45): A net lunge drive from (-0.84, -0.24) -> B forecourt (+0.86, +0.24) at t=4.95
// Shot 3 (t=4.95): B net lunge lob from (+0.86, +0.24) -> A baseline (-1.52, +0.20) at t=6.40 (0.45)
const HIT_TIMES = [0.45, 2.05, 3.45, 4.95] as const;
const CONTACT_PTS: [number, number, number][] = [
  [-1.58, 1.32, 0.44],   // A overhead clear contact
  [1.52, 1.72, -0.44],   // B jump-smash high contact
  [-0.56, 0.78, -0.48],  // A low net-lunge drive contact
  [0.58, 0.74, 0.48],    // B low net-lunge lob contact
];

function evalCourtTrack(
  waypoints: { t: number; x: number; z: number }[],
  u: number,
): { x: number; z: number; vx: number; vz: number } {
  const n = waypoints.length;
  for (let i = 0; i < n; i++) {
    const w0 = waypoints[i]!;
    const w1 = waypoints[(i + 1) % n]!;
    const t0 = w0.t;
    const t1 = i === n - 1 ? w1.t + PERIOD : w1.t;
    const uu = u < waypoints[0]!.t ? u + PERIOD : u;
    if (uu >= t0 && uu <= t1) {
      const span = Math.max(0.05, t1 - t0);
      const raw = (uu - t0) / span;
      const k = ease(raw);
      const dk = (6 * raw * (1 - raw)) / span;
      return {
        x: lerp(w0.x, w1.x, k),
        z: lerp(w0.z, w1.z, k),
        vx: (w1.x - w0.x) * dk,
        vz: (w1.z - w0.z) * dk,
      };
    }
  }
  return { x: waypoints[0]!.x, z: waypoints[0]!.z, vx: 0, vz: 0 };
}

const WAYPOINTS_A = [
  { t: 0.45, x: -1.86, z: 0.46 },  // Hit 0: overhead clear at rear baseline corner
  { t: 1.35, x: -1.22, z: 0.04 },  // Sprint to split-step ready center
  { t: 2.20, x: -1.30, z: -0.12 }, // React to B's jump-smash
  { t: 3.35, x: -0.62, z: -0.52 }, // Sprint & deep lunge to forecourt net corner
  { t: 3.72, x: -0.66, z: -0.48 }, // Hold lunge follow-through briefly
  { t: 5.05, x: -1.36, z: 0.14 },  // Recover toward mid-court
  { t: 6.15, x: -1.86, z: 0.46 },  // Sprint back under incoming high lob
];

const WAYPOINTS_B = [
  { t: 0.45, x: 1.12, z: 0.12 },   // Ready stance watching A's clear
  { t: 1.62, x: 1.84, z: -0.46 },  // Sprint back to rear corner for jump-smash
  { t: 2.42, x: 1.72, z: -0.36 },  // Land from jump-smash
  { t: 3.45, x: 1.16, z: -0.04 },  // Sprint to center court split-step
  { t: 4.80, x: 0.62, z: 0.52 },   // Sprint & deep lunge to net corner
  { t: 5.22, x: 0.66, z: 0.48 },   // Hold net lunge follow-through
  { t: 6.20, x: 1.12, z: 0.12 },   // Recover to center ready stance
];

function cyclicDiff(u: number, target: number): number {
  let d = u - target;
  while (d > PERIOD / 2) d -= PERIOD;
  while (d < -PERIOD / 2) d += PERIOD;
  return d;
}

function buildPlayerPose(
  isB: boolean,
  u: number,
  track: { x: number; z: number; vx: number; vz: number },
  shuttlePos: [number, number, number],
): BadmintonPlayerPose {
  const TURN = 0.48;
  const baseYaw = isB ? -Math.PI / 2 + TURN : Math.PI / 2 - TURN;
  const dOverhead = cyclicDiff(u, isB ? HIT_TIMES[1] : HIT_TIMES[0]);
  const dNetLunge = cyclicDiff(u, isB ? HIT_TIMES[3] : HIT_TIMES[2]);

  const speed = Math.hypot(track.vx, track.vz);
  const runWeight = clamp((speed - 0.08) / 0.55, 0, 1);

  // Jump-smash envelope (for B around HIT_TIMES[1]=2.05, and smaller hop for A around HIT_TIMES[0]=0.45)
  let jumpY = 0;
  let squashY = 1.0;
  let isMidAir = false;
  let isCrouching = false;

  if (isB && dOverhead > -0.45 && dOverhead < 0.40) {
    if (dOverhead < -0.20) {
      // Crouch before explosive jump-smash
      const k = ease((dOverhead + 0.45) / 0.25);
      squashY = 1.0 - 0.14 * Math.sin(k * Math.PI);
      isCrouching = true;
    } else if (dOverhead < 0.24) {
      // Explosive leap into the air
      const k = (dOverhead + 0.20) / 0.44;
      jumpY = Math.sin(k * Math.PI) * 0.42;
      squashY = 1.0 + 0.10 * Math.sin(k * Math.PI);
      isMidAir = jumpY > 0.06;
    } else {
      // Cushioned landing squash
      const k = (dOverhead - 0.24) / 0.16;
      squashY = 1.0 - 0.12 * Math.sin(k * Math.PI);
    }
  } else if (!isB && dOverhead > -0.35 && dOverhead < 0.28) {
    if (dOverhead >= -0.15 && dOverhead <= 0.18) {
      const k = (dOverhead + 0.15) / 0.33;
      jumpY = Math.sin(k * Math.PI) * 0.24;
      isMidAir = jumpY > 0.05;
    }
  }

  // Lunge envelope around dNetLunge (-0.42 .. +0.38)
  const lungeEnv = dNetLunge > -0.42 && dNetLunge < 0.38
    ? Math.sin(Math.PI * 0.5 * clamp((dNetLunge + 0.42) / 0.32) * clamp((0.38 - dNetLunge) / 0.28))
    : 0;

  // Split-step continuous rhythm when neither lunging nor jumping
  const splitPhase = u * Math.PI * 3.5 + (isB ? 1.4 : 0);
  const splitBounce = (1 - lungeEnv) * (isMidAir ? 0 : 1) * Math.abs(Math.sin(splitPhase)) * 0.032;
  const totalY = jumpY + splitBounce;

  // ---- 3-BONE LEG FOOTWORK (legL & legR) ----
  const runPhase = u * Math.PI * 5.0 + (isB ? 0.9 : 0);
  const sL = Math.sin(runPhase);
  const cL = Math.cos(runPhase);

  // Base split-step / running leg angles
  const strideAmp = 0.42 + runWeight * 0.48;
  const kneeAmp = 0.55 + runWeight * 0.58;
  let hipL = sL * strideAmp;
  let hipR = -sL * strideAmp;
  // Bend knee strongly when the leg swings back (-s > 0) so the white shoe kicks high up behind the body!
  let kneeL = 0.15 + Math.max(0, -sL) * kneeAmp + Math.max(0, cL) * 0.35;
  let kneeR = 0.15 + Math.max(0, sL) * kneeAmp + Math.max(0, -cL) * 0.35;
  let footL = sL * 0.26;
  let footR = -sL * 0.26;
  let rollL = -0.08 - 0.05 * Math.sin(splitPhase);
  let rollR = 0.08 + 0.05 * Math.sin(splitPhase);

  if (isCrouching) {
    hipL = 0.42; hipR = 0.42;
    kneeL = 0.68; kneeR = 0.68;
    footL = 0.25; footR = 0.25;
  } else if (isMidAir) {
    // Mid-air jump-smash scissor/arch kick: legs kick back and bend at knees, then scissor forward at strike
    const strikeK = clamp((dOverhead + 0.15) / 0.25);
    hipL = lerp(-0.35, 0.32, strikeK);
    hipR = lerp(-0.52, -0.25, strikeK);
    kneeL = lerp(0.75, 0.35, strikeK);
    kneeR = lerp(0.82, 0.55, strikeK);
    footL = -0.32;
    footR = -0.38;
  } else if (lungeEnv > 0.05) {
    // Deep athletic front-leg lunge: racket-side leg (R) steps far forward with deep knee bend; left leg (L) trails extended behind
    hipR = lerp(hipR, 1.18, lungeEnv);
    kneeR = lerp(kneeR, 0.85, lungeEnv);
    footR = lerp(footR, 0.36, lungeEnv);
    rollR = lerp(rollR, 0.15, lungeEnv);

    hipL = lerp(hipL, -0.82, lungeEnv);
    kneeL = lerp(kneeL, 0.92, lungeEnv);
    footL = lerp(footL, -0.35, lungeEnv);
    rollL = lerp(rollL, -0.10, lungeEnv);
  }

  // ---- BOTH HANDS (armR racket whip + armL balance/sighting arm, outside height=1.18 torso radius 0.39m) & TORSO COIL ----
  // Ready stance defaults (racket held clearly outside right shoulder at x=0.52, y=0.58)
  const pump = Math.sin(runPhase) * (0.09 + runWeight * 0.14);
  let armR: [number, number, number] = [0.52, 0.56 + Math.abs(pump) * 0.28, 0.26 - pump];
  let armL: [number, number, number] = [-0.50, 0.50 + Math.abs(pump) * 0.28, 0.24 + pump];
  let curlR = 0.85;
  let curlL = 0.35;
  let bodyPitch = 0.10 + runWeight * 0.14;
  let bodyYaw = Math.sin(splitPhase * 0.5) * 0.16;
  let bodyRoll = Math.cos(splitPhase) * 0.08;
  let racketRot: [number, number, number] = [0.25, 0, -0.25];

  if (dOverhead > -0.52 && dOverhead < 0.45) {
    if (dOverhead < -0.10) {
      // Overhead wind-up / trophy pose: torso coils back, armR cocks racket high above head (y=0.98), armL points up at shuttlecock!
      const w = ease((dOverhead + 0.52) / 0.42);
      armR = [lerp(0.52, 0.56, w), lerp(0.56, 0.98, w), lerp(0.26, -0.08, w)];
      armL = [lerp(-0.50, -0.44, w), lerp(0.50, 0.90, w), lerp(0.24, 0.36, w)];
      curlL = 0.12;
      bodyPitch = lerp(0.10, -0.32, w);
      bodyYaw = lerp(0, -0.55, w);
      racketRot = [lerp(0.25, -0.85, w), 0, lerp(-0.25, -0.65, w)];
    } else if (dOverhead < 0.10) {
      // Explosive overhead whip through high contact point (y=1.06), left arm pulls down/back as counter-balance!
      const w = ease((dOverhead + 0.10) / 0.20);
      armR = [lerp(0.56, 0.46, w), lerp(0.98, 1.06, Math.sin(w * Math.PI)), lerp(-0.08, 0.38, w)];
      armL = [lerp(-0.44, -0.58, w), lerp(0.90, 0.38, w), lerp(0.36, -0.10, w)];
      curlL = 0.55;
      bodyPitch = lerp(-0.32, 0.28, w);
      bodyYaw = lerp(-0.55, 0.52, w);
      racketRot = [lerp(-0.85, 0.78, w), 0, lerp(-0.65, -0.12, w)];
    } else {
      // Cross-body follow-through & recovery to ready guard
      const w = ease((dOverhead - 0.10) / 0.35);
      armR = [lerp(0.46, 0.52, w), lerp(0.48, 0.56, w), lerp(0.38, 0.26, w)];
      armL = [lerp(-0.58, -0.50, w), lerp(0.38, 0.50, w), lerp(-0.10, 0.24, w)];
      bodyPitch = lerp(0.28, 0.10, w);
      bodyYaw = lerp(0.52, 0, w);
      racketRot = [lerp(0.78, 0.25, w), 0, lerp(-0.12, -0.25, w)];
    }
  } else if (dNetLunge > -0.48 && dNetLunge < 0.42) {
    if (dNetLunge < -0.08) {
      // Low backswing preparation as player lunges toward the net; left arm extends wide back for balance
      const w = ease((dNetLunge + 0.48) / 0.40);
      armR = [lerp(0.52, 0.62, w), lerp(0.56, 0.38, w), lerp(0.26, 0.04, w)];
      armL = [lerp(-0.50, -0.62, w), lerp(0.50, 0.74, w), lerp(0.24, -0.18, w)];
      curlL = 0.15;
      bodyPitch = lerp(0.10, 0.38, w);
      bodyYaw = lerp(0, -0.45, w);
      racketRot = [lerp(0.25, 0.95, w), 0, lerp(-0.25, -0.75, w)];
    } else if (dNetLunge < 0.12) {
      // Fast underhand/drive whip forward at the net (reaching z=0.44, y=0.72)
      const w = ease((dNetLunge + 0.08) / 0.20);
      armR = [lerp(0.62, 0.48, w), lerp(0.38, 0.72, w), lerp(0.04, 0.44, w)];
      armL = [lerp(-0.62, -0.54, w), lerp(0.74, 0.52, w), lerp(-0.18, 0.12, w)];
      bodyPitch = lerp(0.38, 0.30, w);
      bodyYaw = lerp(-0.45, 0.44, w);
      racketRot = [lerp(0.95, 0.22, w), 0, lerp(-0.75, 0.08, w)];
    } else {
      // Recovery from net lunge
      const w = ease((dNetLunge - 0.12) / 0.30);
      armR = [lerp(0.48, 0.52, w), lerp(0.72, 0.56, w), lerp(0.44, 0.26, w)];
      armL = [lerp(-0.54, -0.50, w), lerp(0.52, 0.50, w), lerp(0.12, 0.24, w)];
      bodyPitch = lerp(0.30, 0.10, w);
      bodyYaw = lerp(0.44, 0, w);
      racketRot = [lerp(0.22, 0.25, w), 0, lerp(0.08, -0.25, w)];
    }
  } else {
    // Track incoming shuttlecock with subtle body yaw & sighting arm adjustment
    const lookShuttleZ = clamp((shuttlePos[2] - track.z) * 0.4, -0.22, 0.22);
    bodyYaw += (isB ? -lookShuttleZ : lookShuttleZ);
  }

  return {
    pos: [track.x, totalY, track.z],
    vel: [track.vx, track.vz],
    yaw: baseYaw,
    jumpY,
    bodyPitch,
    bodyYaw,
    bodyRoll,
    squashY,
    armR,
    armL,
    curlR,
    curlL,
    racketRot,
    legL: { hipPitch: hipL, kneeBend: kneeL, footPitch: footL, hipRoll: rollL },
    legR: { hipPitch: hipR, kneeBend: kneeR, footPitch: footR, hipRoll: rollR },
  };
}

function evalShuttle(u: number): { pos: [number, number, number]; vel: [number, number, number] } {
  // 4 flight segments between HIT_TIMES = [0.45, 2.05, 3.45, 4.95]
  const arcs = [0.95, 0.16, 0.24, 1.05]; // High clear, steep smash, flat drive, high defensive lob
  for (let i = 0; i < 4; i++) {
    const t0 = HIT_TIMES[i]!;
    const t1 = i === 3 ? HIT_TIMES[0]! + PERIOD : HIT_TIMES[i + 1]!;
    const uu = u < HIT_TIMES[0]! ? u + PERIOD : u;
    if (uu >= t0 && uu <= t1) {
      const span = t1 - t0;
      const k = (uu - t0) / span;
      const p0 = CONTACT_PTS[i]!;
      const p1 = CONTACT_PTS[(i + 1) % 4]!;
      const arcH = arcs[i]!;
      const x = lerp(p0[0], p1[0], k);
      const z = lerp(p0[2], p1[2], k);
      const y = lerp(p0[1], p1[1], k) + Math.sin(k * Math.PI) * arcH;
      const vx = (p1[0] - p0[0]) / span;
      const vz = (p1[2] - p0[2]) / span;
      const vy = (p1[1] - p0[1]) / span + (Math.cos(k * Math.PI) * Math.PI * arcH) / span;
      return { pos: [x, y, z], vel: [vx, vy, vz] };
    }
  }
  return { pos: [...CONTACT_PTS[0]!], vel: [1, 0, 0] };
}

/** Pure, deterministic evaluator of the entire 2-player badminton rally at time `t` (seconds). */
export function computeBadmintonState(t: number): BadmintonRallyState {
  const u = ((t % PERIOD) + PERIOD) % PERIOD;
  const sh = evalShuttle(u);
  const trA = evalCourtTrack(WAYPOINTS_A, u);
  const trB = evalCourtTrack(WAYPOINTS_B, u);
  return {
    u,
    A: buildPlayerPose(false, u, trA, sh.pos),
    B: buildPlayerPose(true, u, trB, sh.pos),
    shuttlePos: sh.pos,
    shuttleVel: sh.vel,
  };
}

interface Player {
  root: THREE.Group;
  body: THREE.Group;
  pivot: THREE.Group;
  racket: THREE.Group;
  arms?: Partial<Record<Side, ArmChain>>;
  legs?: Partial<Record<Side, LegChain>>;
  side: number;
}

function usePlayer(level: 'high' | 'low'): Player {
  const p = useMemo<Player>(() => {
    const root = new THREE.Group(), body = new THREE.Group(), pivot = new THREE.Group(), racket = makeRacket();
    const egg = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), new THREE.MeshLambertMaterial({ color: '#f39a2e' }));
    egg.scale.set(1, 1.4, 0.95); egg.position.y = 0.45; egg.name = 'egg';
    body.add(egg); root.add(body); body.add(pivot); pivot.position.set(0.26, 0.55, 0.02); pivot.add(racket);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5).rotateX(-Math.PI / 2), shadowMat());
    sh.position.y = 0.005; sh.renderOrder = 1; root.add(sh);
    return { root, body, pivot, racket, side: 1 };
  }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      const m = await loadManifest(); const e = entryFor(m, 'tango');
      const gltf = await loadModel(e, level); if (!alive || !gltf) return;
      const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
      const obj = clone(gltf.scene);
      obj.traverse((o) => {
        const mm = o as THREE.Mesh;
        if (mm.isMesh) {
          mm.frustumCulled = false;
          const mt = mm.material as THREE.MeshStandardMaterial;
          if (mt?.isMeshStandardMaterial) mt.metalness = 0;
        }
      });
      normalise(obj, { ...e, height: 1.18, baseY: 0 });
      const egg = p.body.getObjectByName('egg'); if (egg) p.body.remove(egg);
      p.body.add(obj);
      obj.updateMatrixWorld(true); p.body.updateMatrixWorld(true);
      p.arms = findArms(obj);
      p.legs = findLegs(obj);
      const bone = p.arms.R?.up;
      if (bone) {
        const wp = p.body.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
        p.side = Math.sign(wp.x) || 1;
        p.pivot.position.set(wp.x + p.side * 0.1, wp.y, wp.z + 0.04);
      }
    })();
    return () => { alive = false; };
  }, [p, level]);
  return p;
}

const vBodyC = new THREE.Vector3(), vTarget = new THREE.Vector3(), vHand = new THREE.Vector3();

function applyBadmintonPlayer(p: Player, pose: BadmintonPlayerPose, dt: number) {
  p.root.position.set(pose.pos[0], 0, pose.pos[2]);
  p.root.rotation.y = pose.yaw;

  const sy = pose.squashY;
  p.body.position.y = pose.pos[1];
  p.body.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
  p.body.rotation.set(pose.bodyPitch, pose.bodyYaw, pose.bodyRoll);

  // Drive 3-bone articulated legs (legL -> legL_knee -> legL_foot & legR -> legR_knee -> legR_foot)
  if (p.legs) {
    poseLeg(p.legs.L, pose.legL.hipPitch, pose.legL.kneeBend, pose.legL.footPitch, pose.legL.hipRoll, dt);
    poseLeg(p.legs.R, pose.legR.hipPitch, pose.legR.kneeBend, pose.legR.footPitch, pose.legR.hipRoll, dt);
  }

  // Drive 4-bone articulated arms (armR racket arm + armL sighting/balance arm)
  if (p.arms?.R) {
    p.root.updateMatrixWorld(true);
    p.body.localToWorld(vBodyC.set(0, 0.42, -0.05));

    const armR = p.arms.R;
    armR.up.quaternion.copy(armR.restUp);
    resetArm(armR);
    p.body.localToWorld(vTarget.set(pose.armR[0], pose.armR[1], pose.armR[2]));
    for (let k = 0; k < 2; k++) solveArm(armR, vTarget, 1.0, vBodyC);
    curlArm(armR, pose.curlR);
    stepArmSmoothing(armR, dt, true);

    p.body.worldToLocal(handPos(armR, vHand));
    p.pivot.position.copy(vHand);
    p.pivot.rotation.set(pose.racketRot[0], pose.racketRot[1], pose.racketRot[2]);

    if (p.arms.L) {
      const armL = p.arms.L;
      armL.up.quaternion.copy(armL.restUp);
      resetArm(armL);
      p.body.localToWorld(vTarget.set(pose.armL[0], pose.armL[1], pose.armL[2]));
      for (let k = 0; k < 2; k++) solveArm(armL, vTarget, 0.95, vBodyC);
      curlArm(armL, pose.curlL);
      stepArmSmoothing(armL, dt, true);
    }
  } else {
    p.pivot.rotation.set(pose.racketRot[0], pose.racketRot[1], pose.racketRot[2]);
  }
}

export function Badminton({ at, yaw, level }: { at: [number, number, number]; yaw: number; level: 'high' | 'low' }) {
  const A = usePlayer(level), B = usePlayer(level);
  const shuttle = useMemo(makeShuttle, []);
  const court = useRef<THREE.Group>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), q: new THREE.Quaternion() }), []);

  useFrame((st, dt) => {
    const g = court.current; if (!g) return;
    const d = dt > 0 && dt < 0.25 ? dt : 1 / 60;
    const tOverride = (window as unknown as { __mlBadmintonTime?: number | null }).__mlBadmintonTime;
    const state = computeBadmintonState(tOverride != null ? tOverride : st.clock.elapsedTime);

    applyBadmintonPlayer(A, state.A, d);
    applyBadmintonPlayer(B, state.B, d);

    shuttle.position.set(state.shuttlePos[0], state.shuttlePos[1], state.shuttlePos[2]);
    tmp.v.set(state.shuttleVel[0], state.shuttleVel[1], state.shuttleVel[2]);
    if (tmp.v.lengthSq() > 1e-6) {
      tmp.q.setFromUnitVectors(tmp.up, tmp.v.normalize().negate());
      shuttle.quaternion.slerp(tmp.q, 0.55);
    }
  });

  return (
    <group ref={court} position={at} rotation={[0, yaw, 0]}>
      {ready && <><primitive object={A.root} /><primitive object={B.root} /><primitive object={shuttle} /></>}
    </group>
  );
}
export { FLOOR_Y, COURT };
