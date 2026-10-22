// Shared procedural motion for the 3D figures: idle breathing, think, celebrate (happy), sad, surprised, away.
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import type { Mood } from '../render/characters';

export interface Rig { root: THREE.Group | null; head: THREE.Group | null; armL: THREE.Group | null; armR: THREE.Group | null; eyes: THREE.Group | null }
export const POSE: Record<Mood, { y: number; headX: number; headZ: number; armLX: number; armLZ: number; armRX: number; armRZ: number; bounce: number; sway: number }> = {
  idle: { y: 0, headX: 0, headZ: 0, armLX: -0.9, armLZ: 0.15, armRX: -0.9, armRZ: -0.15, bounce: 0, sway: 0.04 },
  think: { y: 0, headX: 0.12, headZ: 0.2, armLX: -0.9, armLZ: 0.15, armRX: -2.3, armRZ: 0.45, bounce: 0, sway: 0.02 },
  happy: { y: 0.02, headX: -0.15, headZ: 0, armLX: -0.3, armLZ: 2.5, armRX: -0.3, armRZ: -2.5, bounce: 0.06, sway: 0.08 },
  sad: { y: -0.04, headX: 0.38, headZ: 0, armLX: -0.2, armLZ: 0.1, armRX: -0.2, armRZ: -0.1, bounce: 0, sway: 0.01 },
  surprised: { y: 0.03, headX: -0.2, headZ: 0, armLX: -0.6, armLZ: 1.2, armRX: -0.6, armRZ: -1.2, bounce: 0.02, sway: 0 },
  away: { y: -0.05, headX: 0.55, headZ: 0.1, armLX: -1.2, armLZ: 0.3, armRX: -1.2, armRZ: -0.3, bounce: 0, sway: 0.01 },
};

/** opts.baseY: resting height of the root; opts.armScale: how far the arms follow the pose (1 = fully). */
export function useRigMotion(rig: React.MutableRefObject<Rig>, mood: Mood, seed: number, opts: { baseY?: number; armScale?: number } = {}) {
  const base = opts.baseY ?? 0, ak = opts.armScale ?? 1;
  const cur = useRef({ ...POSE.idle });
  useFrame((st, dt) => {
    const t = st.clock.elapsedTime + seed * 1.7;
    const want = POSE[mood] ?? POSE.idle;
    const k = 1 - Math.exp(-dt * 6);
    const c = cur.current as Record<string, number>;
    for (const key of Object.keys(want) as (keyof typeof want)[]) c[key] = c[key]! + ((want[key] as number) - c[key]!) * k;
    const r = rig.current;
    if (r.root) {
      r.root.position.y = base + c.y! + Math.sin(t * 1.6) * 0.006 + Math.abs(Math.sin(t * 7)) * c.bounce!;
      r.root.rotation.z = Math.sin(t * 0.8) * c.sway! * 0.5;
    }
    if (r.head) { r.head.rotation.x = c.headX!; r.head.rotation.z = c.headZ! + Math.sin(t * 0.7) * c.sway!; }
    const wave = mood === 'happy' ? Math.sin(t * 9) * 0.35 : 0;
    if (r.armL) { r.armL.rotation.x = c.armLX! * ak; r.armL.rotation.z = (c.armLZ! + wave) * (mood === 'happy' ? 1 : ak); }
    if (r.armR) { r.armR.rotation.x = (c.armRX! + (mood === 'think' ? Math.sin(t * 2) * 0.05 : 0)) * (mood === 'think' ? 1 : ak); r.armR.rotation.z = (c.armRZ! - wave) * (mood === 'happy' || mood === 'think' ? 1 : ak); }
    if (r.eyes) { const blink = (t % 4.3) < 0.12 || mood === 'away' ? 0.15 : mood === 'happy' ? 0.55 : 1; r.eyes.scale.y += (blink - r.eyes.scale.y) * 0.5; }
  });
}

