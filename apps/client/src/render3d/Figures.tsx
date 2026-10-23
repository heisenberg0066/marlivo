// 3D characters: low-poly placeholder figures made from primitives (Biscuit the bear, Mint the cat, Pepper the
// owl, Tango the orange guy and a generic guest), with idle / think / celebrate / sad / surprised / away motions.
// A GLB listed in the character manifest replaces the placeholder with no code changes (see registry.ts).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Mood } from '../render/characters';
import { useRigMotion, type Rig } from './rig';
import { OrangeGuy, AmmarFigure } from './Hero';
import { usePrefs, graphicsLevel } from '../prefs';
import { loadManifest, entryFor, loadModel, normalise, clipFor, type CharacterEntry, type Placeholder } from './registry';
import { registerActor, findArms, newCmd, solveArm, curlArm, resetArm, type Actor } from './actors';
import { getCtx3 } from './backend3d';

const G = {
  sphere: new THREE.SphereGeometry(1, 18, 14),
  lowSphere: new THREE.SphereGeometry(1, 10, 8),
  cone: new THREE.ConeGeometry(1, 1, 12),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  torus: new THREE.TorusGeometry(1, 0.28, 8, 24),
  ring: new THREE.TorusGeometry(1, 0.12, 6, 20),
};
const mats = new Map<string, THREE.Material>();
const mat = (c: string) => { let m = mats.get(c); if (!m) { m = new THREE.MeshLambertMaterial({ color: c }); mats.set(c, m); } return m; };

function M({ g = 'sphere', c, p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0] }: { g?: keyof typeof G; c: string; p?: [number, number, number]; s?: number | [number, number, number]; r?: [number, number, number] }) {
  const sc = typeof s === 'number' ? [s, s, s] as [number, number, number] : s;
  return <mesh geometry={G[g]} material={mat(c)} position={p} scale={sc} rotation={r} />;
}

function Arm({ side, c, len = 0.22, w = 0.045, set }: { side: 1 | -1; c: string; len?: number; w?: number; set: (g: THREE.Group | null) => void }) {
  return (
    <group ref={set} position={[0.17 * side, 0.14, 0.03]}>
      <M g="cyl" c={c} p={[0, -len / 2, 0]} s={[w, len, w]} />
      <M c={c} p={[0, -len, 0]} s={w * 1.35} />
    </group>
  );
}
function Eyes({ x = 0.06, y = 0, z = 0.15, r = 0.022, white = false, pupil = '#1d1410', set }: { x?: number; y?: number; z?: number; r?: number; white?: boolean; pupil?: string; set: (g: THREE.Group | null) => void }) {
  return (
    <group ref={set} position={[0, y, z]}>
      {[-1, 1].map((sd) => (
        <group key={sd} position={[x * sd, 0, 0]}>
          {white && <M c="#fffaf0" s={r * 1.9} />}
          <M c={pupil} p={[0, 0, white ? r * 1.2 : 0]} s={r} />
          <M c="#ffffff" p={[r * 0.35, r * 0.35, white ? r * 2 : r * 0.8]} s={r * 0.3} />
        </group>
      ))}
    </group>
  );
}

