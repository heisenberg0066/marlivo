// Scene 1 · Golden-hour garden (sketch book v8 p02): warm low sun, strings of fairy lights, lavender and climbing
// roses, a round rustic wooden table with a cream linen cloth. Its own lazy chunk (see scenes/index.ts).
import { memo, useMemo } from 'react';
import * as THREE from 'three';
import { GardenBase, type SceneProps } from './base';
import { lam, shadowMat, FLAT, TG } from './props';
import { TABLE_R, FLOOR_Y, TABLE_SHAPES } from '../sceneConfig';
import { FairyLights, Posts } from './garden';
import { linenTexture, planksTexture } from './stex';

type V3 = [number, number, number];
/** post tops: terrace posts (PT) and the posts along the far hedge (HT) */
const PT = FLOOR_Y + 1.8, HT = FLOOR_Y + 1.65;
const STRINGS: { a: V3; b: V3; sag: number }[] = [
    { a: [-2.6, PT, -2.4], b: [2.6, PT, -2.4], sag: 0.34 },
    { a: [-2.6, PT, -2.4], b: [-2.8, PT, 1.4], sag: 0.3 },
    { a: [2.6, PT, -2.4], b: [2.8, PT, 1.4], sag: 0.3 },
    { a: [-5.8, HT, -8.6], b: [-2.0, HT, -8.6], sag: 0.28 },
    { a: [-2.0, HT, -8.6], b: [2.0, HT, -8.6], sag: 0.28 },
    { a: [2.0, HT, -8.6], b: [5.8, HT, -8.6], sag: 0.28 },
    { a: [-5.8, HT, -8.6], b: [-2.6, PT, -2.4], sag: 0.3 },
    { a: [5.8, HT, -8.6], b: [2.6, PT, -2.4], sag: 0.3 },
    { a: [-2.6, PT, -2.4], b: [2.0, HT, -8.6], sag: 0.4 },
    { a: [2.6, PT, -2.4], b: [-2.0, HT, -8.6], sag: 0.4 },
  ];

const lathe = (pts: [number, number][], seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
/** chunky turned pedestal (rustic round table) */
const PEDESTAL = lathe([[0, FLOOR_Y], [0.42, FLOOR_Y], [0.42, FLOOR_Y + 0.04], [0.3, FLOOR_Y + 0.07], [0.12, FLOOR_Y + 0.12], [0.1, FLOOR_Y + 0.2], [0.15, FLOOR_Y + 0.27], [0.15, FLOOR_Y + 0.31], [0.09, FLOOR_Y + 0.38], [0.085, -0.3], [0.13, -0.22], [0.13, -0.16], [0.1, -0.1], [0.16, -0.065], [0, -0.065]], 18);

/** Scalloped, softly folded linen drape around a round table edge. */
function drapeGeometry(r0: number, drop: number, folds = 22) {
  const seg = 120, rows = 6, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg, a = u * Math.PI * 2;
      const fold = Math.sin(a * folds) * 0.012 * v + Math.sin(a * folds * 0.5 + 1.3) * 0.006 * v;
      const r = r0 + 0.006 + v * v * 0.035 + fold;
      const scallop = Math.abs(Math.sin(a * folds)) * 0.018;
      const y = -v * (drop - (v === 1 ? scallop : 0) * 1);
      pos.push(Math.sin(a) * r, y, Math.cos(a) * r); uv.push(u * 12, v);
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}


const RoundRusticTable = memo(function RoundRusticTable() {
  const rim = TABLE_SHAPES.golden.rim, R = TABLE_R + rim;
  const m = useMemo(() => {
    const top = planksTexture('rustic', '#8a5a34', '#4a2c16', 6);
    return {
      wood: lam({ color: '#ffffff', map: top }), edge: lam({ color: '#7a4c2a' }), ped: lam({ color: '#6e4426' }),
      linen: lam({ color: '#ffffff', map: linenTexture() }), drape: lam({ color: '#e9dbbd', side: THREE.DoubleSide }),
    };
  }, []);
  const drape = useMemo(() => drapeGeometry(R + 0.005, 0.15), [R]);
  return (
    <group>
      <mesh geometry={TG.cyl} material={[m.edge, m.wood, m.edge]} position={[0, -0.034, 0]} scale={[R, 0.06, R]} />
      <mesh geometry={TG.disc} material={m.linen} position={[0, 0, 0]} scale={[R + 0.012, 1, R + 0.012]} />
      <mesh geometry={drape} material={m.drape} />
      <mesh geometry={PEDESTAL} material={m.ped} />
      <mesh geometry={TG.disc} material={shadowMat()} position={[0, FLOOR_Y + 0.004, 0]} scale={[R * 1.35, 1, R * 1.35]} renderOrder={1} />
    </group>
  );
});

export default function Golden(p: SceneProps) {
  return (
    <GardenBase scene="golden" {...p}>
      <hemisphereLight args={['#ffe2b6', '#5a4a2a', 1.15]} />
      <directionalLight position={[-3, 2.2, -3.5]} intensity={1.25} color="#ffc27e" />
      <directionalLight position={[1, 3, 3]} intensity={0.6} color="#fff0d8" />
      <Posts at={[[-2.6, -2.4], [2.6, -2.4], [-2.8, 1.4], [2.8, 1.4], [-5.8, -8.6], [-2.0, -8.6], [2.0, -8.6], [5.8, -8.6]]} h={1.8} />
      <FairyLights strings={STRINGS} twinkle={p.hi} />
      <RoundRusticTable />
    </GardenBase>
  );
}
