// Character "actors" for card actions & full-body animation: every rigged 3D figure registers here per seat, and card
// choreography (backend3d) + table/scene loops drive it: 4-bone arm IK reach, paw/finger curl, 3-bone leg articulation,
// whole-body forward shift & shoulder coil, off-hand table bracing, head look-at, and dynamic facial expressions.
import * as THREE from 'three';

export type Side = 'L' | 'R';

export interface ArmChain {
  up: THREE.Bone;
  fore: THREE.Bone;
  hand: THREE.Bone;
  curl: THREE.Bone | null;
  restUp: THREE.Quaternion;
  restFore: THREE.Quaternion;
  restHand: THREE.Quaternion;
  restCurl: THREE.Quaternion | null;
  smoothUp: THREE.Quaternion;
  smoothFore: THREE.Quaternion;
  smoothHand: THREE.Quaternion;
  smoothCurl: THREE.Quaternion | null;
  inited?: boolean;
}

export interface LegChain {
  hip: THREE.Bone;
  knee: THREE.Bone;
  foot: THREE.Bone;
  restHip: THREE.Quaternion;
  restKnee: THREE.Quaternion;
  restFoot: THREE.Quaternion;
  restPosHip: THREE.Vector3;
  restPosKnee: THREE.Vector3;
  restPosFoot: THREE.Vector3;
  smoothHip: THREE.Quaternion;
  smoothKnee: THREE.Quaternion;
  smoothFoot: THREE.Quaternion;
  axHip: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  axKnee: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  axFoot: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  inited?: boolean;
}

export interface LegAngles {
  hipPitch: number;
  kneeBend: number;
  footPitch: number;
  hipRoll: number;
}

export interface ArmCmd {
  target: THREE.Vector3;
  w: number;
  curl: number;
  hold?: boolean;
}

export interface ActorCmd {
  arm: Partial<Record<Side, ArmCmd>>;
  look: THREE.Vector3 | null;
  lookW: number;
  lean: number;
  focus: number;
  /** Optional seat-local root translation [x, y, z] (e.g. shifting forward +z into the table during a deep reach). */
  shift?: [number, number, number];
  /** Optional torso/shoulder yaw coil (radians) leading the reaching hand. */
  yaw?: number;
  blinkUntil?: number;
  mouthOpen?: number;
  mouthSmile?: number;
  mouthWidth?: number;
}

export interface Actor {
  seat: number;
  id?: string;
  motion?: string;
  root: THREE.Object3D;
  arms: Partial<Record<Side, ArmChain>>;
  legs?: Partial<Record<Side, LegChain>>;
  head: THREE.Bone | null;
  cmd: ActorCmd;
  lowDetail: boolean;
}

/** Table cards a staged action is carrying right now (the sprite in the hand stands in for them). */
export const stagedHidden = new Set<string>();

const reg = new Map<number, Actor>();
export const actorFor = (seat: number) => reg.get(seat) ?? null;
export function registerActor(a: Actor) {
  reg.set(a.seat, a);
  return () => {
    if (reg.get(a.seat) === a) reg.delete(a.seat);
  };
}
export const newCmd = (): ActorCmd => ({ arm: {}, look: null, lookW: 0, lean: 0, focus: 0 });

export function findArms(root: THREE.Object3D): Partial<Record<Side, ArmChain>> {
  const out: Partial<Record<Side, ArmChain>> = {};
  for (const s of ['L', 'R'] as Side[]) {
    const g = (n: string) => root.getObjectByName(n) as THREE.Bone | undefined;
    const up = g('arm' + s), fore = g(`arm${s}_fore`), hand = g(`arm${s}_hand`), curl = g(`arm${s}_curl`) ?? null;
    if (up && fore && hand) {
      out[s] = {
        up,
        fore,
        hand,
        curl,
        restUp: up.quaternion.clone(),
        restFore: fore.quaternion.clone(),
        restHand: hand.quaternion.clone(),
        restCurl: curl?.quaternion.clone() ?? null,
        smoothUp: up.quaternion.clone(),
        smoothFore: fore.quaternion.clone(),
        smoothHand: hand.quaternion.clone(),
        smoothCurl: curl?.quaternion.clone() ?? null,
        inited: false,
      };
    }
  }
  return out;
}

function localAxesForBone(rootQInv: THREE.Quaternion, bone: THREE.Bone): [THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  const wq = rootQInv.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion())).invert();
  return [
    new THREE.Vector3(1, 0, 0).applyQuaternion(wq).normalize(),
    new THREE.Vector3(0, 1, 0).applyQuaternion(wq).normalize(),
    new THREE.Vector3(0, 0, 1).applyQuaternion(wq).normalize(),
  ];
}