function PlaceholderFigure({ kind, mood, seed }: { kind: Placeholder; mood: Mood; seed: number }) {
  const rig = useRef<Rig>({ root: null, head: null, armL: null, armR: null, eyes: null });
  useRigMotion(rig, mood, seed);
  const set = (k: keyof Rig) => (g: THREE.Group | null) => { rig.current[k] = g; };
  let body: ReactNode, head: ReactNode, arms: ReactNode;
  if (kind === 'bear') {
    body = <><M c="#8a5a36" p={[0, 0.02, 0]} s={[0.25, 0.28, 0.21]} /><M c="#c99766" p={[0, 0.0, 0.12]} s={[0.15, 0.17, 0.1]} /><M g="torus" c="#3b6fb0" p={[0, 0.22, 0]} s={[0.15, 0.15, 0.17]} r={[Math.PI / 2, 0, 0]} /><M g="cyl" c="#3b6fb0" p={[0.07, 0.13, 0.15]} s={[0.035, 0.16, 0.02]} r={[0.2, 0, 0.15]} /></>;
    head = <><M c="#9a6a42" s={[0.18, 0.165, 0.165]} /><M c="#8a5a36" p={[-0.13, 0.12, -0.01]} s={0.06} /><M c="#8a5a36" p={[0.13, 0.12, -0.01]} s={0.06} /><M c="#d9a57a" p={[-0.13, 0.12, 0.02]} s={0.03} /><M c="#d9a57a" p={[0.13, 0.12, 0.02]} s={0.03} /><M c="#e8c49a" p={[0, -0.04, 0.13]} s={[0.085, 0.065, 0.06]} /><M c="#2a1710" p={[0, -0.01, 0.185]} s={[0.03, 0.022, 0.02]} /><Eyes y={0.04} z={0.15} set={set('eyes')} /></>;
    arms = <><Arm side={-1} c="#8a5a36" w={0.055} set={set('armL')} /><Arm side={1} c="#8a5a36" w={0.055} set={set('armR')} /></>;
  } else if (kind === 'cat') {
    body = <><M c="#8fae9c" p={[0, 0.02, 0]} s={[0.22, 0.27, 0.19]} /><M c="#e9eef0" p={[0, 0.0, 0.12]} s={[0.12, 0.16, 0.08]} /><M g="torus" c="#3f8a5a" p={[0, 0.21, 0]} s={[0.14, 0.14, 0.16]} r={[Math.PI / 2, 0, 0]} /></>;
    head = <><M c="#a9c6b4" s={[0.17, 0.15, 0.15]} /><M g="cone" c="#a9c6b4" p={[-0.1, 0.15, 0]} s={[0.055, 0.11, 0.04]} r={[0, 0, 0.25]} /><M g="cone" c="#a9c6b4" p={[0.1, 0.15, 0]} s={[0.055, 0.11, 0.04]} r={[0, 0, -0.25]} /><M g="cone" c="#e7b4b4" p={[-0.1, 0.145, 0.02]} s={[0.03, 0.07, 0.02]} r={[0, 0, 0.25]} /><M g="cone" c="#e7b4b4" p={[0.1, 0.145, 0.02]} s={[0.03, 0.07, 0.02]} r={[0, 0, -0.25]} /><M c="#f2f5f3" p={[0, -0.05, 0.12]} s={[0.07, 0.05, 0.05]} /><M c="#d98a8a" p={[0, -0.025, 0.165]} s={[0.018, 0.013, 0.012]} /><Eyes y={0.02} z={0.135} pupil="#24402f" set={set('eyes')} /><M g="ring" c="#5a3e2b" p={[-0.06, 0.02, 0.155]} s={0.042} /><M g="ring" c="#5a3e2b" p={[0.06, 0.02, 0.155]} s={0.042} /><M g="cyl" c="#5a3e2b" p={[0, 0.02, 0.155]} s={[0.006, 0.035, 0.006]} r={[0, 0, Math.PI / 2]} /></>;
    arms = <><Arm side={-1} c="#8fae9c" w={0.04} set={set('armL')} /><Arm side={1} c="#8fae9c" w={0.04} set={set('armR')} /></>;
  } else if (kind === 'owl') {
    body = <><M c="#e07a2f" p={[0, 0.04, 0]} s={[0.23, 0.3, 0.2]} /><M c="#f6c58f" p={[0, 0.0, 0.11]} s={[0.15, 0.2, 0.1]} /></>;
    head = <><M c="#ec8a36" s={[0.19, 0.17, 0.16]} /><M c="#fbe3c4" p={[-0.07, 0, 0.12]} s={[0.07, 0.07, 0.04]} /><M c="#fbe3c4" p={[0.07, 0, 0.12]} s={[0.07, 0.07, 0.04]} /><Eyes x={0.07} y={0.0} z={0.15} r={0.026} set={set('eyes')} /><M g="cone" c="#e2b23c" p={[0, -0.055, 0.16]} s={[0.025, 0.05, 0.025]} r={[Math.PI, 0, 0]} /><M g="cyl" c="#c93c32" p={[0, 0.12, 0]} s={[0.165, 0.09, 0.15]} /><M g="cyl" c="#a52d26" p={[0, 0.08, 0]} s={[0.175, 0.03, 0.16]} /><M c="#f6ebd9" p={[0, 0.2, 0]} s={0.04} /></>;
    arms = <><Arm side={-1} c="#c8641f" w={0.06} len={0.2} set={set('armL')} /><Arm side={1} c="#c8641f" w={0.06} len={0.2} set={set('armR')} /></>;
  } else if (kind === 'orange') {
    body = <><M c="#f39a2e" p={[0, 0.16, 0]} s={[0.25, 0.36, 0.22]} /><group>{[[-0.12, 0.3], [0.1, 0.36], [0.02, 0.05], [-0.08, 0.12], [0.14, 0.18]].map(([x, y], i) => <M key={i} g="lowSphere" c="#e8892f" p={[x!, y!, 0.19]} s={0.012} />)}</group></>;
    head = <><Eyes x={0.07} y={0.0} z={0.17} r={0.03} white pupil="#2b4a7a" set={set('eyes')} /><M c="#c85a1a" p={[0, -0.09, 0.19]} s={[0.05, 0.022, 0.02]} /><M g="cyl" c="#4f7a32" p={[0, 0.25, -0.01]} s={[0.012, 0.07, 0.012]} r={[0.2, 0, 0]} /><M c="#6aa13f" p={[0.045, 0.28, 0]} s={[0.05, 0.015, 0.025]} r={[0, 0, 0.4]} /></>;
    arms = <><Arm side={-1} c="#f39a2e" w={0.025} len={0.24} set={set('armL')} /><Arm side={1} c="#f39a2e" w={0.025} len={0.24} set={set('armR')} /></>;
  } else {
    body = <><M c="#d9c7a8" p={[0, 0.02, 0]} s={[0.21, 0.27, 0.18]} /><M g="torus" c="#e8892f" p={[0, 0.2, 0]} s={[0.13, 0.13, 0.15]} r={[Math.PI / 2, 0, 0]} /></>;
    head = <><M c="#eadcc2" s={[0.15, 0.16, 0.15]} /><Eyes y={0.02} z={0.135} set={set('eyes')} /><M c="#b07a5a" p={[0, -0.06, 0.135]} s={[0.03, 0.012, 0.01]} /></>;
    arms = <><Arm side={-1} c="#d9c7a8" w={0.04} set={set('armL')} /><Arm side={1} c="#d9c7a8" w={0.04} set={set('armR')} /></>;
  }
  // The orange guy is one round body with a face on it; the others have a separate head.
  const headY = kind === 'orange' ? 0.3 : 0.38;
  return (
    <group ref={set('root')}>
      {body}
      <group ref={set('head')} position={[0, headY, 0]}>{head}</group>
      {arms}
    </group>
  );
}

