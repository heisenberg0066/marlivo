// Character "actors" for card actions: every rigged 3D figure registers here per seat, and card choreography
// (backend3d) drives it: two-bone arm IK reach, paw/finger curl, body lean, head look-at and a small expression.
// Cards are carried by the hand (the sprite follows the hand anchor), so they never fly free or into bodies.
// Works on the re-rigged GLBs (armX -> armX_fore -> armX_hand -> armX_curl, see tools/character-pipeline/split_arms.mjs).
import * as THREE from 'three';

export type Side = 'L' | 'R';
export interface ArmChain { up: THREE.Bone; fore: THREE.Bone; hand: THREE.Bone; curl: THREE.Bone | null; restUp: THREE.Quaternion; restFore: THREE.Quaternion; restHand: THREE.Quaternion; restCurl: THREE.Quaternion | null }
export interface ArmCmd { target: THREE.Vector3; w: number; curl: number }
export interface ActorCmd { arm: Partial<Record<Side, ArmCmd>>; look: THREE.Vector3 | null; lookW: number; lean: number; focus: number; blinkUntil?: number }
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
    if (up && fore && hand) out[s] = { up, fore, hand, curl, restUp: up.quaternion.clone(), restFore: fore.quaternion.clone(), restHand: hand.quaternion.clone(), restCurl: curl?.quaternion.clone() ?? null };
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
  const a = S.distanceTo(E), b = E.distanceTo(H);
  const toT = vD.copy(t).sub(S); let d = toT.length(); if (d < 1e-5) return;
  const dir = toT.divideScalar(d);
  d = Math.min(Math.max(d, Math.abs(a - b) + 1e-3), (a + b) * 0.985);
  // pole: out from the body centre, down and a little back
  vP.copy(S).sub(bodyCentre); vP.y = 0; if (vP.lengthSq() < 1e-8) vP.set(1, 0, 0); vP.normalize();
  vP.y -= 0.9; vP.addScaledVector(vE.copy(bodyCentre).sub(t).setY(0).normalize(), 0.35);
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
  c.hand.quaternion.multiply(qA.setFromAxisAngle(X, -0.35 * k));
  if (c.curl) c.curl.quaternion.multiply(qA.setFromAxisAngle(X, -1.0 * k));
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
      tL: [-0.20, 0.24, 0.12],
      tR: [0.22 + wv, 0.52, 0.20],
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
      tL: clapPhase ? [-0.04 - clap, 0.42, 0.24] : [-0.19, 0.52 + pump * 0.11, 0.16],
      tR: clapPhase ? [0.04 + clap, 0.42, 0.24]  : [0.19, 0.52 + pump * 0.11, 0.16],
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
      tL: [-0.075, 0.45, 0.21],
      tR: [0.13, 0.34 - wag * 0.065, 0.28],
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
      tL: [-0.17, 0.44 + fl * 0.03, 0.22],
      tR: [0.17, 0.44 - fl * 0.03, 0.22],
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
    tL: [-0.13, rimY, 0.25],
    tR: [0.13, rimY, 0.25],
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

if (typeof window !== 'undefined') {
  (window as unknown as { __mlEmote?: unknown }).__mlEmote = {
    trigger: triggerEmote,
    clear: clearEmotes,
    active: activeEmoteFor,
    pose: computeEmotePose,
  };
}