/** Discovers the 3-bone articulated leg chains (legL -> legL_knee -> legL_foot & legR -> legR_knee -> legR_foot). */
export function findLegs(root: THREE.Object3D): Partial<Record<Side, LegChain>> {
  const out: Partial<Record<Side, LegChain>> = {};
  root.updateMatrixWorld(true);
  const rootQInv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  for (const s of ['L', 'R'] as Side[]) {
    const g = (n: string) => root.getObjectByName(n) as THREE.Bone | undefined;
    const hip = g('leg' + s), knee = g(`leg${s}_knee`), foot = g(`leg${s}_foot`);
    if (hip && knee && foot) {
      out[s] = {
        hip,
        knee,
        foot,
        restHip: hip.quaternion.clone(),
        restKnee: knee.quaternion.clone(),
        restFoot: foot.quaternion.clone(),
        restPosHip: hip.position.clone(),
        restPosKnee: knee.position.clone(),
        restPosFoot: foot.position.clone(),
        smoothHip: hip.quaternion.clone(),
        smoothKnee: knee.quaternion.clone(),
        smoothFoot: foot.quaternion.clone(),
        axHip: localAxesForBone(rootQInv, hip),
        axKnee: localAxesForBone(rootQInv, knee),
        axFoot: localAxesForBone(rootQInv, foot),
        inited: false,
      };
    }
  }
  return out;
}

const qLeg1 = new THREE.Quaternion(), qLeg2 = new THREE.Quaternion();

export function resetLeg(leg: LegChain | undefined) {
  if (!leg) return;
  leg.hip.quaternion.copy(leg.restHip);
  leg.knee.quaternion.copy(leg.restKnee);
  leg.foot.quaternion.copy(leg.restFoot);
  leg.hip.position.copy(leg.restPosHip);
  leg.knee.position.copy(leg.restPosKnee);
  leg.foot.position.copy(leg.restPosFoot);
}

export function stepLegSmoothing(leg: LegChain, dt: number) {
  const d = dt > 0 && dt < 0.25 ? dt : 1 / 60;
  if (!leg.inited) {
    leg.smoothHip.copy(leg.hip.quaternion);
    leg.smoothKnee.copy(leg.knee.quaternion);
    leg.smoothFoot.copy(leg.foot.quaternion);
    leg.inited = true;
    return;
  }
  const kHip = 1 - Math.exp(-d * 22.0);
  const kKnee = 1 - Math.exp(-d * 20.0);
  const kFoot = 1 - Math.exp(-d * 18.0);
  leg.smoothHip.slerp(leg.hip.quaternion, kHip);
  leg.smoothKnee.slerp(leg.knee.quaternion, kKnee);
  leg.smoothFoot.slerp(leg.foot.quaternion, kFoot);
  leg.hip.quaternion.copy(leg.smoothHip);
  leg.knee.quaternion.copy(leg.smoothKnee);
  leg.foot.quaternion.copy(leg.smoothFoot);
  leg.hip.updateMatrixWorld(true);
}

/** Poses a 3-bone leg chain:
 *  - hipPitch > 0 swings the thigh/knee forward (+Z) and up (+Y); hipPitch < 0 swings backward (-Z).
 *  - kneeBend >= 0 bends the lower leg backward (-Z) at the knee joint.
 *  - footPitch > 0 lifts the toes up (heel strike); footPitch < 0 points the toes down (push-off).
 *  - hipRoll swings the leg laterally. */
export function poseLeg(
  leg: LegChain | undefined,
  hipPitch: number,
  kneeBend: number,
  footPitch = 0,
  hipRoll = 0,
  dt?: number,
) {
  if (!leg) return;
  resetLeg(leg);
  // Expressive Pixar stride & knee lift: combine bone rotation with subtle socket extension so compact cartoon legs read clearly
  leg.hip.position.set(
    leg.restPosHip.x + hipRoll * 0.03,
    leg.restPosHip.y + Math.max(0, kneeBend - 0.2) * 0.035 + Math.max(0, hipPitch) * 0.025,
    leg.restPosHip.z + Math.sin(hipPitch) * 0.055,
  );
  if (Math.abs(hipPitch) > 1e-4) {
    leg.hip.quaternion.multiply(qLeg1.setFromAxisAngle(leg.axHip[0], -hipPitch));
  }
  if (Math.abs(hipRoll) > 1e-4) {
    leg.hip.quaternion.multiply(qLeg2.setFromAxisAngle(leg.axHip[2], hipRoll));
  }
  const kb = Math.max(0, kneeBend);
  if (kb > 1e-4) {
    leg.knee.quaternion.multiply(qLeg1.setFromAxisAngle(leg.axKnee[0], kb));
  }
  if (Math.abs(footPitch) > 1e-4) {
    leg.foot.quaternion.multiply(qLeg1.setFromAxisAngle(leg.axFoot[0], -footPitch));
  }
  if (dt !== undefined) {
    stepLegSmoothing(leg, dt);
  } else {
    leg.hip.updateMatrixWorld(true);
  }
}