/** Bone motion for rigged GLB figures. Rotations are given about model-space axes (x = nod, y = turn,
 *  z = side tilt; the model faces +z) and converted once into each bone's local frame. */
interface BoneRig { bone: THREE.Bone; rest: THREE.Quaternion; ax: THREE.Vector3[] }
function rigBones(root: THREE.Object3D, names: string[]): Record<string, BoneRig> {
  const out: Record<string, BoneRig> = {};
  root.updateMatrixWorld(true);
  const rootQ = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  for (const n of names) {
    const b = root.getObjectByName(n) as THREE.Bone | undefined;
    if (!b) continue;
    const wq = rootQ.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion())).invert(); // model -> bone local
    out[n] = { bone: b, rest: b.quaternion.clone(), ax: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].map((v) => v.applyQuaternion(wq).normalize()) };
  }
  return out;
}
const tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion();
function pose(r: BoneRig | undefined, x: number, y: number, z: number) {
  if (!r) return;
  r.bone.quaternion.copy(r.rest);
  if (x) r.bone.quaternion.multiply(tq.setFromAxisAngle(r.ax[0], x));
  if (y) r.bone.quaternion.multiply(tq2.setFromAxisAngle(r.ax[1], y));
  if (z) r.bone.quaternion.multiply(tq.setFromAxisAngle(r.ax[2], z));
}

/** A GLB figure from the manifest: normalised to the seat, animated by its clips or, for rigged figures, by bones.
 *  While the file loads the built-in procedural figure stands in. */
