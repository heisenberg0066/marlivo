// Character "actors" for card actions: every rigged 3D figure registers here per seat, and card choreography
// (backend3d) drives it: two-bone arm IK reach, paw/finger curl, body lean, head look-at and a small expression.
// Cards are carried by the hand (the sprite follows the hand anchor), so they never fly free or into bodies.
// Works on the re-rigged GLBs (armX -> armX_fore -> armX_hand -> armX_curl, see tools/character-pipeline/split_arms.mjs).
import * as THREE from 'three';

export type Side = 'L' | 'R';
export interface ArmChain { up: THREE.Bone; fore: THREE.Bone; hand: THREE.Bone; curl: THREE.Bone | null; restUp: THREE.Quaternion; restFore: THREE.Quaternion; restHand: THREE.Quaternion; restCurl: THREE.Quaternion | null; smoothUp: THREE.Quaternion; smoothFore: THREE.Quaternion; smoothHand: THREE.Quaternion; smoothCurl: THREE.Quaternion | null; inited?: boolean }
export interface ArmCmd { target: THREE.Vector3; w: number; curl: number; hold?: boolean }
export interface ActorCmd { arm: Partial<Record<Side, ArmCmd>>; look: THREE.Vector3 | null; lookW: number; lean: number; focus: number; blinkUntil?: number; mouthOpen?: number; mouthSmile?: number; mouthWidth?: number }
export interface Actor { seat: number; id?: string; motion?: string; root: THREE.Object3D; arms: Partial<Record<Side, ArmChain>>; head: THREE.Bone | null; cmd: ActorCmd; lowDetail: boolean }

/** Table cards a staged action is carrying right now (the sprite in the hand stands in for them). */
export const stagedHidden = new Set<string>();

const reg = new Map<number, Actor>();
export const actorFor = (seat: number) => reg.get(seat) ?? null;
export function registerActor(a: Actor) { reg.set(a.seat, a); return () => { if (reg.get(a.seat) === a) reg.delete(a.seat); }; }
export const newCmd = (): ActorCmd => ({ arm: {}, look: null, lookW: 0, lean: 0, focus: 0 });

export function findArms(root: THREE.Object3D): Partial<Record<Side, ArmChain>> {
  const out: Partial<Record<Side, ArmChain>> = {};
  for (const s of ['L', 'R'] as Side[]) {
    const g = (n: string) => root.getObjectByName(n) as THREE.Bone | undefined;
    const up = g('arm' + s), fore = g(`arm${s}_fore`), hand = g(`arm${s}_hand`), curl = g(`arm${s}_curl`) ?? null;
    if (up && fore && hand) out[s] = { up, fore, hand, curl, restUp: up.quaternion.clone(), restFore: fore.quaternion.clone(), restHand: hand.quaternion.clone(), restCurl: curl?.quaternion.clone() ?? null, smoothUp: up.quaternion.clone(), smoothFore: fore.quaternion.clone(), smoothHand: hand.quaternion.clone(), smoothCurl: curl?.quaternion.clone() ?? null, inited: false };
  }
  return out;
}

const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), vD = new THREE.Vector3(), vE = new THREE.Vector3(), vP = new THREE.Vector3();
const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), qC = new THREE.Quaternion(), qI = new THREE.Quaternion(), qW = new THREE.Quaternion();
/** Rotates a bone (in world space) so its from-direction turns to the to-direction, blended by w. */
function aim(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, w: number) {
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
  qW.setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
  qA.slerpQuaternions(qI, qW, w); // (slerpQuaternions copies its first argument into this: keep them distinct)
  bone.getWorldQuaternion(qB);
  qB.premultiply(qA);
  bone.parent!.getWorldQuaternion(qC).invert();
  bone.quaternion.copy(qC.multiply(qB));
  bone.updateMatrixWorld(true);
}
/** Where the hand of a chain is now (world). */
export const handPos = (c: ArmChain, out = new THREE.Vector3()) => (c.curl ?? c.hand).getWorldPosition(out);
export const shoulderPos = (c: ArmChain, out = new THREE.Vector3()) => c.up.getWorldPosition(out);
export function armLength(c: ArmChain) {
  c.up.getWorldPosition(vA); c.fore.getWorldPosition(vB); (c.curl ?? c.hand).getWorldPosition(vC);
  return vA.distanceTo(vB) + vB.distanceTo(vC);
}

