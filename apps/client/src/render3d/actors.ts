// Character "actors" for card actions: every rigged 3D figure registers here per seat, and card choreography
// (backend3d) drives it: two-bone arm IK reach, paw/finger curl, body lean, head look-at and a small expression.
// Cards are carried by the hand (the sprite follows the hand anchor), so they never fly free or into bodies.
// Works on the re-rigged GLBs (armX -> armX_fore -> armX_hand -> armX_curl, see tools/character-pipeline/split_arms.mjs).
import * as THREE from 'three';

export type Side = 'L' | 'R';
export interface ArmChain { up: THREE.Bone; fore: THREE.Bone; hand: THREE.Bone; curl: THREE.Bone | null; restUp: THREE.Quaternion; restFore: THREE.Quaternion; restHand: THREE.Quaternion; restCurl: THREE.Quaternion | null }
export interface ArmCmd { target: THREE.Vector3; w: number; curl: number }
export interface ActorCmd { arm: Partial<Record<Side, ArmCmd>>; look: THREE.Vector3 | null; lookW: number; lean: number; focus: number }
export interface Actor { seat: number; root: THREE.Object3D; arms: Partial<Record<Side, ArmChain>>; head: THREE.Bone | null; cmd: ActorCmd; lowDetail: boolean }

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