/** Pure, deterministic walking/running gait evaluator for 3-bone legs + torso/arms.
 *  Notice how on the back-swing / recovery phase (-s > 0 or +c > 0), the knee bends sharply backward (up to 1.05 rad)
 *  while on the forward reach (+s > 0), the thigh kicks forward (+0.72 rad) with an extended knee so the two legs
 *  create a wide, unmistakable scissor stride! */
export function computeWalkGait(phase: number, stride = 1.0): {
  L: LegAngles;
  R: LegAngles;
  bob: number;
  hipRoll: number;
  torsoTwist: number;
  armSwing: number;
} {
  const k = THREE.MathUtils.clamp(stride, 0, 1.4);
  const sL = Math.sin(phase);
  const cL = Math.cos(phase);
  const sR = -sL;
  const cR = -cL;

  const hipL = sL * 0.72 * k;
  const hipR = sR * 0.72 * k;
  // Bend knee strongly during back-to-forward recovery lift (max(0, -s) + max(0, c)) so the shoe lifts high clear of the floor!
  const kneeL = (Math.max(0, -sL) * 0.85 + Math.max(0, cL) * 0.55 + 0.08) * k;
  const kneeR = (Math.max(0, -sR) * 0.85 + Math.max(0, cR) * 0.55 + 0.08) * k;
  const footL = (sL * 0.38 - Math.max(0, -sL) * 0.30) * k;
  const footR = (sR * 0.38 - Math.max(0, -sR) * 0.30) * k;
  const rollL = -0.06 * cL * k;
  const rollR = 0.06 * cR * k;

  return {
    L: { hipPitch: hipL, kneeBend: kneeL, footPitch: footL, hipRoll: rollL },
    R: { hipPitch: hipR, kneeBend: kneeR, footPitch: footR, hipRoll: rollR },
    bob: Math.abs(Math.cos(phase)) * 0.052 * k,
    hipRoll: sL * 0.08 * k,
    torsoTwist: -sL * 0.22 * k,
    armSwing: -sL * 0.18 * k,
  };
}

/** Pure, deterministic leg pose evaluator for all 7 characters at the table (idle dangle, active reach bracing,
 *  happy/win foot kicking, slam stamping, and surprised recoil). */
export function computeSeatedLegPose(
  id: string | undefined,
  seat: number,
  t: number,
  mood: string,
  lean = 0,
  em: (ActiveEmote & { u: number }) | null = null,
  reaching = false,
): { L: LegAngles; R: LegAngles } {
  const s0 = seat * 1.93 + (id === 'tango' ? 0.3 : id === 'ammar' ? 1.1 : 2.1);
  const isStanding = id === 'ammar';
  const scale = isStanding ? 0.65 : 1.0;

  if (em) {
    if (em.kind === 'cheer' || em.kind === 'win') {
      const kick = Math.sin(em.u * Math.PI * 10);
      return {
        L: { hipPitch: (0.45 + kick * 0.48) * scale, kneeBend: (0.25 + Math.max(0, -kick) * 0.75) * scale, footPitch: kick * 0.38, hipRoll: -0.08 },
        R: { hipPitch: (0.45 - kick * 0.48) * scale, kneeBend: (0.25 + Math.max(0, kick) * 0.75) * scale, footPitch: -kick * 0.38, hipRoll: 0.08 },
      };
    }
    if (em.kind === 'slam') {
      const cyc = (em.u * 3) % 1;
      const lift = cyc < 0.45 ? Math.sin((cyc / 0.45) * Math.PI) : 0;
      return {
        L: { hipPitch: lift * 0.55 * scale, kneeBend: (0.25 + lift * 0.55) * scale, footPitch: lift * 0.35, hipRoll: -0.06 },
        R: { hipPitch: lift * 0.55 * scale, kneeBend: (0.25 + lift * 0.55) * scale, footPitch: lift * 0.35, hipRoll: 0.06 },
      };
    }
    if (em.kind === 'sputter') {
      const fl = Math.sin(em.u * Math.PI * 14);
      return {
        L: { hipPitch: (0.55 + fl * 0.28) * scale, kneeBend: 0.65 * scale, footPitch: 0.35, hipRoll: -0.10 },
        R: { hipPitch: (0.55 - fl * 0.28) * scale, kneeBend: 0.65 * scale, footPitch: 0.35, hipRoll: 0.10 },
      };
    }
  }

  if (mood === 'happy') {
    const kick = Math.sin(t * 7.5 + s0);
    return {
      L: { hipPitch: (0.40 + kick * 0.42) * scale, kneeBend: (0.25 + Math.max(0, -kick) * 0.65) * scale, footPitch: kick * 0.32, hipRoll: -0.07 },
      R: { hipPitch: (0.40 - kick * 0.42) * scale, kneeBend: (0.25 + Math.max(0, kick) * 0.65) * scale, footPitch: -kick * 0.32, hipRoll: 0.07 },
    };
  }

  if (mood === 'surprised') {
    return {
      L: { hipPitch: 0.52 * scale, kneeBend: 0.62 * scale, footPitch: 0.30, hipRoll: -0.10 },
      R: { hipPitch: 0.52 * scale, kneeBend: 0.62 * scale, footPitch: 0.30, hipRoll: 0.10 },
    };
  }

  if (reaching || lean > 0.08) {
    const br = Math.min(1, Math.max(lean * 2.5, reaching ? 0.85 : 0));
    return {
      L: { hipPitch: 0.32 * br * scale, kneeBend: 0.55 * br * scale, footPitch: -0.24 * br, hipRoll: -0.08 * br },
      R: { hipPitch: 0.32 * br * scale, kneeBend: 0.55 * br * scale, footPitch: -0.24 * br, hipRoll: 0.08 * br },
    };
  }

  const sw = Math.sin(t * 2.35 + s0);
  const sw2 = Math.cos(t * 1.55 + s0 * 0.7);
  return {
    L: {
      hipPitch: (0.22 + sw * 0.28) * scale,
      kneeBend: (0.28 + Math.max(0, -sw) * 0.42) * scale,
      footPitch: (sw * 0.26 + sw2 * 0.08) * scale,
      hipRoll: -0.05 * scale,
    },
    R: {
      hipPitch: (0.22 - sw * 0.28) * scale,
      kneeBend: (0.28 + Math.max(0, sw) * 0.42) * scale,
      footPitch: (-sw * 0.26 + sw2 * 0.08) * scale,
      hipRoll: 0.05 * scale,
    },
  };
}

