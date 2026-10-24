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
import {
  registerActor,
  findArms,
  findLegs,
  poseLeg,
  computeSeatedLegPose,
  newCmd,
  solveArm,
  curlArm,
  resetArm,
  stepArmSmoothing,
  clampArmTarget,
  type ArmClampXf,
  activeEmoteFor,
  computeEmotePose,
  computeIdlePose,
  computeMouthTarget,
  type Actor,
  type EmotePose,
  type IdlePose,
  type Side,
} from './actors';
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
  const headY = kind === 'orange' ? 0.3 : 0.38;
  return (
    <group ref={set('root')}>
      {body}
      <group ref={set('head')} position={[0, headY, 0]}>{head}</group>
      {arms}
    </group>
  );
}

interface BoneRig { bone: THREE.Bone; rest: THREE.Quaternion; ax: THREE.Vector3[] }
function rigBones(root: THREE.Object3D, names: string[]): Record<string, BoneRig> {
  const out: Record<string, BoneRig> = {};
  root.updateMatrixWorld(true);
  const rootQ = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  for (const n of names) {
    const b = root.getObjectByName(n) as THREE.Bone | undefined;
    if (!b) continue;
    const wq = rootQ.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion())).invert();
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

export interface FaceShaderUniform { value: number; mouth: THREE.Vector4 }
const EYE_SPEC: Record<string, { ey: number; eh: number; ex: number; ew: number; col: string; my: number; mh: number; mw: number; mcol: string }> = {
  ammar:   { ey: 0.826, eh: 0.024, ex: 0.043, ew: 0.030, col: '#e6a87e', my: 0.745, mh: 0.000, mw: 0.028, mcol: '#e6a87e' },
  biscuit: { ey: 0.758, eh: 0.034, ex: 0.072, ew: 0.044, col: '#9b643b', my: 0.640, mh: 0.032, mw: 0.046, mcol: '#c28c5c' },
  mint:    { ey: 0.725, eh: 0.044, ex: 0.076, ew: 0.052, col: '#9ab8a0', my: 0.645, mh: 0.028, mw: 0.042, mcol: '#b8bfa2' },
  pepper:  { ey: 0.752, eh: 0.048, ex: 0.082, ew: 0.056, col: '#d89a62', my: 0.000, mh: 0.000, mw: 0.000, mcol: '#d89a62' },
  tango:   { ey: 0.675, eh: 0.052, ex: 0.076, ew: 0.055, col: '#e4832c', my: 0.562, mh: 0.042, mw: 0.072, mcol: '#e28040' },
  choco:   { ey: 0.692, eh: 0.035, ex: 0.068, ew: 0.042, col: '#5a321e', my: 0.602, mh: 0.038, mw: 0.062, mcol: '#603420' },
  sugar:   { ey: 0.680, eh: 0.040, ex: 0.072, ew: 0.046, col: '#ebe5dc', my: 0.552, mh: 0.038, mw: 0.058, mcol: '#ede6dc' },
};
export function attachBlinkShader(root: THREE.Object3D, id: string, ryDeg: number): FaceShaderUniform[] {
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
  const out: FaceShaderUniform[] = [];
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh; if (!m.isSkinnedMesh) return;
    const mt = (m.material as THREE.MeshStandardMaterial).clone();
    const uMouth = new THREE.Vector4(0, 0.25, 1, 0);
    const uFace: FaceShaderUniform = { value: 0, mouth: uMouth }; out.push(uFace);
    const bindMat = unitRoot.clone().multiply(m.matrixWorld);
    const uEye = new THREE.Vector4(spec.ey, spec.eh, spec.ex, spec.ew);
    const uLidCol = new THREE.Color(spec.col);
    const uMouthSpec = new THREE.Vector3(spec.my, spec.mh, spec.mw);
    const uMouthCol = new THREE.Color(spec.mcol);
    mt.onBeforeCompile = (sh) => {
      sh.uniforms.uBindMat = { value: bindMat };
      sh.uniforms.uBlink = uFace;
      sh.uniforms.uEye = { value: uEye };
      sh.uniforms.uLidCol = { value: uLidCol };
      sh.uniforms.uMouth = { value: uMouth };
      sh.uniforms.uMouthSpec = { value: uMouthSpec };
      sh.uniforms.uMouthCol = { value: uMouthCol };
      sh.vertexShader = 'uniform mat4 uBindMat;\nvarying vec3 vBindP;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvBindP = (uBindMat * vec4(transformed, 1.0)).xyz;'
      );
      sh.fragmentShader = 'uniform float uBlink;\nuniform vec4 uEye;\nuniform vec3 uLidCol;\nuniform vec4 uMouth;\nuniform vec3 uMouthSpec;\nuniform vec3 uMouthCol;\nvarying vec3 vBindP;\n' + sh.fragmentShader.replace(
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
        }
        if (uMouth.w > 0.01 && uMouthSpec.y > 0.001 && vBindP.z > 0.16 && abs(vBindP.x) < 0.14) {
          float cx = vBindP.x / (uMouthSpec.z * 1.12);
          float cy = (vBindP.y - uMouthSpec.x) / (uMouthSpec.y * 0.72);
          float cr2 = cx * cx + cy * cy;
          if (cr2 < 1.0) {
            float cMask = (1.0 - smoothstep(0.42, 1.0, cr2)) * uMouth.w;
            diffuseColor.rgb = mix(diffuseColor.rgb, uMouthCol, cMask * 0.90);
            totalEmissiveRadiance = mix(totalEmissiveRadiance, uMouthCol * 0.18, cMask * 0.90);
          }
          float mx = vBindP.x / (uMouthSpec.z * max(0.38, uMouth.z));
          float my0 = (vBindP.y - uMouthSpec.x) / uMouthSpec.y;
          float bend = uMouth.y * (mx * mx - 0.28);
          float yRel = my0 - bend;
          float openH = max(0.08, uMouth.x);
          float topSc = uMouth.y > 0.0 ? mix(1.0, 0.46, clamp(uMouth.y * 1.6, 0.0, 1.0)) : 1.0;
          float botSc = uMouth.y < 0.0 ? mix(1.0, 0.52, clamp(-uMouth.y * 1.6, 0.0, 1.0)) : 1.08;
          float ey = yRel > 0.0 ? yRel / (openH * topSc) : yRel / (openH * botSc);
          float mr = sqrt(mx * mx + ey * ey);
          if (mr < 1.08) {
            float outerA = (1.0 - smoothstep(0.92, 1.08, mr)) * uMouth.w;
            float innerA = 1.0 - smoothstep(0.75, 0.91, mr);
            vec3 cav = vec3(0.18, 0.04, 0.05);
            float tx = mx * 1.05;
            float ty = (ey + 0.56) * 1.35;
            float tMask = (1.0 - smoothstep(0.40, 0.65, tx * tx + ty * ty)) * step(-0.08, -ey);
            cav = mix(cav, vec3(0.92, 0.36, 0.36), tMask);
            float teethLine = 0.56 - 0.12 * mx * mx;
            float teethMask = smoothstep(teethLine - 0.12, teethLine + 0.06, ey) * step(0.28, uMouth.x) * step(-0.15, uMouth.y);
            cav = mix(cav, vec3(0.98, 0.96, 0.92), teethMask * 0.95);
            vec3 lipCol = uMouthCol * 0.24;
            vec3 mFinal = mix(lipCol, cav, innerA);
            diffuseColor.rgb = mix(diffuseColor.rgb, mFinal, outerA);
            totalEmissiveRadiance = mix(totalEmissiveRadiance, mFinal * 0.22, outerA);
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
  const [obj, setObj] = useState<{ root: THREE.Object3D; mixer: THREE.AnimationMixer; clips: THREE.AnimationClip[]; bones: Record<string, BoneRig>; x0: number; y0: number; z0: number; blinkU: FaceShaderUniform[] } | null>(null);
  const action = useRef<THREE.AnimationAction | null>(null);
  useEffect(() => {
    let alive = true;
    loadModel(e, level).then(async (gltf) => {
      if (!alive) return;
      if (!gltf) { onFail(); return; }
      const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
      const root = clone(gltf.scene);
      const aniso = level === 'high' ? gl.capabilities.getMaxAnisotropy() : 1;
      root.traverse((o) => {
        const m = o as THREE.Mesh; if (!m.isMesh) return;
        m.castShadow = !/lens|rim|bridge|temple/i.test(m.name) && !/lens|rim|bridge|temple/i.test(m.parent?.name ?? ''); m.frustumCulled = false;
        const mt = m.material as THREE.MeshStandardMaterial; if (!mt?.isMeshStandardMaterial) return;
        if (mt.map) mt.roughness = Math.max(mt.roughness, 0.62);
        if (mt.normalMap) mt.normalScale.set(0.28, 0.28);
        mt.metalness = 0;
        for (const tx of [mt.map, mt.normalMap, mt.emissiveMap]) if (tx && tx.anisotropy !== aniso) { tx.anisotropy = aniso; tx.needsUpdate = true; }
      });
      const blinkU = attachBlinkShader(root, id, e.rotationY ?? 0);
      normalise(root, stance === 'stand' && e.chair !== false ? { ...e, baseY: -0.12 } : e);
      lk.current.bodyQ.clear();
      setObj({
        root,
        mixer: new THREE.AnimationMixer(root),
        clips: gltf.animations,
        bones: rigBones(root, ['body', 'armL', 'armR', 'root', 'hips', 'spine', 'head']),
        x0: root.position.x,
        y0: root.position.y,
        z0: root.position.z,
        blinkU,
      });
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
  const actor = useRef<Actor | null>(null);
  useEffect(() => {
    if (!obj) return;
    const a: Actor = {
      seat: seed,
      id,
      motion: e.motion,
      root: obj.root,
      arms: findArms(obj.root),
      legs: findLegs(obj.root),
      head: obj.bones.head?.bone ?? obj.bones.body?.bone ?? null,
      cmd: newCmd(),
      lowDetail: level !== 'high',
    };
    // Capture where the head and torso bones sit (seat frame) in the rest pose; the arm clamp follows them as the body moves.
    const fr0 = obj.root.parent;
    const headBone = obj.bones.head?.bone ?? obj.bones.body?.bone ?? null;
    const torsoBone = obj.bones.spine?.bone ?? obj.bones.body?.bone ?? null;
    if (fr0 && headBone && torsoBone) {
      const saved = Object.values(obj.bones).map((br) => [br, br.bone.quaternion.clone()] as const);
      for (const br of Object.values(obj.bones)) br.bone.quaternion.copy(br.rest);
      const p0 = obj.root.position.clone();
      obj.root.position.set(obj.x0, obj.y0, obj.z0);
      fr0.updateMatrixWorld(true);
      const inv = fr0.matrixWorld.clone().invert();
      a.rest = { headBone, headM: inv.clone().multiply(headBone.matrixWorld), torsoBone, torsoM: inv.clone().multiply(torsoBone.matrixWorld) };
      for (const [br, q] of saved) br.bone.quaternion.copy(q);
      obj.root.position.copy(p0);
      fr0.updateMatrixWorld(true);
    }
    actor.current = a;
    const un = registerActor(a);
    return () => { un(); actor.current = null; };
  }, [obj, seed, level]);
  const lk = useRef({
    yaw: 0,
    pitch: 0,
    lean: 0,
    coilYaw: 0,
    shiftX: 0,
    shiftY: 0,
    shiftZ: 0,
    mouthOpen: 0,
    mouthSmile: 0.25,
    mouthWidth: 0.95,
    bodyQ: new Map<string, THREE.Quaternion>(),
  });
  const sm = useRef({ hop: 0, tilt: 0, nod: 0, arm: 0, twist: 0 });
  useFrame((st, dt) => {
    if (!obj) return;
    const d = dt > 0 && dt < 0.25 ? dt : 1 / 60;
    obj.mixer.update(d);
    if (obj.clips.length) return;
    const t = st.clock.elapsedTime + seed * 1.7, b = obj.bones, k = 1 - Math.exp(-d * 6), s = sm.current;
    const happy = mood === 'happy', think = mood === 'think', sad = mood === 'sad', away = mood === 'away', surp = mood === 'surprised';
    const T = {
      hop: happy ? Math.abs(Math.sin(t * 6)) * 0.07 : surp ? 0.03 : 0,
      tilt: think ? 0.14 + Math.sin(t * 0.9) * 0.04 : happy ? Math.sin(t * 6) * 0.12 : Math.sin(t * 0.7) * 0.03,
      nod: sad ? 0.20 : away ? 0.35 : think ? -0.05 + Math.sin(t * 1.3) * 0.03 : surp ? -0.10 : Math.sin(t * 1.1) * 0.015,
      arm: happy ? 1.15 + Math.sin(t * 6) * 0.25 : think ? 0.35 : sad ? -0.08 : surp ? 0.5 : Math.sin(t * 1.4) * 0.05,
      twist: happy ? Math.sin(t * 3) * 0.18 : think ? Math.sin(t * 0.5) * 0.08 : 0,
    };
    for (const key of Object.keys(T) as (keyof typeof T)[]) s[key] += (T[key] - s[key]) * (key === 'hop' || key === 'tilt' || key === 'arm' ? 1 - Math.exp(-d * 10) : k);
    const now = performance.now();
    const em = activeEmoteFor(seed, now);
    const busyArms = !!(actor.current && Object.values(actor.current.cmd.arm).some((x) => x && !x.hold && x.w > 0.05));
    const ep = em && !busyArms ? computeEmotePose(em.kind, em.u) : null;
    const idle = computeIdlePose(id, seed, st.clock.elapsedTime, mood, lk.current.yaw);
    // Reset torso/head bones to rest before computing this frame's target pose
    for (const [kBone, br] of Object.entries(b)) if (kBone !== 'armL' && kBone !== 'armR' && br) br.bone.quaternion.copy(br.rest);
    if (e.motion === 'creature') {
      pose(b.root, 0, 0, idle.hipsRoll);
      pose(b.body, s.nod * 0.5 + idle.spinePitch, s.twist + idle.spineYaw, s.tilt * 0.55 + idle.spineRoll);
    } else if (id === 'choco' || id === 'sugar') {
      // Blocky figures (eyes/mouth on front of block): drive torso/head together via spine so face never shears
      pose(b.hips, 0, 0, idle.hipsRoll);
      pose(b.spine, s.nod * 0.45 + idle.spinePitch, s.twist * 0.7 + idle.spineYaw, s.tilt * 0.45 + idle.spineRoll);
      pose(b.head, 0, 0, 0);
    } else {
      pose(b.hips, 0, 0, idle.hipsRoll);
      pose(b.spine, s.nod * 0.3 + idle.spinePitch, s.twist * 0.6 + idle.spineYaw, s.tilt * 0.35 + idle.spineRoll);
      pose(b.head, s.nod, s.twist * 0.5, s.tilt * 0.6 + idle.headRoll);
    }
    if (obj.blinkU.length) {
      const period = 3.5 + (seed % 3) * 0.55;
      const ph = t % period;
      let bl = ph < 0.15 ? Math.sin((ph / 0.15) * Math.PI) : ((Math.floor(t / period) % 3 === 1) && ph > 0.22 && ph < 0.36) ? Math.sin(((ph - 0.22) / 0.14) * Math.PI) : 0;
      if (surp || (actor.current?.cmd.blinkUntil && now < actor.current.cmd.blinkUntil)) {
        bl = Math.max(bl, Math.abs(Math.sin(now * 0.022)));
      }
      if (sad) bl = Math.max(bl, 0.55);
      if (away) bl = Math.max(bl, 0.88);
      if (actor.current && actor.current.cmd.focus > 0.05) bl = Math.max(bl, actor.current.cmd.focus * 0.32);
      if (ep) bl = Math.max(bl, ep.blink);
      const mt = computeMouthTarget(id, mood, st.clock.elapsedTime, idle, actor.current?.cmd ?? null, em);
      const km = 1 - Math.exp(-d * 12);
      lk.current.mouthOpen += (mt.open - lk.current.mouthOpen) * km;
      lk.current.mouthSmile += (mt.smile - lk.current.mouthSmile) * km;
      lk.current.mouthWidth += (mt.width - lk.current.mouthWidth) * km;
      const cov = THREE.MathUtils.smoothstep(lk.current.mouthOpen, 0.02, 0.14);
      for (const u of obj.blinkU) {
        u.value = bl;
        u.mouth.set(lk.current.mouthOpen, lk.current.mouthSmile, lk.current.mouthWidth, cov);
      }
    }
    applyActor(actor.current, obj, lk.current, d, t, ep, idle, s.hop, mood);
  });
  return obj ? <primitive object={obj.root} /> : <>{fallback}</>;
}

const mFrInv = new THREE.Matrix4(), mCur = new THREE.Matrix4(), mTmp = new THREE.Matrix4();
const xfS: ArmClampXf = { headIn: new THREE.Matrix4(), headOut: new THREE.Matrix4(), torsoIn: new THREE.Matrix4(), torsoOut: new THREE.Matrix4() };
const vSh = new THREE.Vector3(), vEl = new THREE.Vector3(), vHd = new THREE.Vector3();
const vT = new THREE.Vector3(), vIdleArm = new THREE.Vector3(), vH = new THREE.Vector3(), vC0 = new THREE.Vector3(), vIdle = new THREE.Vector3(), vLocReach = new THREE.Vector3(), qT = new THREE.Quaternion();
function applyActor(
  a: Actor | null,
  obj: { root: THREE.Object3D; bones: Record<string, BoneRig>; x0: number; y0: number; z0: number },
  lk: { yaw: number; pitch: number; lean: number; coilYaw: number; shiftX: number; shiftY: number; shiftZ: number; bodyQ: Map<string, THREE.Quaternion> },
  dt: number,
  t: number,
  ep: EmotePose | null = null,
  idle?: IdlePose,
  moodHop = 0,
  mood = 'idle',
) {
  if (!a) return;
  const b = obj.bones;
  const c = a.cmd;
  const fr = a.root.parent ?? a.root;
  fr.updateMatrixWorld(true);

  const spine = b.spine ?? b.body;
  const isCreature = a.motion === 'creature' || !b.spine;
  const isBlocky = a.id === 'choco' || a.id === 'sugar';

  // Check active arm reaches & holds to drive automatic whole-body forward root shift & shoulder coil
  let wantShiftX = c.shift?.[0] ?? 0;
  let wantShiftY = c.shift?.[1] ?? 0;
  let wantShiftZ = c.shift?.[2] ?? 0;
  let wantCoilYaw = c.yaw ?? 0;
  let activeReachMax = 0;
  let holdingSide: Side | null = null;

  for (const sd of ['L', 'R'] as const) {
    const ac = c.arm[sd];
    if (!ac || ac.w <= 0.02) continue;
    if (ac.hold) {
      holdingSide = sd;
    } else {
      activeReachMax = Math.max(activeReachMax, ac.w);
      vLocReach.copy(ac.target);
      fr.worldToLocal(vLocReach);
      // Reach distance forward (+z toward table center)
      const reachZ = THREE.MathUtils.clamp((vLocReach.z - 0.14) / 0.45, 0, 1) * ac.w;
      if (!c.shift) {
        wantShiftZ = Math.max(wantShiftZ, reachZ * 0.19);
        wantShiftY = Math.max(wantShiftY, reachZ * 0.028);
        wantShiftX += THREE.MathUtils.clamp(vLocReach.x * 0.18, -0.045, 0.045) * ac.w;
      }
      if (c.yaw === undefined) {
        // Reaching with L (-x) turns torso so left shoulder leads (+z): negative yaw; R (+x): positive yaw
        const sgn = sd === 'L' ? -1 : 1;
        wantCoilYaw += sgn * 0.36 * reachZ;
      }
    }
  }

  // Spectator engagement: when a match window is open on the pile, spectators lean in slightly
  const ctx3 = getCtx3();
  const r = ctx3?.view.round;
  const L = ctx3?.layout;
  const spectatorLean = !activeReachMax && !holdingSide && r?.window ? 0.065 : 0;

  const kShift = 1 - Math.exp(-dt * 11.5);
  lk.shiftX += (wantShiftX - lk.shiftX) * kShift;
  lk.shiftY += (wantShiftY - lk.shiftY) * kShift;
  lk.shiftZ += (wantShiftZ - lk.shiftZ) * kShift;
  lk.coilYaw += (wantCoilYaw - lk.coilYaw) * kShift;

  obj.root.position.set(
    obj.x0 + lk.shiftX,
    obj.y0 + (ep ? ep.hop : moodHop) + lk.shiftY + Math.sin(t * 1.6) * 0.008,
    obj.z0 + lk.shiftZ,
  );

  const leanScale = isCreature ? 0.32 : isBlocky ? 0.44 : 0.52;
  const wantLean = (c.lean + spectatorLean + (ep ? ep.lean : 0)) * leanScale;
  lk.lean += (wantLean - lk.lean) * (1 - Math.exp(-dt * 11));
  const leanEff = lk.lean;
  if (spine && (Math.abs(leanEff) > 1e-3 || Math.abs(lk.coilYaw) > 1e-3)) {
    spine.bone.quaternion
      .multiply(qT.setFromAxisAngle(spine.ax[0], leanEff))
      .multiply(tq2.setFromAxisAngle(spine.ax[1], lk.coilYaw * (isCreature ? 0.65 : 0.85)));
  }

  // 3-bone articulated leg animation for all 7 characters
  if (a.legs && (a.legs.L || a.legs.R)) {
    const legPose = computeSeatedLegPose(a.id, a.seat, t, mood, c.lean, ep ? null : activeEmoteFor(a.seat), activeReachMax > 0.15);
    poseLeg(a.legs.L, legPose.L.hipPitch, legPose.L.kneeBend, legPose.L.footPitch, legPose.L.hipRoll, dt);
    poseLeg(a.legs.R, legPose.R.hipPitch, legPose.R.kneeBend, legPose.R.footPitch, legPose.R.hipRoll, dt);
  }

  const hb = isBlocky ? spine : (b.head ?? b.body);
  let wy = 0, wp = 0;
  let lookTarget = c.look;
  let lookWeight = c.lookW;

  // Active slot-scanning loop while holding a drawn card (deciding whether to swap or throw!)
  if (holdingSide && !ep && L && L.areas[a.seat]) {
    const ap = L.areas[a.seat]!;
    const scanPhase = Math.sin(t * 2.8 + a.seat * 1.3);
    const glanceAtHeld = Math.sin(t * 1.4 + a.seat) > 0.45;
    if (glanceAtHeld && L.hands[a.seat]) {
      const hp = L.hands[a.seat]!.p;
      lookTarget = vIdle.set(hp[0], hp[1], hp[2]);
      lookWeight = 0.72;
    } else {
      const sx = Math.cos(ap.yaw) * scanPhase * 0.19;
      const sz = -Math.sin(ap.yaw) * scanPhase * 0.19;
      lookTarget = vIdle.set(ap.p[0] + sx, 0.04, ap.p[2] + sz);
      lookWeight = 0.78;
    }
  } else if ((!lookTarget || lookWeight <= 0.02) && hb && r && L) {
    const actSeat = r.active?.k === 'attempt' ? r.active.seat : r.active?.k === 'power' ? r.active.owner : r.current;
    // When a match window is open, spectators alternate glancing at the center discard pile and the active player
    if (r.window && Math.sin(t * 1.5 + a.seat) > 0.15) {
      lookTarget = vIdle.set(0.16, 0.04, 0);
      lookWeight = 0.56;
    } else if (actSeat != null && actSeat !== a.seat) {
      const hp = r.drawn?.by === actSeat ? L.hands[actSeat]?.p : null;
      const ap = L.areas[actSeat]?.p ?? L.chars[actSeat]?.p;
      const pt = hp ?? (ap ? [ap[0] * 0.75, 0.14, ap[2] * 0.75] : null);
      if (pt) { lookTarget = vIdle.set(pt[0], pt[1], pt[2]); lookWeight = 0.52; }
    } else if (actSeat === a.seat && L.areas[a.seat]) {
      const ap = L.areas[a.seat]!.p;
      lookTarget = vIdle.set(ap[0], 0.05, ap[2]); lookWeight = 0.42;
    }
  }

  if (lookTarget && hb && lookWeight > 0) {
    fr.updateMatrixWorld(true);
    hb.bone.getWorldPosition(vH);
    vT.copy(lookTarget); fr.worldToLocal(vT); const h0 = fr.worldToLocal(vH.clone());
    vT.sub(h0);
    wy = THREE.MathUtils.clamp(Math.atan2(vT.x, vT.z), -0.75, 0.75) * lookWeight;
    wp = THREE.MathUtils.clamp(-Math.atan2(vT.y, Math.hypot(vT.x, vT.z)), -0.32, 0.22) * lookWeight;
  }
  const kLook = 1 - Math.exp(-dt * 9.0);
  lk.yaw += (wy - lk.yaw) * kLook; lk.pitch += (wp - lk.pitch) * kLook;
  const yawEff = lk.yaw + (ep ? ep.shake : 0);
  if (hb && (Math.abs(yawEff) > 1e-3 || Math.abs(lk.pitch) > 1e-3 || Math.abs(leanEff) > 1e-3)) {
    if (hb === spine) {
      const pCap = THREE.MathUtils.clamp((lk.pitch + c.focus * 0.06) * 0.24, -0.10, 0.10);
      hb.bone.quaternion.multiply(qT.setFromAxisAngle(hb.ax[1], yawEff * 0.52)).multiply(qT.setFromAxisAngle(hb.ax[0], pCap));
    } else {
      const localPitch = THREE.MathUtils.clamp(lk.pitch + c.focus * 0.05 - leanEff * 0.9, -0.28, 0.12);
      hb.bone.quaternion.multiply(qT.setFromAxisAngle(hb.ax[1], yawEff)).multiply(qT.setFromAxisAngle(hb.ax[0], localPitch));
    }
  }
  const kBody = 1 - Math.exp(-dt * 12.5);
  for (const kName of ['root', 'hips', 'body', 'spine', 'head']) {
    const br = b[kName]; if (!br) continue;
    let sq = lk.bodyQ.get(kName);
    if (!sq) { sq = br.bone.quaternion.clone(); lk.bodyQ.set(kName, sq); }
    else { sq.slerp(br.bone.quaternion, kBody); br.bone.quaternion.copy(sq); }
  }

  fr.updateMatrixWorld(true);
  a.root.getWorldPosition(vC0); vC0.y += 0.25;
  let xf: ArmClampXf | null = null;
  if (a.rest) {
    mFrInv.copy(fr.matrixWorld).invert();
    mCur.copy(mFrInv).multiply(a.rest.headBone.matrixWorld);
    xfS.headOut.copy(mCur).multiply(mTmp.copy(a.rest.headM).invert());
    xfS.headIn.copy(xfS.headOut).invert();
    mCur.copy(mFrInv).multiply(a.rest.torsoBone.matrixWorld);
    xfS.torsoOut.copy(mCur).multiply(mTmp.copy(a.rest.torsoM).invert());
    xfS.torsoIn.copy(xfS.torsoOut).invert();
    xf = xfS;
  }
  for (const sd of ['L', 'R'] as const) {
    const arm = a.arms[sd]; if (!arm) continue;
    arm.up.quaternion.copy(arm.restUp);
    resetArm(arm);

    const idleLoc = idle ? (sd === 'L' ? idle.tL : idle.tR) : [sd === 'L' ? -0.19 : 0.19, 0.05, 0.18];
    const idleCurl = idle ? (sd === 'L' ? idle.cL : idle.cR) : 0.35;
    vIdleArm.set(idleLoc[0], idleLoc[1], idleLoc[2]);
    fr.localToWorld(vIdleArm);

    const cmd = c.arm[sd];
    if (cmd?.hold) {
      const stillHolding = getCtx3()?.view.round?.drawn?.by === a.seat && !ep;
      if (!stillHolding) {
        cmd.w = Math.max(0, cmd.w - dt * 4.5);
        if (cmd.w <= 0.01) delete c.arm[sd];
      }
    }

    const otherSide: Side = sd === 'L' ? 'R' : 'L';
    const otherCmd = c.arm[otherSide];
    const sgn = sd === 'L' ? -1 : 1;

    let curl = idleCurl;
    let isFastReach = false;
    if (cmd && cmd.w > 0.001 && !ep) {
      vT.lerpVectors(vIdleArm, cmd.target, cmd.w);
      if (cmd.hold) {
        vT.y += Math.sin(t * 2.6) * 0.016;
        vT.x += Math.cos(t * 1.9) * 0.014;
      } else {
        isFastReach = true;
      }
      curl = THREE.MathUtils.lerp(idleCurl, cmd.curl, cmd.w);
    } else if (ep) {
      const tLoc = sd === 'L' ? ep.tL : ep.tR;
      const w = sd === 'L' ? ep.wL : ep.wR;
      const eCurl = sd === 'L' ? ep.cL : ep.cR;
      if (tLoc && w > 0.001) {
        vT.set(tLoc[0], tLoc[1], tLoc[2]);
        fr.localToWorld(vT);
        vT.lerpVectors(vIdleArm, vT, w);
        curl = THREE.MathUtils.lerp(idleCurl, eCurl, w);
      } else {
        vT.copy(vIdleArm);
      }
    } else if (otherCmd && otherCmd.hold && otherCmd.w > 0.2) {
      // While the other hand holds a drawn card, this free hand hovers/taps thoughtfully over the slots or chin!
      const ponderWave = 0.5 + 0.5 * Math.sin(t * 2.4 + a.seat);
      const hoverX = sgn * (a.id === 'tango' ? 0.35 : 0.16) + Math.sin(t * 3.1) * 0.035;
      const hoverY = 0.08 + ponderWave * 0.16;
      const hoverZ = 0.24 + (1 - ponderWave) * 0.06;
      vT.set(hoverX, hoverY, hoverZ);
      fr.localToWorld(vT);
      vT.lerpVectors(vIdleArm, vT, otherCmd.w * 0.85);
      curl = 0.35 + 0.18 * Math.sin(t * 6.2);
    } else if (otherCmd && !otherCmd.hold && otherCmd.w > 0.1) {
      // Automatic off-hand bracing on the table rim when the other hand reaches across the felt!
      const braceX = sgn * (a.id === 'tango' ? 0.36 : 0.22);
      vT.set(braceX, 0.032, 0.27);
      fr.localToWorld(vT);
      vT.lerpVectors(vIdleArm, vT, otherCmd.w * 0.82);
      curl = THREE.MathUtils.lerp(idleCurl, 0.55, otherCmd.w * 0.82);
    } else {
      vT.copy(vIdleArm);
    }

    fr.worldToLocal(vT);
    // Clamp against the body/face using where the IK hand will actually land (targets beyond reach slide along the shoulder ray).
    arm.up.getWorldPosition(vSh); fr.worldToLocal(vSh);
    arm.fore.getWorldPosition(vEl); fr.worldToLocal(vEl);
    (arm.curl ?? arm.hand).getWorldPosition(vHd); fr.worldToLocal(vHd);
    const reach = vSh.distanceTo(vEl) + vEl.distanceTo(vHd);
    const clamped = clampArmTarget([vT.x, vT.y, vT.z], sd, a.id, [vSh.x, vSh.y, vSh.z], reach, xf);
    if (a.dbg) a.dbg[sd] = { raw: [vT.x, vT.y, vT.z], out: clamped, sh: [vSh.x, vSh.y, vSh.z], reach, mode: cmd && cmd.w > 0.001 && !ep ? (cmd.hold ? 'hold' : 'reach') : ep ? 'emote' : otherCmd && otherCmd.w > 0.1 ? 'other' : 'idle' };
    vT.set(clamped[0], clamped[1], clamped[2]);
    fr.localToWorld(vT);
    for (let k = 0; k < 2; k++) solveArm(arm, vT, 1.0, vC0);
    curlArm(arm, curl * (a.lowDetail ? 0.5 : 1));
    stepArmSmoothing(arm, dt, isFastReach);
  }
}

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
  if (entry?.model && !failed) return <ModelFigure key={id} e={entry} id={id} mood={mood} seed={seed} pose={pose} fallback={builtin} onFail={() => setFailed(true)} />;
  return builtin;
}