/** Analytic two-bone IK: shoulder -> elbow -> hand reaches t (clamped to the arm length: limbs never stretch).
 *  The elbow bends towards the pole (out, down and back from the body). */
export function solveArm(c: ArmChain, t: THREE.Vector3, w: number, bodyCentre: THREE.Vector3) {
  if (w <= 0.001) return;
  c.up.updateMatrixWorld(true);
  const S = c.up.getWorldPosition(vA), E = c.fore.getWorldPosition(vB), H = (c.curl ?? c.hand).getWorldPosition(vC);
  // Creature rig (Orange guy: parent is 'body'): his upper arm emerges from underneath his wide egg cheeks/ribcage,
  // so rotating arm.up more than ~15% pushes the upper arm into the egg wall. Keep arm.up near its clean bind angle
  // (elbow E at |x| ~ 0.395, 10 cm outside the lower torso) and drive the forearm (arm.fore) from E toward t!
  if (c.up.parent?.name === 'body') {
    const outSign = Math.sign(E.x - bodyCentre.x) || 1;
    const bindDir = vD.copy(E).sub(S);
    const wantUp = vE.copy(t).sub(S);
    if (outSign * wantUp.x < Math.abs(bindDir.x) * 1.1) wantUp.x = outSign * Math.abs(bindDir.x) * 1.1;
    aim(c.up, bindDir, wantUp, w * 0.28);
    const E3 = c.fore.getWorldPosition(new THREE.Vector3()), H3 = (c.curl ?? c.hand).getWorldPosition(new THREE.Vector3());
    const fDir = vP.copy(t).sub(E3);
    const minOutX = Math.max(0.085, Math.hypot(fDir.y, fDir.z) * 1.20);
    if (outSign * fDir.x < minOutX) fDir.x = outSign * minOutX;
    aim(c.fore, H3.sub(E3), fDir, w);
    return;
  }
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

/** Paw / fingers close (0 = open, 1 = closed): the hand and curl bones bend about the arm's local x. */
const X = new THREE.Vector3(1, 0, 0);
export function curlArm(c: ArmChain, k: number) {
  if (k <= 0.001) return;
  const eff = c.up.parent?.name === 'body' ? Math.min(k, 0.18) : k;
  c.hand.quaternion.multiply(qA.setFromAxisAngle(X, -0.35 * eff));
  if (c.curl) c.curl.quaternion.multiply(qA.setFromAxisAngle(X, -1.0 * eff));
}

/** Critically-damped / exponential quaternion slerp with overlapping hierarchy lag:
 *  shoulder leads (lambda=16), elbow follows (lambda=12.5), wrist/hand trails (lambda=9.5), curl (lambda=14).
 *  Prevents any bone from ever snapping or popping between idle, reach, hold, and release. */
export function stepArmSmoothing(c: ArmChain, dt: number) {
  const d = dt > 0 && dt < 0.25 ? dt : 1 / 60;
  if (!c.inited) {
    c.smoothUp.copy(c.up.quaternion);
    c.smoothFore.copy(c.fore.quaternion);
    c.smoothHand.copy(c.hand.quaternion);
    if (c.curl && c.smoothCurl) c.smoothCurl.copy(c.curl.quaternion);
    c.inited = true;
    return;
  }
  const kUp = 1 - Math.exp(-d * 16.0);
  const kFore = 1 - Math.exp(-d * 12.5);
  const kHand = 1 - Math.exp(-d * 9.5);
  const kCurl = 1 - Math.exp(-d * 14.0);
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

export function resetArm(c: ArmChain) { c.fore.quaternion.copy(c.restFore); c.hand.quaternion.copy(c.restHand); if (c.curl && c.restCurl) c.curl.quaternion.copy(c.restCurl); }

/** Pixar-ish easing helpers for the choreography. */
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t: number, s = 1.4) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
export const seg = (t: number, a: number, b: number) => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);

