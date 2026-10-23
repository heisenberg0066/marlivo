// Scene 3 · Dusk with lanterns (sketch book v8 p04): blue-violet sky with the first stars, paper lanterns on a
// wooden pergola, candle jars, a square dark-oak table with a terracotta runner, and the court floodlit so the
// Orange guys keep playing after dark. Its own lazy chunk.
import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GardenBase, type SceneProps } from './base';
import { lam, shadowMat, FLAT, TG } from './props';
import { TABLE_R, FLOOR_Y, TABLE_SHAPES } from '../sceneConfig';
import { FairyLights, Posts } from './garden';
import { runnerTexture, planksTexture, glowDot } from './stex';

type V3 = [number, number, number];
const GEO = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 10), sphere: new THREE.SphereGeometry(1, 12, 8) };
const STRINGS: { a: V3; b: V3; sag: number }[] = [
    { a: [-6, FLOOR_Y + 2.4, -8.6], b: [6, FLOOR_Y + 2.4, -8.6], sag: 0.45 },
    { a: [-2.1, 2.1, -2.0], b: [-6, FLOOR_Y + 2.4, -8.6], sag: 0.4 },
    { a: [2.1, 2.1, -2.0], b: [6, FLOOR_Y + 2.4, -8.6], sag: 0.4 },
    { a: [-2.1, 2.08, -2.0], b: [2.1, 2.08, -2.0], sag: 0.22 },
  ];
const LANTERNS: V3[] = [[-1.55, 1.0, -2.0], [-0.62, 1.12, -2.0], [0.62, 1.06, -2.0], [1.55, 0.98, -2.0], [-2.1, 1.05, -0.9], [2.1, 1.1, -0.8], [-2.1, 1.15, 0.5], [2.1, 1.08, 0.6]];
const CANDLES: V3[] = [[-2.25, FLOOR_Y, -1.6], [-2.4, FLOOR_Y, -1.3], [2.3, FLOOR_Y, -1.5], [2.5, FLOOR_Y, 0.2], [-2.5, FLOOR_Y, 0.4], [-0.9, FLOOR_Y, -2.3], [1.0, FLOOR_Y, -2.32]];

