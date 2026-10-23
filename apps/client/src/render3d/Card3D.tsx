// One real 3D card: two textured faces, a baked soft shadow and a glow for highlights. It eases towards its
// target place every frame (move, flip with a little hop, peek lift), so view changes never pop.
import { stagedHidden } from './actors';
import { memo, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { CardFace } from '@marlivo/engine';
import { faceTexture, backTexture, glowTexture, shadowTexture, outlineTexture, labelTexture } from './textures';
import type { Place3 } from './layout3d';

export const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); // lies flat, faces +y, texture top → -z
const PLANE_DOWN = PLANE.clone().rotateZ(Math.PI);                         // faces -y (the face side while face down)

const faceMats = new Map<string, THREE.MeshBasicMaterial>();
export function faceMat(f: CardFace, four: boolean) {
  const k = `${f.r}${f.s}${four}`;
  let m = faceMats.get(k);
  if (!m) { m = new THREE.MeshBasicMaterial({ map: faceTexture(f, four), alphaTest: 0.5, color: '#f7f1e6' }); faceMats.set(k, m); }
  return m;
}
export const HIT_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 });
let backM: THREE.MeshBasicMaterial | null = null;
export const backMat = () => (backM ??= new THREE.MeshBasicMaterial({ map: backTexture(), alphaTest: 0.5, color: '#f2e6da', side: THREE.DoubleSide }));
let shadowM: THREE.MeshBasicMaterial | null = null;
export const shadowMat = () => (shadowM ??= new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.7 }));
let outlineM: THREE.MeshBasicMaterial | null = null;
const outlineMat = () => (outlineM ??= new THREE.MeshBasicMaterial({ map: outlineTexture(), transparent: true, depthWrite: false }));
const labelMats = new Map<string, THREE.MeshBasicMaterial>();
const labelMat = (text: string, color: string, bg: string | null = null) => {
  const k = text + color + bg; let m = labelMats.get(k);
  if (!m) { m = new THREE.MeshBasicMaterial({ map: labelTexture(text, color, bg), transparent: true, depthWrite: false }); labelMats.set(k, m); }
  return m;
};

export type Glow = 'selectable' | 'selected' | 'hovered' | 'tentative' | 'wrong' | 'queen' | 'gold' | null;
export const GLOW_COLOR: Record<Exclude<Glow, null>, string> = { selectable: '#ffae42', selected: '#ffe066', hovered: '#5da9e9', tentative: '#7bd389', wrong: '#ff4a4a', queen: '#ffd700', gold: '#ffcc33' };

export interface Card3DProps {
  id: string;
  place: Place3;
  face: CardFace | null;
  up: boolean;
  four: boolean;
  glow?: Glow;
  empty?: boolean;
  hidden?: boolean;
  lift?: number;      // peek / queen lift (world units)
  tilt?: number;      // tilt towards the owner while lifted (radians)
  num?: number | null;
  ghost?: string | null;
  wrongMark?: boolean;
  onTap?(): void;
  onLong?(): void;
  onHover?(over: boolean): void;
}

const damp = (a: number, b: number, k: number) => a + (b - a) * k;
const angDamp = (a: number, b: number, k: number) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };

export const Card3D = memo(function Card3D(p: Card3DProps) {
  const g = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const st = useRef<{ x: number; y: number; z: number; yaw: number; flip: number; lift: number; tilt: number; init: boolean }>({ x: 0, y: 0, z: 0, yaw: 0, flip: 0, lift: 0, tilt: 0, init: false });
  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, color: '#ffffff', opacity: 0 }), []);
  const lp = useRef<{ t: ReturnType<typeof setTimeout> | null; fired: boolean }>({ t: null, fired: false });

  useFrame((state, dt) => {
    const s = st.current; const grp = g.current; const inn = inner.current; if (!grp || !inn) return;
    grp.visible = !stagedHidden.has(p.id); // a character's hand is carrying this card right now
    const tp = p.place.p; const wantFlip = p.up ? Math.PI : 0;
    if (!s.init) { s.x = tp[0]; s.y = tp[1]; s.z = tp[2]; s.yaw = p.place.yaw; s.flip = wantFlip; s.init = true; }
    const k = 1 - Math.exp(-dt * 11), kf = 1 - Math.exp(-dt * 9);
    s.x = damp(s.x, tp[0], k); s.y = damp(s.y, tp[1], k); s.z = damp(s.z, tp[2], k);
    s.yaw = angDamp(s.yaw, p.place.yaw, k);
    s.flip = damp(s.flip, wantFlip, kf);
    s.lift = damp(s.lift, p.lift ?? 0, kf); s.tilt = damp(s.tilt, p.tilt ?? 0, kf);
    const hop = Math.sin(Math.min(Math.PI, Math.max(0, s.flip))) * 0.07; // a little hop while turning over
    grp.position.set(s.x, s.y + s.lift + hop, s.z);
    grp.rotation.set(0, s.yaw, 0);
    inn.rotation.set(s.tilt, 0, s.flip);
    inn.scale.set(p.place.w, 1, p.place.h);
    const gm = glowRef.current;
    if (gm) {
      const on = !!p.glow && !p.hidden;
      const pulse = p.glow === 'selectable' ? 0.55 + 0.35 * Math.sin(state.clock.elapsedTime * 5) : p.glow === 'queen' || p.glow === 'gold' ? 0.8 + 0.2 * Math.sin(state.clock.elapsedTime * 8) : 0.95;
      glowMat.opacity = damp(glowMat.opacity, on ? pulse : 0, 0.25);
      if (p.glow) glowMat.color.set(GLOW_COLOR[p.glow]);
      gm.visible = glowMat.opacity > 0.02;
    }
  });

  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!p.onLong) return;
    lp.current.fired = false;
    lp.current.t = setTimeout(() => { lp.current.fired = true; p.onLong?.(); }, 500);
  };
  const up = () => { if (lp.current.t) clearTimeout(lp.current.t); lp.current.t = null; };
  const click = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (lp.current.fired) { lp.current.fired = false; return; } p.onTap?.(); };
  const showCard = !p.hidden && !p.empty;
  const sideToOwner = p.place.h / 2 + 0.022;
  return (
    <group ref={g} name={'slot:' + p.id}>
      {/* the hit area covers the whole slot, so empty slots and fast taps still register */}
      <mesh geometry={PLANE} scale={[p.place.w * 1.06, 1, p.place.h * 1.06]} position={[0, 0.004, 0]} material={HIT_MAT}
        onClick={click} onPointerDown={down} onPointerUp={up} onPointerOut={() => { up(); p.onHover?.(false); }} onPointerOver={(e) => { e.stopPropagation(); p.onHover?.(true); }} />
      <mesh ref={glowRef} geometry={PLANE} material={glowMat} scale={[p.place.w * 1.55, 1, p.place.h * 1.42]} position={[0, 0.0003, 0]} renderOrder={1} />
      {p.empty && !p.hidden && <mesh geometry={PLANE} material={outlineMat()} scale={[p.place.w, 1, p.place.h]} position={[0, 0.0004, 0]} renderOrder={1} />}
      {showCard && <mesh geometry={PLANE} material={shadowMat()} scale={[p.place.w * 1.3, 1, p.place.h * 1.25]} position={[0.004, 0.0002, 0.006]} renderOrder={1} />}
      <group ref={inner} visible={showCard}>
        <mesh geometry={PLANE} material={backMat()} position={[0, 0.0009, 0]} />
        {p.face && <mesh geometry={PLANE_DOWN} material={faceMat(p.face, p.four)} position={[0, -0.0009, 0]} />}
        {p.ghost && !p.up && <mesh geometry={PLANE} material={labelMat(p.ghost, '#ffd9a0')} scale={[0.6, 1, 0.43]} position={[0, 0.0015, 0]} renderOrder={2} />}
        {p.wrongMark && !p.up && <mesh geometry={PLANE} material={labelMat('✕', '#ff5a5a')} scale={[0.8, 1, 0.57]} position={[0, 0.0016, 0]} renderOrder={2} />}
      </group>
      {p.num != null && <mesh geometry={PLANE} material={labelMat(String(p.num), '#f6ebd9', 'rgba(23,11,6,.55)')} scale={[0.045, 1, 0.045]} position={[0, 0.0006, sideToOwner]} renderOrder={1} />}
    </group>
  );
});
