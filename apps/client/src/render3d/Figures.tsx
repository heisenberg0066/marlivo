// 3D characters: low-poly placeholder figures made from primitives (Biscuit the bear, Mint the cat, Pepper the
// owl, Tango the orange guy and a generic guest), with idle / think / celebrate / sad / surprised / away motions.
// A GLB listed in the character manifest replaces the placeholder with no code changes (see registry.ts).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Mood } from '../render/characters';
import { useRigMotion, type Rig } from './rig';
import { OrangeGuy, AmmarFigure } from './Hero';
import { loadManifest, entryFor, loadModel, normalise, clipFor, type CharacterEntry, type Placeholder } from './registry';

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

/** A GLB figure from the manifest: normalised to the seat, with its clips mapped to moods. */
function ModelFigure({ e, mood, onFail }: { e: CharacterEntry; mood: Mood; onFail(): void }) {
  const [obj, setObj] = useState<{ root: THREE.Object3D; mixer: THREE.AnimationMixer; clips: THREE.AnimationClip[] } | null>(null);
  const action = useRef<THREE.AnimationAction | null>(null);
  useEffect(() => {
    let alive = true;
    loadModel(e).then(async (gltf) => {
      if (!alive) return;
      if (!gltf) { onFail(); return; }
      const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
      const root = clone(gltf.scene);
      normalise(root, e);
      setObj({ root, mixer: new THREE.AnimationMixer(root), clips: gltf.animations });
    });
    return () => { alive = false; };
  }, [e]);
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
  useFrame((st, dt) => {
    if (!obj) return;
    obj.mixer.update(dt);
    if (!obj.clips.length) obj.root.position.y = (e.baseY ?? -0.62) + Math.sin(st.clock.elapsedTime * 1.6) * 0.006; // still models breathe a little
  });
  return obj ? <primitive object={obj.root} /> : null;
}

export function Figure({ id, mood, seed = 0, pose = 'sit' }: { id: string; mood: Mood; seed?: number; pose?: 'sit' | 'stand' }) {
  const [entry, setEntry] = useState<CharacterEntry | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { let a = true; loadManifest().then((m) => a && setEntry(entryFor(m, id))); return () => { a = false; }; }, [id]);
  const kind: Placeholder = useMemo(() => entry?.placeholder ?? ({ biscuit: 'bear', mint: 'cat', pepper: 'owl', tango: 'orange', ammar: 'ammar' } as Record<string, Placeholder>)[id] ?? 'generic', [entry, id]);
  if (entry?.model && !failed) return <ModelFigure e={entry} mood={mood} onFail={() => setFailed(true)} />;
  if (kind === 'orange') return <OrangeGuy mood={mood} seed={seed} pose={pose} />;
  if (kind === 'ammar') return <AmmarFigure mood={mood} seed={seed} pose={pose} />;
  return <PlaceholderFigure kind={kind} mood={mood} seed={seed} />;
}