const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), vD = new THREE.Vector3(), vE = new THREE.Vector3(), vP = new THREE.Vector3();
const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), qC = new THREE.Quaternion(), qI = new THREE.Quaternion(), qW = new THREE.Quaternion();
function aim(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, w: number) {
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
  qW.setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
  qA.slerpQuaternions(qI, qW, w);
  bone.getWorldQuaternion(qB);
  qB.premultiply(qA);
  bone.parent!.getWorldQuaternion(qC).invert();
  bone.quaternion.copy(qC.multiply(qB));
  bone.updateMatrixWorld(true);
}
export const handPos = (c: ArmChain, out = new THREE.Vector3()) => (c.curl ?? c.hand).getWorldPosition(out);
export const shoulderPos = (c: ArmChain, out = new THREE.Vector3()) => c.up.getWorldPosition(out);
export function armLength(c: ArmChain) {
  c.up.getWorldPosition(vA); c.fore.getWorldPosition(vB); (c.curl ?? c.hand).getWorldPosition(vC);
  return vA.distanceTo(vB) + vB.distanceTo(vC);
}

/** Analytic two-bone IK: shoulder -> elbow -> hand reaches t (clamped to the arm length: limbs never stretch). */
export function solveArm(c: ArmChain, t: THREE.Vector3, w: number, bodyCentre: THREE.Vector3) {
  if (w <= 0.001) return;
  c.up.updateMatrixWorld(true);
  const S = c.up.getWorldPosition(vA), E = c.fore.getWorldPosition(vB), H = (c.curl ?? c.hand).getWorldPosition(vC);
  const a = S.distanceTo(E), b = E.distanceTo(H);
  const toT = vD.copy(t).sub(S); let d = toT.length(); if (d < 1e-5) return;
  const dir = toT.divideScalar(d);
  d = Math.min(Math.max(d, Math.abs(a - b) + 1e-3), (a + b) * 0.985);
  vP.copy(S).sub(bodyCentre); vP.y = 0; if (vP.lengthSq() < 1e-8) vP.set(1, 0, 0); vP.normalize();
  vP.y -= 0.35;
  vP.addScaledVector(vE.copy(t).sub(bodyCentre).setY(0).normalize(), 0.35);
  const n = vP.addScaledVector(dir, -vP.dot(dir)); if (n.lengthSq() < 1e-8) n.set(0, -1, 0); n.normalize();
  const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  const E2 = vE.copy(S).addScaledVector(dir, a * cosA).addScaledVector(n, a * sinA);
  aim(c.up, E.clone().sub(S), E2.clone().sub(S), w);
  const E3 = c.fore.getWorldPosition(new THREE.Vector3()), H3 = (c.curl ?? c.hand).getWorldPosition(new THREE.Vector3());
  const T2 = S.clone().addScaledVector(dir, d);
  aim(c.fore, H3.sub(E3), T2.sub(E3), w);
}

