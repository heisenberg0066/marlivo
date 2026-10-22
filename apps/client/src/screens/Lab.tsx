// Figure lab (dev / tests only, not linked from the UI): #/lab?id=tango&mood=idle&pose=stand&yaw=0&bg=1e1e1e
// Renders one 3D figure on a plain background so it can be compared with its reference art.
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { Figure } from '../render3d/Figures';
import type { Mood } from '../render/characters';

export default function Lab({ q }: { q: URLSearchParams }) {
  const id = q.get('id') ?? 'tango';
  const mood = (q.get('mood') ?? 'idle') as Mood;
  const pose = (q.get('pose') ?? 'stand') as 'sit' | 'stand';
  const yaw = Number(q.get('yaw') ?? 0);
  const bg = '#' + (q.get('bg') ?? '1c1c1c');
  const zoom = Number(q.get('zoom') ?? 1);
  const cy = Number(q.get('cy') ?? (pose === 'stand' ? 0.1 : 0.2));
  return (
    <div style={{ position: 'fixed', inset: 0, background: bg }}>
      <Canvas dpr={1.5} camera={{ fov: 30 / zoom, position: [0, cy + 0.15, 3.2], near: 0.05, far: 20 }} onCreated={({ camera }) => camera.lookAt(0, cy, 0)} gl={{ antialias: true }}>
        <color attach="background" args={[bg]} />
        <hemisphereLight args={['#fff3e0', '#3a2a20', 0.9]} />
        <directionalLight position={[1.5, 2.5, 2.5]} intensity={1.6} color="#fff1dc" />
        <directionalLight position={[-2, 1, 1]} intensity={0.45} color="#c8d8ff" />
        <pointLight position={[0, 1.2, 1.2]} intensity={0.6} color="#ffd8a8" />
        <group rotation={[0, yaw, 0]}><Suspense fallback={null}><Figure id={id} mood={mood} pose={pose} /></Suspense></group>
      </Canvas>
    </div>
  );
}
