// Two Orange guys playing badminton nonstop behind the terrace (sketch book v8 p10), a 4 s loop:
//  1 serve: the near guy (A) hits, the far one (B) waits low · 2 rally: the shuttle arcs over the net, B runs in
//  3 jump: B stretches up and smashes (squash & stretch) · 4 return: A steps in and takes it, B lands squashed.
// The figure is the Orange guy GLB from the character manifest (id "tango", the Low file: it is far away), cloned
// and posed here (only our own clone's arm bone is turned; the shared rig and Figures.tsx are untouched).
// Rackets and the shuttle are procedural. All motion is a pure function of time, so it never drifts.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { loadManifest, entryFor, loadModel, normalise } from '../registry';
import { findArms, solveArm, curlArm, resetArm, handPos, type ArmChain, type Side } from '../actors';
import { FLOOR_Y } from '../sceneConfig';
import { COURT } from './garden';
import { shadowMat } from './props';

const LOOP = 4.0;
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x: number) => { x = clamp(x); return x * x * (3 - 2 * x); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Racket: orange frame, see-through strings, blue grip. Origin at the grip end, head along +y. */
function makeRacket() {
  const g = new THREE.Group();
  const frame = new THREE.MeshLambertMaterial({ color: '#e8892f' }), grip = new THREE.MeshLambertMaterial({ color: '#3b6fb0' });
  const strings = new THREE.MeshBasicMaterial({ color: '#f6ebd9', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
  const head = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.008, 5, 22), frame); head.scale.set(1, 1.3, 1); head.position.y = 0.36;
  const str = new THREE.Mesh(new THREE.CircleGeometry(0.085, 16), strings); str.scale.set(1, 1.3, 1); str.position.y = 0.36;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 5), frame); shaft.position.y = 0.17;
  const gr = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.09, 6), grip); gr.position.y = 0.045;
  const tip = new THREE.Object3D(); tip.position.y = 0.36; tip.name = 'tip';
  g.add(head, str, shaft, gr, tip);
  return g;
}
function makeShuttle() {
  const g = new THREE.Group();
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.08, 10, 1, true), new THREE.MeshLambertMaterial({ color: '#fffdf6', side: THREE.DoubleSide, emissive: '#555550' }));
  skirt.position.y = 0.04; skirt.rotation.x = Math.PI; // wide end up (away from the cork)
  const cork = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshLambertMaterial({ color: '#e8892f' }));
  g.add(skirt, cork); g.scale.setScalar(1.3);
  return g;
}

interface Player { root: THREE.Group; body: THREE.Group; pivot: THREE.Group; racket: THREE.Group; arms?: Partial<Record<Side, ArmChain>>; side: number }

/** one figure: GLB clone (or a plain orange egg while it loads / if it fails) + racket pivot at the right shoulder */
function usePlayer(level: 'high' | 'low'): Player {
  const p = useMemo<Player>(() => {
    const root = new THREE.Group(), body = new THREE.Group(), pivot = new THREE.Group(), racket = makeRacket();
    const egg = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), new THREE.MeshLambertMaterial({ color: '#f39a2e' })); egg.scale.set(1, 1.4, 0.95); egg.position.y = 0.45; egg.name = 'egg';
    body.add(egg); root.add(body); body.add(pivot); pivot.position.set(-0.26, 0.55, 0.02); pivot.add(racket);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5).rotateX(-Math.PI / 2), shadowMat()); sh.position.y = 0.005; sh.renderOrder = 1; root.add(sh);
    return { root, body, pivot, racket, side: -1 };
  }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      const m = await loadManifest(); const e = entryFor(m, 'tango');
      const gltf = await loadModel(e, level); if (!alive || !gltf) return;
      const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
      const obj = clone(gltf.scene);
      obj.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) { mm.frustumCulled = false; const mt = mm.material as THREE.MeshStandardMaterial; if (mt?.isMeshStandardMaterial) mt.metalness = 0; } });
      normalise(obj, { ...e, height: 1.0, baseY: 0 });
      const egg = p.body.getObjectByName('egg'); if (egg) p.body.remove(egg);
      p.body.add(obj);
      // 4-bone arm chains: attach the racket to armR_hand and solve two-bone IK every frame
      obj.updateMatrixWorld(true); p.body.updateMatrixWorld(true);
      p.arms = findArms(obj);
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

