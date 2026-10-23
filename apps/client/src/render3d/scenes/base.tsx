// Shared base of the three outdoor scenes (one lazy chunk, loaded once whichever scene comes first): fog + sky,
// lawn and terrace, the badminton court with the two Orange guys, hedges/trees/flowers, the tea service, sugar and
// the chocolate bar. Each scene module (golden.tsx, picnic.tsx, dusk.tsx) adds its own lights, table and dressing.
// Lights: one hemisphere + one or two directional lights (no shadow maps); High adds one warm point light at
// dusk. Fairy lights / lanterns / candles are emissive sprites, never real lights.
import { memo, useEffect, useMemo, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Layout3 } from '../layout3d';
import { propLayout } from './propLayout';
import { TeaCup, SugarCubes, TeaClock, Steam, ChocolateBar, type SceneKey } from './props';
import { SkyDome, Ground, Court, Greenery, PAL } from './garden';
import { Badminton } from './badminton';
import { FLOOR_Y } from '../sceneConfig';

type V3 = [number, number, number];
export interface SceneProps { L: Layout3; hi: boolean; level: 'high' | 'low'; portrait: boolean }
/** where the court sits (world), shared by the court and the players */
export const COURT_AT: Record<SceneKey, { p: V3; yaw: number }> = {
  golden: { p: [0.1, FLOOR_Y, -5.4], yaw: 0.32 },
  picnic: { p: [0.3, FLOOR_Y, -5.2], yaw: 0.22 },
  dusk: { p: [0.5, FLOOR_Y, -5.6], yaw: 0.36 },
};

/** Draw calls / triangles of the whole frame (all passes) on window.__mlScene, for the perf checks. */
function SceneStats() {
  const gl = useThree((s) => s.gl);
  useEffect(() => { gl.info.autoReset = false; return () => { gl.info.autoReset = true; }; }, [gl]);
  useFrame(() => {
    const i = gl.info.render;
    (window as unknown as { __mlScene?: object }).__mlScene = { calls: i.calls, tris: i.triangles, geos: gl.info.memory.geometries, tex: gl.info.memory.textures };
    gl.info.reset();
  }, -100);
  return null;
}

function Env({ scene }: { scene: SceneKey }) {
  const { scene: s3 } = useThree();
  useEffect(() => {
    s3.fog = new THREE.Fog(PAL[scene].fog, scene === 'dusk' ? 9 : 8, scene === 'dusk' ? 26 : 24); s3.background = new THREE.Color(PAL[scene].clear);
    return () => { s3.fog = null; s3.background = null; };
  }, [scene, s3]);
  return null;
}

export const GardenBase = memo(function GardenBase({ scene, L, hi, level, portrait, steam = 1, children }: SceneProps & { scene: SceneKey; steam?: number; children?: ReactNode }) {
  const props = useMemo(() => propLayout(L), [L]);
  const seats = useMemo(() => Object.keys(props.tea).map(Number), [props]);
  // phone portrait looks down more steeply: bring the court in so the players fill the top band (p07)
  const c0 = COURT_AT[scene], court = portrait ? { p: [c0.p[0], c0.p[1], c0.p[2] + 1.1] as V3, yaw: c0.yaw } : c0;
  return (
    <group>
      <Env scene={scene} />
      <SceneStats />
      <SkyDome scene={scene} />
      <Ground scene={scene} />
      <group position={[court.p[0], 0, court.p[2]]} rotation={[0, court.yaw, 0]}><Court scene={scene} flood={scene === 'dusk'} /></group>
      <Badminton at={court.p} yaw={court.yaw} level={level} />
      <Greenery scene={scene} lo={!hi} />
      {children}
      <TeaClock seats={seats} />
      {seats.map((s) => <TeaCup key={s} seat={s} at={props.tea[s]!.p} yaw={props.tea[s]!.yaw} hi={hi} />)}
      <SugarCubes props={props} />
      {hi && <Steam props={props} strength={steam} />}
      {props.choco && <ChocolateBar at={props.choco.p} yaw={props.choco.yaw} />}
    </group>
  );
});