/** Per-character eye placement in unit-height bind space (y in 0..1, +z forward) and eyelid colour for blinking. */
const EYE_SPEC: Record<string, { ey: number; eh: number; ex: number; ew: number; col: string }> = {
  ammar:   { ey: 0.806, eh: 0.025, ex: 0.044, ew: 0.032, col: '#c07e56' },
  biscuit: { ey: 0.758, eh: 0.034, ex: 0.072, ew: 0.044, col: '#9b643b' },
  mint:    { ey: 0.725, eh: 0.044, ex: 0.076, ew: 0.052, col: '#9ab8a0' },
  pepper:  { ey: 0.752, eh: 0.048, ex: 0.082, ew: 0.056, col: '#d89a62' },
  tango:   { ey: 0.675, eh: 0.052, ex: 0.076, ew: 0.055, col: '#e4832c' },
  choco:   { ey: 0.692, eh: 0.035, ex: 0.068, ew: 0.042, col: '#5a321e' },
  sugar:   { ey: 0.680, eh: 0.040, ex: 0.072, ew: 0.046, col: '#ebe5dc' },
};
export function attachBlinkShader(root: THREE.Object3D, id: string, ryDeg: number): { value: number }[] {
  const spec = EYE_SPEC[id]; if (!spec) return [];
  root.updateMatrixWorld(true);
  let skinned = false;
  root.traverse((o) => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh) { skinned = true; m.skeleton.update(); } });
  const box = new THREE.Box3().setFromObject(root, skinned);
  const sz = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  const sc = sz.y > 0 ? 1 / sz.y : 1;
  const unitRoot = new THREE.Matrix4()
    .makeRotationY((ryDeg * Math.PI) / 180)
    .multiply(new THREE.Matrix4().makeTranslation(-ctr.x * sc, -box.min.y * sc, -ctr.z * sc))
    .multiply(new THREE.Matrix4().makeScale(sc, sc, sc));
  const out: { value: number }[] = [];
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh; if (!m.isSkinnedMesh) return;
    const mt = (m.material as THREE.MeshStandardMaterial).clone();
    const uBlink = { value: 0 }; out.push(uBlink);
    const bindMat = unitRoot.clone().multiply(m.matrixWorld);
    const uEye = new THREE.Vector4(spec.ey, spec.eh, spec.ex, spec.ew);
    const uLidCol = new THREE.Color(spec.col);
    mt.onBeforeCompile = (sh) => {
      sh.uniforms.uBindMat = { value: bindMat };
      sh.uniforms.uBlink = uBlink;
      sh.uniforms.uEye = { value: uEye };
      sh.uniforms.uLidCol = { value: uLidCol };
      sh.vertexShader = 'uniform mat4 uBindMat;\nvarying vec3 vBindP;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvBindP = (uBindMat * vec4(transformed, 1.0)).xyz;'
      );
      sh.fragmentShader = 'uniform float uBlink;\nuniform vec4 uEye;\nuniform vec3 uLidCol;\nvarying vec3 vBindP;\n' + sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (uBlink > 0.01 && vBindP.z > 0.02) {
          float dx = (abs(vBindP.x) - uEye.z) / uEye.w;
          float dy = (vBindP.y - uEye.x) / uEye.y;
          float r2 = dx * dx + dy * dy;
          if (r2 < 1.0) {
            float edge = 1.0 - smoothstep(0.72, 1.0, r2);
            float lidLine = 1.0 - 2.0 * uBlink - 0.15 * (1.0 - dx * dx);
            float cov = smoothstep(lidLine - 0.15, lidLine + 0.12, dy) * edge;
            float lash = smoothstep(0.18, 0.0, abs(dy - lidLine)) * edge * step(0.2, uBlink);
            vec3 lid = mix(uLidCol, uLidCol * 0.22, lash * 0.85);
            diffuseColor.rgb = mix(diffuseColor.rgb, lid, cov);
            totalEmissiveRadiance = mix(totalEmissiveRadiance, lid * 0.22, cov);
          }
        }`
      );
    };
    m.material = mt;
  });
  return out;
}

function ModelFigure({ e, id, mood, seed, pose: stance, fallback, onFail }: { e: CharacterEntry; id: string; mood: Mood; seed: number; pose: 'sit' | 'stand'; fallback: ReactNode; onFail(): void }) {
  const level = usePrefs().graphics && graphicsLevel();
  const gl = useThree((st) => st.gl);
  const [obj, setObj] = useState<{ root: THREE.Object3D; mixer: THREE.AnimationMixer; clips: THREE.AnimationClip[]; bones: Record<string, BoneRig>; y0: number; blinkU: { value: number }[] } | null>(null);
  const action = useRef<THREE.AnimationAction | null>(null);
  useEffect(() => {
    let alive = true;
    loadModel(e, level).then(async (gltf) => {
      if (!alive) return;
      if (!gltf) { onFail(); return; }
      const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
      const root = clone(gltf.scene);
      // High: sharpest texture filtering the GPU offers (textures are sRGB colour + linear normal maps, mipmapped)
      const aniso = level === 'high' ? gl.capabilities.getMaxAnisotropy() : 1;
      root.traverse((o) => {
        const m = o as THREE.Mesh; if (!m.isMesh) return;
        m.castShadow = true; m.frustumCulled = false;
        const mt = m.material as THREE.MeshStandardMaterial; if (!mt?.isMeshStandardMaterial) return;
        if (mt.map) mt.roughness = Math.max(mt.roughness, 0.62); // painted skin/cloth: matte. Wire, chain, lenses keep their shine
        mt.metalness = 0; // no environment map in the room: metals would render black
        for (const tx of [mt.map, mt.normalMap, mt.emissiveMap]) if (tx && tx.anisotropy !== aniso) { tx.anisotropy = aniso; tx.needsUpdate = true; }
      });
      const blinkU = attachBlinkShader(root, id, e.rotationY ?? 0);
      normalise(root, stance === 'stand' && e.chair !== false ? { ...e, baseY: -0.12 } : e);
      setObj({ root, mixer: new THREE.AnimationMixer(root), clips: gltf.animations, bones: rigBones(root, ['body', 'armL', 'armR', 'root', 'hips', 'spine', 'head']), y0: root.position.y, blinkU });
    });
    return () => { alive = false; };
  }, [e, level, stance, gl]);
  useEffect(() => {
    if (!obj) return;
    const name = clipFor(obj.clips.map((c) => c.name), e, mood);
    const clip = obj.clips.find((c) => c.name === name);
    if (!clip) return;
    const next = obj.mixer.clipAction(clip);
    next.reset().fadeIn(0.3).play();
    action.current?.fadeOut(0.3);
    action.current = next;
  }, [obj, mood]);
  // card-action actor for this seat (seed is the seat number on the table)
  const actor = useRef<Actor | null>(null);
  useEffect(() => {
    if (!obj) return;
    const a: Actor = { seat: seed, id, motion: e.motion, root: obj.root, arms: findArms(obj.root), head: obj.bones.head?.bone ?? obj.bones.body?.bone ?? null, cmd: newCmd(), lowDetail: level !== 'high' };
    actor.current = a;
    const un = registerActor(a);
    return () => { un(); actor.current = null; };
  }, [obj, seed, level]);
  const lk = useRef({ yaw: 0, pitch: 0 });
  const sm = useRef({ hop: 0, tilt: 0, nod: 0, arm: 0, twist: 0 });
  useFrame((st, dt) => {
    if (!obj) return;
    obj.mixer.update(dt);
    if (obj.clips.length) return;
    const t = st.clock.elapsedTime + seed * 1.7, b = obj.bones, k = Math.min(1, dt * 5), s = sm.current;
    // targets per mood, eased so mood changes blend
    const happy = mood === 'happy', think = mood === 'think', sad = mood === 'sad', away = mood === 'away', surp = mood === 'surprised';
    const T = {
      hop: happy ? Math.abs(Math.sin(t * 6)) * 0.07 : surp ? 0.03 : 0,
      tilt: think ? 0.16 + Math.sin(t * 0.9) * 0.04 : happy ? Math.sin(t * 6) * 0.12 : Math.sin(t * 0.7) * 0.03,
      nod: sad ? 0.22 : away ? 0.38 : think ? -0.06 + Math.sin(t * 1.3) * 0.03 : surp ? -0.12 : Math.sin(t * 1.1) * 0.015,
      arm: happy ? 1.15 + Math.sin(t * 6) * 0.25 : think ? 0.35 : sad ? -0.08 : surp ? 0.5 : Math.sin(t * 1.4) * 0.05,
      twist: happy ? Math.sin(t * 3) * 0.18 : think ? Math.sin(t * 0.5) * 0.08 : 0,
    };
    for (const key of Object.keys(T) as (keyof typeof T)[]) s[key] += (T[key] - s[key]) * (key === 'hop' || key === 'tilt' || key === 'arm' ? Math.min(1, dt * 12) : k);
    obj.root.position.y = obj.y0 + s.hop + Math.sin(t * 1.6) * 0.006;
    if (e.motion === 'creature') {
      pose(b.body, s.nod * 0.6, s.twist, s.tilt * 0.8);
      pose(b.armL, 0, 0, -s.arm); pose(b.armR, 0, 0, s.arm * (think ? 0.2 : 1));
    } else if (e.motion === 'person') {
      pose(b.spine, s.nod * 0.3, s.twist, s.tilt * 0.35);
      pose(b.head, s.nod, s.twist * 0.6, s.tilt);
      pose(b.armL, 0, 0, -s.arm * 0.55); pose(b.armR, 0, 0, s.arm * (think ? 0.2 : 0.55));
    } else if (e.motion === 'animal') { // bear / cat / owl: body sway + head + waving arms (wings)
      pose(b.spine, s.nod * 0.3, s.twist * 0.6, s.tilt * 0.35);
      pose(b.head, s.nod, s.twist * 0.6, s.tilt);
      pose(b.armL, 0, 0, -s.arm * 0.8); pose(b.armR, 0, 0, s.arm * (think ? 0.2 : 0.8));
    }
    // organic blink (3.4-4.6 s cycle, occasional double-blink, surprised flutter, and focused peek squint)
    if (obj.blinkU.length) {
      const period = 3.5 + (seed % 3) * 0.55;
      const ph = t % period;
      let bl = ph < 0.15 ? Math.sin((ph / 0.15) * Math.PI) : ((Math.floor(t / period) % 3 === 1) && ph > 0.22 && ph < 0.36) ? Math.sin(((ph - 0.22) / 0.14) * Math.PI) : 0;
      const now = performance.now();
      if (surp || (actor.current?.cmd.blinkUntil && now < actor.current.cmd.blinkUntil)) {
        bl = Math.max(bl, Math.abs(Math.sin(now * 0.022)));
      }
      if (away) bl = Math.max(bl, 0.88);
      if (actor.current && actor.current.cmd.focus > 0.05) bl = Math.max(bl, actor.current.cmd.focus * 0.32);
      for (const u of obj.blinkU) u.value = bl;
    }
    applyActor(actor.current, obj.bones, lk.current, dt, t);
  });
  return obj ? <primitive object={obj.root} /> : <>{fallback}</>;
}

/** Layers the card-action commands on top of the mood pose: lean, head look-at, arm IK and paw curl. */
const vT = new THREE.Vector3(), vH = new THREE.Vector3(), vC0 = new THREE.Vector3(), vIdle = new THREE.Vector3(), qT = new THREE.Quaternion(), X1 = new THREE.Vector3(1, 0, 0);
function applyActor(a: Actor | null, b: Record<string, BoneRig>, lk: { yaw: number; pitch: number }, dt: number, t: number) {
  if (!a) return;
  const c = a.cmd;
  for (const arm of Object.values(a.arms)) if (arm) resetArm(arm);
  const spine = b.spine ?? b.body;
  // idle breathing: the chest rises and settles (~3.7 s cycle), the arms follow a touch
  const br = Math.sin(t * 1.7);
  if (spine) spine.bone.quaternion.multiply(qT.setFromAxisAngle(spine.ax[0], -0.012 * br));
  for (const arm of Object.values(a.arms)) if (arm) arm.fore.quaternion.multiply(qT.setFromAxisAngle(X1, 0.02 * br));
  // one-bone creatures (Orange guy) and blocky bodies (Choco, Sparkle) lean much less so the whole body doesn't tip
  const isCreature = a.motion === 'creature' || !b.spine;
  const isBlocky = a.id === 'choco' || a.id === 'sugar';
  const leanScale = isCreature ? 0.28 : isBlocky ? 0.42 : 0.48;
  const leanEff = c.lean * leanScale;
  if (spine && Math.abs(leanEff) > 1e-3) spine.bone.quaternion.multiply(qT.setFromAxisAngle(spine.ax[0], leanEff));
  const hb = b.head ?? b.body;
  // head look: yaw/pitch towards the action target, or in idle towards the active player / card on the table
  let wy = 0, wp = 0;
  let lookTarget = c.look;
  let lookWeight = c.lookW;
  if ((!lookTarget || lookWeight <= 0.02) && hb) {
    const ctx3 = getCtx3();
    const r = ctx3?.view.round;
    const L = ctx3?.layout;
    if (r && L) {
      const actSeat = r.active?.k === 'attempt' ? r.active.seat : r.active?.k === 'power' ? r.active.owner : r.current;
      if (actSeat != null && actSeat !== a.seat) {
        const hp = r.drawn?.by === actSeat ? L.hands[actSeat]?.p : null;
        const ap = L.areas[actSeat]?.p ?? L.chars[actSeat]?.p;
        const pt = hp ?? (ap ? [ap[0] * 0.75, 0.14, ap[2] * 0.75] : null);
        if (pt) { lookTarget = vIdle.set(pt[0], pt[1], pt[2]); lookWeight = 0.42; }
      } else if (actSeat === a.seat && L.areas[a.seat]) {
        const ap = L.areas[a.seat]!.p;
        lookTarget = vIdle.set(ap[0], 0.05, ap[2]); lookWeight = 0.3;
      }
    }
  }
  if (lookTarget && hb && lookWeight > 0) {
    const fr = a.root.parent ?? a.root; // the seat group: local +z faces the table centre
    fr.updateMatrixWorld(true);
    hb.bone.getWorldPosition(vH);
    vT.copy(lookTarget); fr.worldToLocal(vT); const h0 = fr.worldToLocal(vH.clone());
    vT.sub(h0);
    wy = THREE.MathUtils.clamp(Math.atan2(vT.x, vT.z), -0.75, 0.75) * lookWeight;
    wp = THREE.MathUtils.clamp(-Math.atan2(vT.y, Math.hypot(vT.x, vT.z)), -0.3, 0.2) * lookWeight;
  }
  const k = Math.min(1, dt * 9);
  lk.yaw += (wy - lk.yaw) * k; lk.pitch += (wp - lk.pitch) * k;
  if (hb && (Math.abs(lk.yaw) > 1e-3 || Math.abs(lk.pitch) > 1e-3 || Math.abs(leanEff) > 1e-3)) {
    if (hb === spine) {
      // creature without a separate head: gentle yaw + tiny pitch cap so it never compounds with leanEff
      const pCap = THREE.MathUtils.clamp((lk.pitch + c.focus * 0.06) * 0.2, -0.08, 0.08);
      hb.bone.quaternion.multiply(qT.setFromAxisAngle(hb.ax[1], lk.yaw * 0.4)).multiply(qT.setFromAxisAngle(hb.ax[0], pCap));
    } else {
      // separate head: counter-rotate part of the spine lean so the crown doesn't dip and the face stays upright
      const localPitch = THREE.MathUtils.clamp(lk.pitch + c.focus * 0.05 - leanEff * 0.9, -0.28, 0.1);
      hb.bone.quaternion.multiply(qT.setFromAxisAngle(hb.ax[1], lk.yaw)).multiply(qT.setFromAxisAngle(hb.ax[0], localPitch));
    }
  }
  a.root.updateMatrixWorld(true);
  a.root.getWorldPosition(vC0); vC0.y += 0.25;
  for (const sd of ['L', 'R'] as const) {
    const arm = a.arms[sd], cmd = c.arm[sd];
    if (!arm || !cmd || cmd.w <= 0.001) continue;
    solveArm(arm, cmd.target, cmd.w, vC0);
    if (!a.lowDetail) curlArm(arm, cmd.curl * cmd.w);
    else curlArm(arm, cmd.curl * cmd.w * 0.5);
  }
}

/** The manifest entry for a character id (null until the manifest has loaded). */
export function useCharacterEntry(id: string): CharacterEntry | null {
  const [entry, setEntry] = useState<CharacterEntry | null>(null);
  useEffect(() => { let a = true; loadManifest().then((m) => a && setEntry(entryFor(m, id))); return () => { a = false; }; }, [id]);
  return entry;
}

export function Figure({ id, mood, seed = 0, pose = 'sit' }: { id: string; mood: Mood; seed?: number; pose?: 'sit' | 'stand' }) {
  const entry = useCharacterEntry(id);
  const [failed, setFailed] = useState(false);
  const kind: Placeholder = useMemo(() => entry?.placeholder ?? ({ biscuit: 'bear', mint: 'cat', pepper: 'owl', tango: 'orange', ammar: 'ammar' } as Record<string, Placeholder>)[id] ?? 'generic', [entry, id]);
  const builtin = kind === 'orange' ? <OrangeGuy mood={mood} seed={seed} pose={pose} /> : kind === 'ammar' ? <AmmarFigure mood={mood} seed={seed} pose={pose} /> : <PlaceholderFigure kind={kind} mood={mood} seed={seed} />;
  if (entry?.model && !failed) return <ModelFigure e={entry} id={id} mood={mood} seed={seed} pose={pose} fallback={builtin} onFail={() => setFailed(true)} />;
  return builtin;
}