/** Pergola (dusk): posts, beams, rafters and round paper lanterns with a halo sprite each. */
const Pergola = memo(function Pergola({ lanterns }: { lanterns: V3[] }) {
  const m = useMemo(() => ({
    wood: new THREE.MeshLambertMaterial({ color: '#3e2a1c' }),
    paper: new THREE.MeshBasicMaterial({ color: '#ffc27a' }),
    rib: new THREE.MeshBasicMaterial({ color: '#d98a3a' }),
    halo: new THREE.SpriteMaterial({ map: glowDot(), color: '#ffb35a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }),
    vine: new THREE.MeshLambertMaterial({ color: '#2f4a2c' }),
  }), []);
  const H = 2.15, X = 2.1, Z0 = -2.0, Z1 = 2.8;
  return (
    <group>
      {[[-X, Z0], [X, Z0], [-X, Z1], [X, Z1]].map(([x, z], i) => <mesh key={i} geometry={GEO.box} material={m.wood} position={[x!, (H + FLOOR_Y) / 2, z!]} scale={[0.1, H - FLOOR_Y, 0.1]} />)}
      {[-X, X].map((x) => <mesh key={x} geometry={GEO.box} material={m.wood} position={[x, H, (Z0 + Z1) / 2]} scale={[0.1, 0.12, Z1 - Z0 + 0.3]} />)}
      <mesh geometry={GEO.box} material={m.wood} position={[0, H, Z0]} scale={[2 * X + 0.3, 0.12, 0.1]} />
      {Array.from({ length: 7 }, (_, i) => Z0 + 0.3 + i * 0.7).map((z) => <mesh key={z} geometry={GEO.box} material={m.wood} position={[0, H + 0.1, z]} scale={[2 * X + 0.5, 0.08, 0.06]} />)}
      {lanterns.map((p, i) => (
        <group key={i} position={p}>
          <mesh geometry={GEO.cyl} material={m.wood} position={[0, (H - p[1]) / 2, 0]} scale={[0.004, H - p[1], 0.004]} />
          <mesh geometry={GEO.sphere} material={m.paper} scale={[0.16, 0.14, 0.16]} />
          <mesh geometry={GEO.cyl} material={m.rib} position={[0, 0.13, 0]} scale={[0.07, 0.03, 0.07]} />
          <mesh geometry={GEO.cyl} material={m.rib} position={[0, -0.13, 0]} scale={[0.07, 0.03, 0.07]} />
          <sprite material={m.halo} scale={[0.9, 0.9, 1]} />
        </group>
      ))}
    </group>
  );
});

/** Candle jars (dusk) on the terrace edge: glass + flickering flame sprite. */
function Candles({ at, flicker }: { at: V3[]; flicker: boolean }) {
  const m = useMemo(() => ({
    glass: new THREE.MeshLambertMaterial({ color: '#d8c8a8', transparent: true, opacity: 0.35, depthWrite: false }),
    wax: new THREE.MeshLambertMaterial({ color: '#f4ead2', emissive: '#6a4a20' }),
    flame: new THREE.SpriteMaterial({ map: glowDot(), color: '#ffcf7a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  }), []);
  const g = useRef<THREE.Group>(null);
  useFrame((st) => { if (!flicker || !g.current) return; const t = st.clock.elapsedTime; g.current.children.forEach((c, i) => { const s = c.children[2] as THREE.Sprite | undefined; if (s) s.scale.setScalar(0.34 + Math.sin(t * 9 + i * 2) * 0.03 + Math.sin(t * 23 + i) * 0.02); }); });
  return (
    <group ref={g}>
      {at.map((p, i) => (
        <group key={i} position={p}>
          <mesh geometry={GEO.cyl} material={m.glass} position={[0, 0.09, 0]} scale={[0.07, 0.18, 0.07]} />
          <mesh geometry={GEO.cyl} material={m.wax} position={[0, 0.05, 0]} scale={[0.05, 0.1, 0.05]} />
          <sprite material={m.flame} position={[0, 0.13, 0]} scale={[0.34, 0.34, 1]} />
        </group>
      ))}
    </group>
  );
}


const OakTable = memo(function OakTable() {
  const S = TABLE_SHAPES.dusk, X = S.hx + 0.04, Z = S.hz + 0.04;
  const m = useMemo(() => ({
    oak: lam({ color: '#ffffff', map: planksTexture('oak', '#74492c', '#3c2210', 6), emissive: '#180d06' }), edge: lam({ color: '#4a2c17' }),
    runner: lam({ color: '#ffffff', map: runnerTexture(), emissive: '#240c06' }), runnerEnd: lam({ color: '#a24a28', side: THREE.DoubleSide }),
  }), []);
  const rw = 0.6;
  return (
    <group>
      <mesh geometry={TG.box} material={[m.edge, m.edge, m.oak, m.edge, m.edge, m.edge]} position={[0, -0.034, 0]} scale={[2 * X, 0.06, 2 * Z]} />
      <mesh geometry={FLAT} material={m.runner} position={[0, 0, 0]} scale={[rw, 1, 2 * Z + 0.01]} />
      {[-1, 1].map((s) => <mesh key={s} geometry={TG.box} material={m.runnerEnd} position={[0, -0.09, s * (Z + 0.006)]} scale={[rw, 0.18, 0.004]} />)}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => <mesh key={i} geometry={TG.box} material={m.edge} position={[sx! * (X - 0.1), (FLOOR_Y - 0.064) / 2, sz! * (Z - 0.1)]} scale={[0.1, -FLOOR_Y - 0.064, 0.1]} />)}
      <mesh geometry={TG.box} material={m.edge} position={[0, -0.1, 0]} scale={[2 * X - 0.12, 0.07, 2 * Z - 0.12]} />
      <mesh geometry={FLAT} material={shadowMat()} position={[0, FLOOR_Y + 0.004, 0]} scale={[2 * X * 1.35, 1, 2 * Z * 1.35]} renderOrder={1} />
    </group>
  );
});

export default function Dusk(p: SceneProps) {
  return (
    <GardenBase scene="dusk" steam={1.1} {...p}>
      <hemisphereLight args={['#a6b0f0', '#4e3c58', 1.1]} />
      <directionalLight position={[0.4, 3.2, 1.2]} intensity={p.hi ? 1.15 : 1.5} color="#ffca88" />
      <directionalLight position={[1.5, 1.8, -4]} intensity={0.65} color="#9eb0ff" />
      {p.hi && <pointLight position={[0, 1.45, 0]} intensity={2.6} distance={4.8} decay={1.2} color="#ffb868" />}
      <Pergola lanterns={LANTERNS} />
      <Posts at={[[-6, -8.6], [6, -8.6]]} h={2.4} color="#3e2a1c" />
      <FairyLights strings={STRINGS} color="#ffc870" size={0.14} twinkle={p.hi} />
      <Candles at={CANDLES} flicker={p.hi} />
      <OakTable />
    </GardenBase>
  );
}