// ---- Playful Emotes & Big Win/Lose Reactions (Wave, Cheer, Boo, Table Slam, Win, Sputter) ------------------
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


/** Ensures a seat-local hand target [x, y, z] stays outside the character's torso/head surface so hands and forearms never clip. */
export function clampArmTarget(tLoc: [number, number, number], sd: Side, id?: string): [number, number, number] {
  const sgn = sd === 'L' ? -1 : 1;
  let [x, y, z] = tLoc;
  if (id === 'tango') {
    // Keep hand target well outside the elbow E (|x_E| = 0.40) at |x| >= 0.49..0.52 so |H.x| >= 0.485 in every pose:
    const minLat = y > 0.10 ? 0.51 : 0.49;
    if (sgn * x < minLat) x = sgn * minLat;
    if (z < 0.05) z = 0.05;
  } else {
    const minLat = z < 0.18 ? 0.155 : 0.095;
    if (sgn * x < minLat) x = sgn * minLat;
  }
  return [x, y, z];
}

export interface EmotePose {
  /** Target hand positions in seat-group local space (origin on tabletop y=0 at seat root, +z towards table centre). */
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
  /** Vertical bounce (metres, >= 0) imparted to the seat's teacup/saucer on table-rim slams. */
  cupBounce: number;
}

/** Pure, deterministic pose evaluator for emotes and win/lose reactions (u in 0..1).
 *  Guarantees hand height y >= 0.022 on table slams so fists/paws never clip through the tabletop (y = 0). */
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
    // Cheeky cupping-hand by mouth + playful thumbs-down wag toward opponents
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
  // 'slam': sad slump forward + droopy half-closed eyelids (0.55) + 3 cartoon fist/paw slams onto the table rim (y >= 0.025)
  const cyc = (u * 3) % 1;
  // cyc 0..0.42: raise fists up (y = 0.19); cyc 0.42..0.62: slam down to rim (y = 0.028); cyc 0.62..1.0: rebound
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

/** Returns the current cup/table vertical bounce for a seat (from its own slam or a neighbour's slam). */
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


// ---- Living, Relaxed Idle Posture & Dynamic Mouth State (Especially for Orange guy!) ------------------------
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

/** Pure, continuous relaxed idle generator so characters NEVER freeze in their 2D reference bind pose.
 *  Hands rest naturally down near the lap/table rim and cycle smoothly through table-rest, finger-tap, and casual gestures. */