const tq = new THREE.Quaternion();
/** racket angle (radians, 0 = hanging down, PI = straight up) for a swing that hits at time h */
function swing(u: number, h: number, rest = 0.7) {
  const d = u - h;
  if (d < -0.45 || d > 0.5) return rest;
  if (d < -0.15) return lerp(rest, 2.9, ease((d + 0.45) / 0.3)); // wind up overhead
  if (d < 0.08) return lerp(2.9, 1.0, ease((d + 0.15) / 0.23)); // the hit
  return lerp(1.0, rest, ease((d - 0.08) / 0.42)); // follow through, settle
}
const vBodyC = new THREE.Vector3(), vTarget = new THREE.Vector3(), vHand = new THREE.Vector3();
function poseArm(p: Player, ang: number) {
  // racket swings in the body's side plane, outward from the shoulder: ang 0 = hanging down, PI/2 = out, PI = up
  const arms = p.arms;
  if (arms?.R) {
    p.root.updateMatrixWorld(true);
    p.body.localToWorld(vBodyC.set(0, 0.42, -0.05));
    // Map ang (0.7 low ready -> 2.9 overhead smash wind-up -> 1.0 hit -> 0.7 follow-through) to 3D hand target
    const elev = ang - 1.15; // -0.45 low ready .. +1.75 overhead smash
    const tx = p.side * (0.20 + 0.08 * Math.sin(elev * 0.8));
    const ty = 0.48 + Math.sin(Math.min(1.55, elev)) * 0.34;
    const tz = 0.16 + Math.cos(elev - 0.35) * 0.20;
    const armR = arms.R;
    armR.up.quaternion.copy(armR.restUp);
    resetArm(armR);
    p.body.localToWorld(vTarget.set(tx, ty, tz));
    for (let k = 0; k < 2; k++) solveArm(armR, vTarget, 1, vBodyC);
    curlArm(armR, 0.9);
    // Parent the racket grip directly to armR_hand with wrist bend following the swing
    p.body.worldToLocal(handPos(armR, vHand));
    p.pivot.position.copy(vHand);
    p.pivot.rotation.set(0.28 * Math.cos(elev), 0, -p.side * (Math.PI - ang) * 0.85);
    if (arms.L) {
      const armL = arms.L;
      armL.up.quaternion.copy(armL.restUp);
      resetArm(armL);
      p.body.localToWorld(vTarget.set(-p.side * 0.22, 0.38 + Math.max(0, elev) * 0.08, 0.14));
      for (let k = 0; k < 2; k++) solveArm(armL, vTarget, 0.82, vBodyC);
      curlArm(armL, 0.45);
    }
    return;
  }
  p.pivot.rotation.set(0, 0, -p.side * (Math.PI - ang));
  void tq;
}