const X = new THREE.Vector3(1, 0, 0);
export function curlArm(c: ArmChain, k: number) {
  if (k <= 0.001) return;
  const eff = c.up.parent?.name === 'body' ? Math.min(k, 0.55) : k;
  c.hand.quaternion.multiply(qA.setFromAxisAngle(X, -0.35 * eff));
  if (c.curl) c.curl.quaternion.multiply(qA.setFromAxisAngle(X, -1.0 * eff));
}

export function stepArmSmoothing(c: ArmChain, dt: number, activeReach = false) {
  const d = dt > 0 && dt < 0.25 ? dt : 1 / 60;
  if (!c.inited) {
    c.smoothUp.copy(c.up.quaternion);
    c.smoothFore.copy(c.fore.quaternion);
    c.smoothHand.copy(c.hand.quaternion);
    if (c.curl && c.smoothCurl) c.smoothCurl.copy(c.curl.quaternion);
    c.inited = true;
    return;
  }
  const boost = activeReach ? 1.55 : 1.0;
  const kUp = 1 - Math.exp(-d * 18.0 * boost);
  const kFore = 1 - Math.exp(-d * 15.0 * boost);
  const kHand = 1 - Math.exp(-d * 12.0 * boost);
  const kCurl = 1 - Math.exp(-d * 16.0 * boost);
  c.smoothUp.slerp(c.up.quaternion, kUp);
  c.smoothFore.slerp(c.fore.quaternion, kFore);
  c.smoothHand.slerp(c.hand.quaternion, kHand);
  c.up.quaternion.copy(c.smoothUp);
  c.fore.quaternion.copy(c.smoothFore);
  c.hand.quaternion.copy(c.smoothHand);
  if (c.curl && c.smoothCurl) {
    c.smoothCurl.slerp(c.curl.quaternion, kCurl);
    c.curl.quaternion.copy(c.smoothCurl);
  }
  c.up.updateMatrixWorld(true);
}

export function resetArm(c: ArmChain) {
  c.fore.quaternion.copy(c.restFore);
  c.hand.quaternion.copy(c.restHand);
  if (c.curl && c.restCurl) c.curl.quaternion.copy(c.restCurl);
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t: number, s = 1.4) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
export const seg = (t: number, a: number, b: number) => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);

export type EmoteKind = 'wave' | 'cheer' | 'boo' | 'slam' | 'win' | 'sputter';
export const HUD_EMOTES: { kind: EmoteKind; icon: string; label: string }[] = [
  { kind: 'wave',  icon: '👋', label: 'Wave' },
  { kind: 'cheer', icon: '🎉', label: 'Cheer' },
  { kind: 'boo',   icon: '😜', label: 'Boo' },
  { kind: 'slam',  icon: '💢', label: 'Slam' },
];
const EMOTE_META: Record<EmoteKind, { icon: string; label: string; ms: number }> = {
  wave:    { icon: '👋', label: 'Wave!',   ms: 1800 },
  cheer:   { icon: '🎉', label: 'Cheer!',  ms: 2100 },
  boo:     { icon: '😜', label: 'Boo!',    ms: 2200 },
  slam:    { icon: '💢', label: 'Slam!',   ms: 2400 },
  win:     { icon: '🏆', label: 'Yeah!',   ms: 2900 },
  sputter: { icon: '💦', label: 'Brrr!',   ms: 1500 },
};

export interface ActiveEmote {
  seat: number;
  kind: EmoteKind;
  icon: string;
  label: string;
  startedAt: number;
  duration: number;
  lockedProgress?: number;
}

const emotes = new Map<number, ActiveEmote>();
const emoteListeners = new Set<() => void>();
export function subscribeEmotes(cb: () => void) { emoteListeners.add(cb); return () => { emoteListeners.delete(cb); }; }
function notifyEmotes() { for (const cb of emoteListeners) cb(); }

export function triggerEmote(seat: number, kind: EmoteKind, opts: { progress?: number; duration?: number } = {}) {
  const meta = EMOTE_META[kind] ?? EMOTE_META.wave;
  emotes.set(seat, {
    seat,
    kind,
    icon: meta.icon,
    label: meta.label,
    startedAt: performance.now(),
    duration: opts.duration ?? meta.ms,
    lockedProgress: opts.progress,
  });
  notifyEmotes();
}

export function clearEmotes() { emotes.clear(); notifyEmotes(); }

