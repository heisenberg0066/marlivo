// Scene 2 · Sunny afternoon picnic (sketch book v8 p03): bright sky, a big shady tree, daisies in the grass, a
// wooden picnic table with a blue-and-white gingham cloth and plank benches. Its own lazy chunk.
import { memo, useMemo } from 'react';
import * as THREE from 'three';
import { GardenBase, type SceneProps } from './base';
import { lam, shadowMat, FLAT, TG } from './props';
import { TABLE_R, FLOOR_Y, TABLE_SHAPES } from '../sceneConfig';
import { ginghamTexture, planksTexture } from './stex';

const PicnicTable = memo(function PicnicTable() {
  const S = TABLE_SHAPES.picnic, X = S.hx + 0.05, Z = S.hz + 0.05;
  const m = useMemo(() => ({
    wood: lam({ color: '#ffffff', map: planksTexture('picnic', '#9a6438', '#5a3418', 7) }), dark: lam({ color: '#7a4a28' }),
    cloth: lam({ color: '#ffffff', map: ginghamTexture(1) }), drape: lam({ color: '#ffffff', map: ginghamTexture(1), side: THREE.DoubleSide }),
  }), []);
  // the cloth covers the middle band (from me to the far side) and hangs over both long edges
  const cw = 1.3;
  useMemo(() => { m.cloth.map!.repeat.set(cw / 0.11, (2 * Z + 0.02) / 0.11); const d = m.cloth.map!.clone(); d.repeat.set(cw / 0.11, 0.14 / 0.11); d.needsUpdate = true; m.drape.map = d; }, [m, Z]);
  return (
    <group>
      <mesh geometry={TG.box} material={m.wood} position={[0, -0.03, 0]} scale={[2 * X, 0.052, 2 * Z]} />
      <mesh geometry={FLAT} material={m.cloth} position={[0, 0, 0]} scale={[cw, 1, 2 * Z + 0.02]} />
      {[-1, 1].map((s) => <mesh key={s} geometry={TG.box} material={m.drape} position={[0, -0.07, s * (Z + 0.012)]} scale={[cw, 0.14, 0.004]} rotation={[s * 0.06, 0, 0]} />)}
      {/* A-frame legs + cross beam */}
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * (X - 0.2), 0, 0]}>
          {[-1, 1].map((sz) => <mesh key={sz} geometry={TG.box} material={m.dark} position={[0, (FLOOR_Y - 0.06) / 2, sz * 0.32]} rotation={[sz * -0.42, 0, 0]} scale={[0.07, 0.8, 0.09]} />)}
          <mesh geometry={TG.box} material={m.dark} position={[0, -0.1, 0]} scale={[0.07, 0.06, 2 * Z - 0.1]} />
        </group>
      ))}
      <mesh geometry={TG.box} material={m.dark} position={[0, -0.42, 0]} scale={[2 * X - 0.4, 0.06, 0.08]} />
      <mesh geometry={FLAT} material={shadowMat()} position={[0, FLOOR_Y + 0.004, 0]} scale={[2 * X * 1.3, 1, 2 * Z * 1.4]} renderOrder={1} />
    </group>
  );
});

export default function Picnic(p: SceneProps) {
  return (
    <GardenBase scene="picnic" steam={0.5} {...p}>
      <hemisphereLight args={['#eaf5ff', '#6f8f44', 1.25]} />
      <directionalLight position={[2.5, 4, 2]} intensity={1.25} color="#fff6e2" />
      <directionalLight position={[-2, 2, -3]} intensity={0.35} color="#dfefff" />
      <PicnicTable />
    </GardenBase>
  );
}