export function Badminton({ at, yaw, level }: { at: [number, number, number]; yaw: number; level: 'high' | 'low' }) {
  const A = usePlayer(level), B = usePlayer(level);
  const shuttle = useMemo(makeShuttle, []);
  const court = useRef<THREE.Group>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), prev: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), q: new THREE.Quaternion() }), []);
  useFrame((st) => {
    const g = court.current; if (!g) return;
    const u = st.clock.elapsedTime % LOOP;
    // the court's long axis is local x: A plays from the left (-x), B from the right (+x); both turn a little
    // towards the table so they read in 3/4 view (cartoon cheat, as in the sketches)
    const Ax = -1.5, Bx = 1.5, Az = 0.12, Bz = -0.1, TURN = 0.55;
    // --- A (left, faces +x) ---
    const aStep = u > 2.8 && u < 3.6 ? ease((u - 2.8) / 0.5) : u >= 3.6 ? 1 - ease((u - 3.6) / 0.4) : 0;
    A.root.position.set(Ax + aStep * 0.4, 0, Az + aStep * 0.1); A.root.rotation.y = Math.PI / 2 - TURN;
    const aHop = Math.abs(Math.sin(u * Math.PI * 1.5)) * 0.03 + (Math.abs(u - 0.5) < 0.2 ? 0.05 * (1 - Math.abs(u - 0.5) / 0.2) : 0);
    A.body.position.y = aHop; A.body.scale.set(1, 1, 1);
    const aAng = u < 2 ? swing(u, 0.5) : swing(u, 3.5);
    poseArm(A, aAng);
    // --- B (right, faces -x): wait low, run in, jump, smash, land squashed, walk back ---
    let bx = Bx, bz = Bz, by = 0, sy = 1;
    const BIN = 0.95;
    if (u < 1) { sy = 0.9 + Math.sin(u * 8) * 0.02; }
    else if (u < 2.2) { const k = ease((u - 1) / 1.2); bx = lerp(Bx, BIN, k); bz = lerp(Bz, 0.15, k); by = Math.abs(Math.sin((u - 1) * 9)) * 0.04; }
    else if (u < 3.2) { bx = BIN; bz = 0.15; const k = (u - 2.2) / 1.0; by = Math.max(0, Math.sin(k * Math.PI) * 0.42); sy = k < 0.5 ? 1.12 : k < 0.92 ? 1.05 : 0.78; }
    else { const k = ease((u - 3.2) / 0.8); bx = lerp(BIN, Bx, k); bz = lerp(0.15, Bz, k); sy = lerp(0.8, 0.9, k); }
    B.root.position.set(bx, 0, bz); B.root.rotation.y = -Math.PI / 2 + TURN;
    B.body.position.y = by; B.body.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    poseArm(B, u < 2 ? 0.7 + Math.sin(u * 3) * 0.1 : swing(u, 2.6));
    // --- shuttle ---
    g.updateMatrixWorld(true);
    const head = (p: Player) => { const t = p.racket.getObjectByName('tip')!; return g.worldToLocal(t.getWorldPosition(new THREE.Vector3())); };
    const hitA = new THREE.Vector3(Ax + 0.25, 1.25, Az), hitB = new THREE.Vector3(BIN - 0.2, 1.85, 0.15), recvA = new THREE.Vector3(Ax + 0.65, 1.1, Az + 0.1);
    tmp.prev.copy(shuttle.position);
    if (u < 0.5) shuttle.position.copy(head(A)).add(new THREE.Vector3(0.04, 0.03, 0));
    else if (u < 2.6) { const k = (u - 0.5) / 2.1; shuttle.position.lerpVectors(hitA, hitB, k); shuttle.position.y += Math.sin(k * Math.PI) * 1.2; }
    else if (u < 3.5) { const k = (u - 2.6) / 0.9; shuttle.position.lerpVectors(hitB, recvA, k); shuttle.position.y += Math.sin(k * Math.PI) * 0.25; }
    else { const k = ease((u - 3.5) / 0.5); shuttle.position.lerpVectors(recvA, head(A).add(new THREE.Vector3(0.04, 0.03, 0)), k); }
    // cork first along the flight
    tmp.v.subVectors(shuttle.position, tmp.prev);
    if (tmp.v.lengthSq() > 1e-7) { tmp.q.setFromUnitVectors(tmp.up, tmp.v.normalize().negate()); shuttle.quaternion.slerp(tmp.q, 0.5); }
  });
  return (
    <group ref={court} position={at} rotation={[0, yaw, 0]}>
      {ready && <><primitive object={A.root} /><primitive object={B.root} /><primitive object={shuttle} /></>}
    </group>
  );
}
export { FLOOR_Y, COURT };