export function activeEmoteFor(seat: number, now = performance.now()): (ActiveEmote & { u: number }) | null {
  const e = emotes.get(seat);
  if (!e) return null;
  if (e.lockedProgress !== undefined) {
    return { ...e, u: THREE.MathUtils.clamp(e.lockedProgress, 0, 1) };
  }
  const u = (now - e.startedAt) / e.duration;
  if (u < 0 || u >= 1) {
    emotes.delete(seat);
    return null;
  }
  return { ...e, u };
}

export function clampArmTarget(tLoc: [number, number, number], sd: Side, id?: string): [number, number, number] {
  const sgn = sd === 'L' ? -1 : 1;
  let [x, y, z] = tLoc;
  if (id === 'tango') {
    const minLat = z < 0.22 ? 0.36 : 0.30;
    if (sgn * x < minLat) x = sgn * minLat;
    if (z < 0.08) z = 0.08;
  } else if (id === 'sugar' || id === 'choco') {
    const minLat = z < 0.18 ? 0.18 : 0.12;
    if (sgn * x < minLat) x = sgn * minLat;
    if (z < 0.08) z = 0.08;
  } else {
    const minLat = z < 0.18 ? 0.155 : 0.085;
    if (sgn * x < minLat) x = sgn * minLat;
  }
  return [x, y, z];
}

export interface EmotePose {
  tL: [number, number, number] | null;
  tR: [number, number, number] | null;
  wL: number;
  wR: number;
  cL: number;
  cR: number;
  lean: number;
  hop: number;
  shake: number;
  blink: number;
  cupBounce: number;
}

export function computeEmotePose(kind: EmoteKind, u: number): EmotePose {
  u = THREE.MathUtils.clamp(u, 0, 1);
  const env = Math.sin(Math.PI * 0.5 * Math.min(1, u / 0.14)) * Math.sin(Math.PI * 0.5 * Math.min(1, (1 - u) / 0.14));
  if (kind === 'wave') {
    const wv = Math.sin(u * Math.PI * 8) * 0.085;
    return {
      tL: [-0.26, 0.06, 0.16],
      tR: [0.29 + wv, 0.48, 0.22],
      wL: 0.6 * env, wR: env,
      cL: 0.35, cR: 0.12,
      lean: 0.06 * env,
      hop: Math.abs(Math.sin(u * Math.PI * 4)) * 0.02 * env,
      shake: Math.sin(u * Math.PI * 4) * 0.12 * env,
      blink: u > 0.3 && u < 0.55 ? 0.85 : 0.2,
      cupBounce: 0,
    };
  }
  if (kind === 'cheer') {
    const pump = Math.abs(Math.sin(u * Math.PI * 6));
    const clapPhase = u > 0.55;
    const clap = Math.abs(Math.sin((u - 0.55) * Math.PI * 10)) * 0.075;
    return {
      tL: clapPhase ? [-0.18 - clap, 0.34, 0.29] : [-0.29, 0.48 + pump * 0.09, 0.20],
      tR: clapPhase ? [0.18 + clap, 0.34, 0.29]  : [0.29, 0.48 + pump * 0.09, 0.20],
      wL: env, wR: env,
      cL: clapPhase ? 0.2 : 0.8, cR: clapPhase ? 0.2 : 0.8,
      lean: -0.08 * env,
      hop: pump * 0.055 * env,
      shake: Math.sin(u * Math.PI * 6) * 0.14 * env,
      blink: 0.45 * env,
      cupBounce: 0,
    };
  }
  if (kind === 'boo') {
    const wag = Math.abs(Math.sin(u * Math.PI * 6));
    return {
      tL: [-0.22, 0.32, 0.29],
      tR: [0.23, 0.30 - wag * 0.065, 0.30],
      wL: env, wR: env,
      cL: 0.55, cR: 0.9,
      lean: 0.20 * env,
      hop: wag * 0.025 * env,
      shake: Math.sin(u * Math.PI * 5) * 0.26 * env,
      blink: 0.48 * env,
      cupBounce: 0,
    };
  }
  if (kind === 'win') {
    return u < 0.5 ? computeEmotePose('cheer', u / 0.5) : computeEmotePose('boo', (u - 0.5) / 0.5);
  }
  if (kind === 'sputter') {
    const fl = Math.sin(u * Math.PI * 14);
    return {
      tL: [-0.27, 0.38 + fl * 0.03, 0.24],
      tR: [0.27, 0.38 - fl * 0.03, 0.24],
      wL: env, wR: env,
      cL: 0.25, cR: 0.25,
      lean: -0.15 * env,
      hop: Math.abs(fl) * 0.03 * env,
      shake: fl * 0.34 * env,
      blink: (0.4 + 0.6 * Math.abs(Math.sin(u * Math.PI * 10))) * env,
      cupBounce: 0,
    };
  }
  const cyc = (u * 3) % 1;
  const down = cyc < 0.42 ? easeInOut(cyc / 0.42) : cyc < 0.62 ? 1 - easeInOut((cyc - 0.42) / 0.20) : 0.25 * Math.sin(((cyc - 0.62) / 0.38) * Math.PI);
  const rimY = Math.max(0.025, 0.028 + down * 0.165);
  const impact = cyc >= 0.54 && cyc <= 0.86 ? Math.sin(((cyc - 0.54) / 0.32) * Math.PI) : 0;
  return {
    tL: [-0.23, rimY, 0.27],
    tR: [0.23, rimY, 0.27],
    wL: env, wR: env,
    cL: 1.0, cR: 1.0,
    lean: (0.34 + (1 - down) * 0.10) * env,
    hop: -0.025 * env + impact * 0.015,
    shake: Math.sin(u * Math.PI * 6) * 0.08 * env,
    blink: 0.55 * env,
    cupBounce: impact * 0.022 * env,
  };
}

