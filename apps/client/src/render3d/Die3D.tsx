// A real 3D die for the start roll (§4.5): tumbles while rolling, lands showing the value on top, glows for the
// winner and shakes on a tie. Values come only from the view / the director's overrides, never decided here.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlayerView } from '@marlivo/engine';
import type { Overrides } from '../render/Table';
import { pipTexture, glowTexture } from './textures';
import type { V3 } from './layout3d';
import { PLANE } from './Card3D';

// BoxGeometry face order: +x, -x, +y, -y, +z, -z
const FACES = [2, 5, 1, 6, 3, 4];
const TOP: Record<number, [number, number, number]> = { 1: [0, 0, 0], 6: [Math.PI, 0, 0], 2: [0, 0, Math.PI / 2], 5: [0, 0, -Math.PI / 2], 3: [-Math.PI / 2, 0, 0], 4: [Math.PI / 2, 0, 0] };
let mats: THREE.Material[] | null = null;
const dieMats = () => (mats ??= FACES.map((n) => new THREE.MeshLambertMaterial({ map: pipTexture(n) })));
const S = 0.075;

export function Die3D({ seat, view, ov, at, yaw, big }: { seat: number; view: PlayerView; ov: Overrides; at: V3; yaw: number; big: boolean }) {
  const roll = view.roll;
  const last = roll?.history.length ? roll.history[roll.history.length - 1] : undefined;
  const value = ov.dice?.values?.[seat] ?? (view.phase === 'START_ROLL' ? undefined : last?.[seat]);
  const rolling = !!ov.dice?.rolling;
  const winner = ov.dice?.winner === seat;
  const tied = !!ov.dice?.tied?.includes(seat);
  const isRoller = !!roll?.rollers.includes(seat);
  const out = !isRoller && view.phase === 'START_ROLL' && !value;
  const g = useRef<THREE.Group>(null);
  const cube = useRef<THREE.Mesh>(null);
  const q = useRef(new THREE.Quaternion());
  const glowM = useMemo(() => new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, color: '#ffd700', opacity: 0 }), []);
  useFrame((st, dt) => {
    const c = cube.current; const gr = g.current; if (!c || !gr) return;
    const t = st.clock.elapsedTime;
    if (rolling || (!value && !out && roll?.rolled.includes(seat) === false)) {
      // tumbling (rolling) or gently wobbling while waiting to be rolled
      const sp = rolling ? 14 : 0.8;
      c.rotation.x += dt * sp * 1.1; c.rotation.y += dt * sp * 0.7; c.rotation.z += dt * sp * 0.9;
      c.position.y = rolling ? S / 2 + Math.abs(Math.sin(t * 12)) * 0.07 : S / 2 + Math.sin(t * 2) * 0.006;
    } else {
      const e = TOP[value ?? 1]!;
      q.current.setFromEuler(new THREE.Euler(e[0], e[1], e[2]));
      c.quaternion.slerp(q.current, 1 - Math.exp(-dt * 10));
      c.position.y = S / 2 + (tied ? Math.abs(Math.sin(t * 20)) * 0.01 : 0);
    }
    gr.position.x = at[0] + (tied ? Math.sin(t * 30) * 0.004 : 0);
    glowM.opacity += ((winner ? 0.9 : 0) - glowM.opacity) * 0.15;
  });
  const s = big ? 1.25 : 1;
  return (
    <group ref={g} position={[at[0], 0, at[2]]} rotation={[0, yaw, 0]} scale={s}>
      <mesh geometry={PLANE} material={glowM} scale={[S * 3.4, 1, S * 3.4]} position={[0, 0.0005, 0]} renderOrder={1} />
      <mesh ref={cube} material={dieMats()} position={[0, S / 2, 0]} visible={!out}>
        <boxGeometry args={[S, S, S]} />
      </mesh>
    </group>
  );
}