export function computeIdlePose(id: string | undefined, seat: number, t: number, mood: string, lookYaw = 0): IdlePose {
  const s0 = seat * 2.17 + (id === 'tango' ? 0.4 : id === 'ammar' ? 1.3 : 2.4);
  const u1 = t * 1.15 + s0;
  const u2 = t * 1.65 + s0 * 1.7;
  const u3 = t * 2.35 + s0 * 0.6;

  // Smoothly cycle between:
  // (A) Arms hanging loosely down at sides/lap (y = -0.10, z = 0.08: ~92% arm extension, no sharp elbow V-tuck!)
  // (B) Right hand resting up on the table rim (y = +0.05, z = 0.23) while left arm hangs relaxed down
  // (C) Left hand casual open gesture / chin ponder (y = +0.18..0.25, z = 0.23) while right arm rests low
  const wave = Math.sin(t * 1.25 + seat * 1.9);
  const wRimR = Math.pow(Math.max(0, wave), 1.6);
  const wGestL = mood === 'think' ? 0.85 : Math.pow(Math.max(0, -wave), 1.6);

  const isOrange = id === 'tango';
  const downX = isOrange ? 0.49 : id === 'ammar' ? 0.175 : 0.22;
  const downY = isOrange ? -0.08 : id === 'ammar' ? -0.07 : -0.05;
  const downZ = isOrange ? 0.11 : 0.08;

  const br = Math.sin(t * 2.1);
  const dxL = Math.sin(u2) * 0.024;
  const dyL = Math.cos(u3) * 0.022 + br * 0.010;
  const dzL = Math.sin(u2 * 0.8) * 0.024;

  const dxR = Math.cos(u2 + 1.2) * 0.024;
  const dyR = Math.sin(u3 + 0.9) * 0.022 + br * 0.010;
  const dzR = Math.cos(u2 * 0.85 + 0.5) * 0.024;

  // Left hand: hangs loosely down outside the hip (-downX, downY, downZ), rising outward-forward for casual gesture
  const lx = -downX + dxL + wGestL * (isOrange ? 0.02 : 0.04);
  const ly = downY + dyL + wGestL * (mood === 'think' ? 0.26 : 0.22);
  const lz = downZ + dzL + wGestL * 0.15;
  const cL = 0.26 - wGestL * 0.14 + Math.sin(u3) * 0.07;

  // Right hand: hangs loosely down outside the hip (+downX, downY, downZ), rising onto the table rim during wRimR
  const tap = wRimR > 0.40 ? Math.max(0, Math.sin(t * 6.0)) * 0.020 : 0;
  const rx = downX + dxR - wRimR * (isOrange ? 0.03 : 0.04);
  const ry = downY + dyR + wRimR * 0.13 + tap;
  const rz = downZ + dzR + wRimR * 0.14;
  const cR = 0.28 + (wRimR * 0.16 - tap * 6) + Math.cos(u3) * 0.07;

  // Free-moving body: noticeable weight shifts side-to-side, torso sway, and expressive head tilt
  const sway = Math.sin(u1 * 1.1) * 0.085 + Math.sin(u2 * 0.9) * 0.035;
  const hipsRoll = sway * 0.55;
  const spineRoll = sway * (isOrange ? 1.15 : 0.80);
  const spinePitch = -0.022 * br + Math.sin(u1 * 0.8) * 0.042 + (mood === 'sad' ? 0.14 : 0);
  const spineYaw = lookYaw * 0.36 + Math.sin(u1 * 0.7) * 0.105;
  const headRoll = -lookYaw * 0.24 + Math.sin(u2 * 0.8) * 0.080 + (mood === 'think' ? 0.14 : 0);

  // Expressive mouth in idle: Orange guy opens his mouth in a warm relaxed grin or chatty reaction like the sketches
  const chatWave = 0.5 + 0.5 * Math.sin(t * 1.55 + s0 * 1.3);
  const chatPulse = Math.max(0, Math.sin(t * 5.2 + s0)) * 0.22;
  let mouthOpen = 0, mouthSmile = 0.34, mouthWidth = 1.0;
  if (isOrange) {
    mouthOpen = chatWave > 0.28 ? 0.42 + (chatWave - 0.28) * 0.68 + chatPulse : 0.12 * chatWave;
    mouthSmile = mood === 'think' ? 0.04 : 0.38;
    mouthWidth = mood === 'think' ? 0.62 : 1.06;
  } else if (id !== 'ammar' && id !== 'pepper') {
    mouthOpen = chatWave > 0.55 ? (chatWave - 0.55) * 0.70 + chatPulse * 0.5 : 0;
    mouthSmile = 0.32;
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

/** Evaluates the desired cartoon mouth state (open in 0..1, smile in -0.5..+0.5, width in 0.4..1.25) across all states. */
export function computeMouthTarget(
  id: string | undefined,
  mood: string,
  t: number,
  idle: IdlePose,
  cmd: ActorCmd | null,
  em: (ActiveEmote & { u: number }) | null,
): MouthTarget {
  if (em) {
    if (em.kind === 'cheer' || em.kind === 'win' && em.u < 0.5) {
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
      // Peeking a card: curious 'O' mouth!
      return { open: Math.min(0.58, cmd.focus * 0.62), smile: -0.05, width: 0.52 };
    }
    if (cmd.blinkUntil && performance.now() < cmd.blinkUntil) {
      // Surprised penalty reaction!
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
  };
}