export function seatCupBounce(seat: number, now = performance.now()): number {
  let b = 0;
  for (const [s, e] of emotes) {
    if (e.kind !== 'slam') continue;
    const act = activeEmoteFor(s, now);
    if (!act) continue;
    const p = computeEmotePose('slam', act.u);
    b = Math.max(b, p.cupBounce * (s === seat ? 1 : 0.45));
  }
  return b;
}

export interface IdlePose {
  tL: [number, number, number];
  tR: [number, number, number];
  cL: number;
  cR: number;
  hipsRoll: number;
  spinePitch: number;
  spineYaw: number;
  spineRoll: number;
  headRoll: number;
  mouthOpen: number;
  mouthSmile: number;
  mouthWidth: number;
}

/** Pure, continuous relaxed idle generator for all 7 characters so none ever freezes in bind pose. */
export function computeIdlePose(id: string | undefined, seat: number, t: number, mood: string, lookYaw = 0): IdlePose {
  const s0 = seat * 2.17 + (id === 'tango' ? 0.4 : id === 'ammar' ? 1.3 : id === 'biscuit' ? 0.8 : id === 'mint' ? 1.9 : 2.4);
  const u1 = t * 1.15 + s0;
  const u2 = t * 1.65 + s0 * 1.7;
  const u3 = t * 2.35 + s0 * 0.6;

  const wave = Math.sin(t * 1.25 + seat * 1.9);
  const wRimR = Math.pow(Math.max(0, wave), 1.4);
  const wGestL = mood === 'think' ? 0.85 : Math.pow(Math.max(0, -wave), 1.4);

  const isOrange = id === 'tango';
  const isBlocky = id === 'sugar' || id === 'choco';
  const downX = isOrange ? 0.37 : isBlocky ? 0.19 : id === 'ammar' ? 0.175 : 0.21;
  const downY = isOrange ? -0.04 : isBlocky ? 0.02 : id === 'ammar' ? -0.07 : -0.04;
  const downZ = isOrange ? 0.18 : isBlocky ? 0.18 : 0.12;

  const br = Math.sin(t * 2.1);
  const dxL = Math.sin(u2) * 0.028;
  const dyL = Math.cos(u3) * 0.026 + br * 0.012;
  const dzL = Math.sin(u2 * 0.8) * 0.028;

  const dxR = Math.cos(u2 + 1.2) * 0.028;
  const dyR = Math.sin(u3 + 0.9) * 0.026 + br * 0.012;
  const dzR = Math.cos(u2 * 0.85 + 0.5) * 0.028;

  const lx = -downX + dxL + wGestL * (isOrange ? 0.03 : 0.05);
  const ly = downY + dyL + wGestL * (mood === 'think' ? 0.26 : 0.22);
  const lz = downZ + dzL + wGestL * 0.14;
  const cL = 0.28 - wGestL * 0.14 + Math.sin(u3) * 0.08;

  const tap = wRimR > 0.35 ? Math.max(0, Math.sin(t * 6.0)) * 0.024 : 0;
  const rx = downX + dxR - wRimR * (isOrange ? 0.03 : 0.04);
  const ry = downY + dyR + wRimR * 0.14 + tap;
  const rz = downZ + dzR + wRimR * 0.14;
  const cR = 0.32 + (wRimR * 0.16 - tap * 6) + Math.cos(u3) * 0.08;

  const sway = Math.sin(u1 * 1.1) * 0.095 + Math.sin(u2 * 0.9) * 0.04;
  const hipsRoll = sway * 0.6;
  const spineRoll = sway * (isOrange ? 1.2 : 0.9);
  const spinePitch = -0.025 * br + Math.sin(u1 * 0.8) * 0.048 + (mood === 'sad' ? 0.14 : 0);
  const spineYaw = lookYaw * 0.42 + Math.sin(u1 * 0.7) * 0.12;
  const headRoll = -lookYaw * 0.26 + Math.sin(u2 * 0.8) * 0.085 + (mood === 'think' ? 0.14 : 0);

  const chatWave = 0.5 + 0.5 * Math.sin(t * 1.55 + s0 * 1.3);
  const chatPulse = Math.max(0, Math.sin(t * 5.2 + s0)) * 0.22;
  let mouthOpen = 0, mouthSmile = 0.34, mouthWidth = 1.0;
  if (isOrange) {
    mouthOpen = chatWave > 0.28 ? 0.42 + (chatWave - 0.28) * 0.68 + chatPulse : 0.12 * chatWave;
    mouthSmile = mood === 'think' ? 0.04 : 0.38;
    mouthWidth = mood === 'think' ? 0.62 : 1.06;
  } else if (id !== 'ammar' && id !== 'pepper') {
    mouthOpen = chatWave > 0.42 ? (chatWave - 0.42) * 0.65 + chatPulse * 0.5 : 0.08 * chatWave;
    mouthSmile = mood === 'think' ? 0.08 : 0.34;
    mouthWidth = mood === 'think' ? 0.68 : 1.02;
  }

  return {
    tL: clampArmTarget([lx, ly, lz], 'L', id),
    tR: clampArmTarget([rx, ry, rz], 'R', id),
    cL: THREE.MathUtils.clamp(cL, 0.08, 0.85),
    cR: THREE.MathUtils.clamp(cR, 0.08, 0.85),
    hipsRoll,
    spinePitch,
    spineYaw,
    spineRoll,
    headRoll,
    mouthOpen: THREE.MathUtils.clamp(mouthOpen, 0, 0.95),
    mouthSmile,
    mouthWidth,
  };
}

export interface MouthTarget { open: number; smile: number; width: number }

export function computeMouthTarget(
  id: string | undefined,
  mood: string,
  t: number,
  idle: IdlePose,
  cmd: ActorCmd | null,
  em: (ActiveEmote & { u: number }) | null,
): MouthTarget {
  if (em) {
    if (em.kind === 'cheer' || (em.kind === 'win' && em.u < 0.5)) {
      return { open: 0.78 + 0.14 * Math.abs(Math.sin(t * 12)), smile: 0.44, width: 1.12 };
    }
    if (em.kind === 'boo' || (em.kind === 'win' && em.u >= 0.5)) {
      return { open: 0.62 + 0.10 * Math.sin(t * 14), smile: -0.14, width: 0.60 };
    }
    if (em.kind === 'slam' || em.kind === 'sputter') {
      return { open: 0.72 + 0.12 * Math.abs(Math.sin(t * 15)), smile: -0.36, width: 0.94 };
    }
    if (em.kind === 'wave') {
      return { open: 0.54, smile: 0.38, width: 1.04 };
    }
  }
  if (cmd) {
    if (cmd.mouthOpen !== undefined && cmd.mouthOpen > 0.02) {
      return { open: cmd.mouthOpen, smile: cmd.mouthSmile ?? 0.35, width: cmd.mouthWidth ?? 1.0 };
    }
    if (cmd.focus > 0.08) {
      return { open: Math.min(0.58, cmd.focus * 0.62), smile: -0.05, width: 0.52 };
    }
    if (cmd.blinkUntil && performance.now() < cmd.blinkUntil) {
      return { open: 0.76, smile: -0.32, width: 0.82 };
    }
  }
  if (mood === 'happy') return { open: 0.76 + 0.12 * Math.abs(Math.sin(t * 10)), smile: 0.42, width: 1.10 };
  if (mood === 'surprised') return { open: 0.74, smile: -0.22, width: 0.68 };
  if (mood === 'sad') return { open: 0.48, smile: -0.34, width: 0.88 };
  if (mood === 'away') return { open: 0.18 + 0.12 * Math.sin(t * 1.6), smile: -0.05, width: 0.55 };
  return { open: idle.mouthOpen, smile: idle.mouthSmile, width: idle.mouthWidth };
}

if (typeof window !== 'undefined') {
  (window as unknown as { __mlEmote?: unknown }).__mlEmote = {
    trigger: triggerEmote,
    clear: clearEmotes,
    active: activeEmoteFor,
    pose: computeEmotePose,
    idlePose: computeIdlePose,
    mouth: computeMouthTarget,
    walkGait: computeWalkGait,
    seatedLegs: computeSeatedLegPose,
  };
}
