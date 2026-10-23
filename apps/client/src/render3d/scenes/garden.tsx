// Garden dressing shared by the three outdoor scenes: sky dome, lawn, flagstone terrace with a low stone edge,
// the badminton court with its net, hedges, trees, lavender, roses, daisies, pots, fairy lights (emissive sprites,
// one draw call per string set, no real lights), paper lanterns on a pergola, candle jars and court floodlights.
// Everything repeated is ONE InstancedMesh (hedge blobs, lavender spikes, rose heads, stones, daisies), materials
// are Lambert/Basic and the light is baked into vertex/instance colours and canvas textures.
import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FLOOR_Y } from '../sceneConfig';
import { grassTexture, paversTexture, courtTexture, skyTexture, glowDot, leafTexture } from './stex';
import { shadowMat, type SceneKey } from './props';

type V3 = [number, number, number];
export interface Inst { p: V3; s: number | V3; r?: V3; c?: string }
function rng(seed: number) { let s = seed % 2147483647 || 1; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }

/** One InstancedMesh for a list of transforms (+ optional per-instance colour). */
export function Instances({ geo, mat, items }: { geo: THREE.BufferGeometry; mat: THREE.Material; items: Inst[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current; if (!m) return;
    const o = new THREE.Object3D(), col = new THREE.Color();
    items.forEach((it, i) => {
      o.position.set(...it.p); const s = it.s; if (typeof s === 'number') o.scale.setScalar(s); else o.scale.set(...s);
      o.rotation.set(...(it.r ?? [0, 0, 0])); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
      if (it.c) m.setColorAt(i, col.set(it.c));
    });
    m.count = items.length; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[geo, mat, Math.max(1, items.length)]} />;
}

const GEO = {
  blob: new THREE.IcosahedronGeometry(1, 1),
  blobLo: new THREE.IcosahedronGeometry(1, 0),
  cone: new THREE.ConeGeometry(1, 1, 5).translate(0, 0.5, 0),
  sphere: new THREE.SphereGeometry(1, 8, 6),
  disc: new THREE.CircleGeometry(1, 8).rotateX(-Math.PI / 2),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  plane: new THREE.PlaneGeometry(1, 1),
};

/** palette per scene (light is baked into these) */
export const PAL = {
  golden: { hedge: ['#769440', '#86a64a', '#688436', '#94b050'], fog: '#f2cf98', clear: '#f4d4a0', lav: ['#9b84d8', '#8a72c8', '#b09ae6'], rose: ['#f8afc0', '#f07890', '#fad0b8', '#e85870'], trunk: '#6e4c30', canopy: ['#789844', '#88a84e', '#668638'] },
  picnic: { hedge: ['#589e42', '#68b04c', '#4c8e38', '#78be56'], fog: '#d6ecfa', clear: '#8ec5f2', lav: ['#9a86d6', '#8a74c8', '#b09ae0'], rose: ['#ffffff', '#fff6d0', '#f6a8c0', '#ffffff'], trunk: '#785434', canopy: ['#64a844', '#74b850', '#549638'] },
  dusk: { hedge: ['#3c5a48', '#486854', '#345040', '#52745e'], fog: '#383668', clear: '#2c2e62', lav: ['#8474c4', '#7464b4', '#9684d4'], rose: ['#e08098', '#c86078', '#e8b0a0', '#c05068'], trunk: '#463428', canopy: ['#385444', '#446250', '#2e4838'] },
} as const;

export const SkyDome = memo(function SkyDome({ scene }: { scene: SceneKey }) {
  const m = useMemo(() => new THREE.MeshBasicMaterial({ map: skyTexture(scene), side: THREE.BackSide, fog: false }), [scene]);
  // Backdrop cylinder right behind the garden hedge (r = 8.95) covering y = -2.4..+1.2 so both laptop and phone
  // seat-view cameras see the sky gradient, clouds and stars above the hedge.
  const g = useMemo(() => new THREE.CylinderGeometry(8.95, 8.95, 3.6, 40, 1, true), []);
  return <mesh geometry={g} material={m} position={[0, -0.6, 0]} />;
});

export const Ground = memo(function Ground({ scene }: { scene: SceneKey }) {
  const m = useMemo(() => ({
    grass: new THREE.MeshLambertMaterial({ map: grassTexture(scene) }),
    pav: scene !== 'picnic' ? new THREE.MeshLambertMaterial({ map: paversTexture(scene === 'dusk' ? 'dusk' : 'golden') }) : null,
    stone: new THREE.MeshLambertMaterial({ color: '#ffffff' }),
  }), [scene]);
  const stones = useMemo(() => {
    const r = rng(5), out: Inst[] = [];
    const cols = scene === 'dusk' ? ['#6a6258', '#5e574e', '#746a5e'] : ['#b9ab92', '#a89a82', '#c4b69c'];
    for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; const R = 2.42; out.push({ p: [Math.sin(a) * R, FLOOR_Y + 0.04, Math.cos(a) * R], s: [0.2 + r() * 0.04, 0.09 + r() * 0.03, 0.13], r: [0, a + (r() - 0.5) * 0.1, 0], c: cols[i % 3] }); }
    return out;
  }, [scene]);
  return (
    <group>
      <mesh geometry={GEO.disc} material={m.grass} position={[0, FLOOR_Y - 0.003, 0]} scale={[8.75, 1, 8.75]} />
      {m.pav && <mesh material={m.pav} position={[0, FLOOR_Y + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[2.38, 48]} /></mesh>}
      {m.pav && <Instances geo={GEO.box} mat={m.stone} items={stones} />}
    </group>
  );
});

/** Net texture: a square mesh grid with alpha. */
let netTex: THREE.Texture | null = null;
function netTexture() {
  if (netTex) return netTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(245,245,240,0.85)'; g.lineWidth = 2; for (let i = 0; i <= 64; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.moveTo(0, i); g.lineTo(64, i); g.stroke(); }
  netTex = new THREE.CanvasTexture(c); netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping; return netTex;
}

/** Court geometry (shared with the badminton loop). Long axis = local x, the net runs along local z at x = 0. */
export const COURT = { len: 4.6, wid: 2.1, netH: 0.62, postH: 0.7 };
export const Court = memo(function Court({ scene, flood }: { scene: SceneKey; flood: boolean }) {
  const m = useMemo(() => {
    const nt = netTexture().clone(); nt.repeat.set(COURT.wid * 14, 0.4 * 14); nt.needsUpdate = true;
    return {
      court: new THREE.MeshLambertMaterial({ map: courtTexture(scene) }),
      net: new THREE.MeshBasicMaterial({ map: nt, transparent: true, side: THREE.DoubleSide, depthWrite: false, color: scene === 'dusk' ? '#e8e8f0' : '#ffffff' }),
      tape: new THREE.MeshLambertMaterial({ color: '#fbfbf6', emissive: scene === 'dusk' ? '#444444' : '#000000' }),
      post: new THREE.MeshLambertMaterial({ color: '#9aa0a6' }),
      pool: new THREE.MeshBasicMaterial({ map: glowDot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#7a7050' }),
      lamp: new THREE.MeshBasicMaterial({ color: '#fffbe8' }),
      halo: new THREE.SpriteMaterial({ map: glowDot(), color: '#fff3c8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    };
  }, [scene]);
  const W = COURT.wid, Lc = COURT.len;
  return (
    <group>
      <mesh geometry={GEO.plane} material={m.court} rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y + 0.002, 0]} scale={[Lc + 0.25, W + 0.25, 1]} />
      {[-1, 1].map((s) => <mesh key={s} geometry={GEO.cyl} material={m.post} position={[0, FLOOR_Y + COURT.postH / 2, s * (W / 2 + 0.06)]} scale={[0.018, COURT.postH, 0.018]} />)}
      <mesh geometry={GEO.plane} material={m.net} position={[0, FLOOR_Y + COURT.netH - 0.2, 0]} rotation={[0, Math.PI / 2, 0]} scale={[W + 0.1, 0.4, 1]} />
      <mesh geometry={GEO.box} material={m.tape} position={[0, FLOOR_Y + COURT.netH, 0]} scale={[0.008, 0.025, W + 0.12]} />
      {flood && [[-1, -1], [1, 1]].map(([sx, sz], i) => (
        <group key={i} position={[sx! * (Lc / 2 - 0.3), FLOOR_Y, sz! * (W / 2 + 0.45)]}>
          <mesh geometry={GEO.cyl} material={m.post} position={[0, 1.3, 0]} scale={[0.03, 2.6, 0.03]} />
          <mesh geometry={GEO.box} material={m.lamp} position={[0, 2.6, -sz! * 0.08]} scale={[0.12, 0.08, 0.18]} />
          <sprite material={m.halo} position={[0, 2.56, -sz! * 0.12]} scale={[1.1, 1.1, 1]} />
        </group>
      ))}
      {flood && <mesh geometry={GEO.disc} material={m.pool} position={[0, FLOOR_Y + 0.006, 0]} scale={[Lc * 0.75, 1, W * 1.3]} renderOrder={2} />}
    </group>
  );
});

/** Hedge walls + trees + flower beds behind and around the terrace. `lo` halves the counts. */
export const Greenery = memo(function Greenery({ scene, lo }: { scene: SceneKey; lo: boolean }) {
  const P = PAL[scene];
  const mats = useMemo(() => ({
    leaf: new THREE.MeshLambertMaterial({ color: '#ffffff', map: leafTexture() }),
    plain: new THREE.MeshLambertMaterial({ color: '#ffffff' }),
    flower: new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: scene === 'dusk' ? '#000000' : '#1a1010' }),
    trunk: new THREE.MeshLambertMaterial({ color: P.trunk }),
    pot: new THREE.MeshLambertMaterial({ color: scene === 'dusk' ? '#8a4a30' : '#c46a3e' }),
  }), [scene]);
  const data = useMemo(() => {
    const r = rng(scene === 'golden' ? 101 : scene === 'picnic' ? 202 : 303);
    const hedge: Inst[] = [], lav: Inst[] = [], tuft: Inst[] = [], rose: Inst[] = [], canopy: Inst[] = [], trunks: Inst[] = [], daisy: Inst[] = [], pots: Inst[] = [];
    const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)]!;
    const step = lo ? 0.9 : 0.6;
    // hedge wall: behind the court and down both sides
    const wall = (x0: number, z0: number, x1: number, z1: number, h: number) => {
      const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / step);
      for (let i = 0; i <= n; i++) {
        const u = i / n, x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u;
        for (let k = 0; k < (lo ? 2 : 3); k++) { const s = 0.42 + r() * 0.22; hedge.push({ p: [x + (r() - 0.5) * 0.35, FLOOR_Y + 0.22 + k * h * 0.28 + r() * 0.08, z + (r() - 0.5) * 0.35], s: [s, s * (0.75 + r() * 0.2), s], r: [r(), r() * 3, r()], c: pick(P.hedge) }); }
        if (scene === 'golden' && r() < 0.65) for (let k = 0; k < (lo ? 5 : 10); k++) rose.push({ p: [x + (r() - 0.5) * 0.8, FLOOR_Y + 0.25 + r() * (h * 0.55 + 0.2), z + 0.32 + r() * 0.18], s: 0.035 + r() * 0.025, c: pick(P.rose) });
      }
    };
    wall(-7.5, -8.3, 7.5, -8.3, 0.45);
    wall(-6.2, -8.3, -6.2, 0.5, 0.9);
    wall(6.2, -8.3, 6.2, 0.5, 0.9);
    // trees above the hedge
    const tree = (x: number, z: number, s: number) => {
      trunks.push({ p: [x, FLOOR_Y + 1.2 * s, z], s: [0.12 * s, 2.4 * s, 0.12 * s], c: P.trunk });
      for (let k = 0; k < (lo ? 5 : 9); k++) { const a = r() * Math.PI * 2, d = r() * 0.9 * s; const sc = (0.7 + r() * 0.5) * s; canopy.push({ p: [x + Math.cos(a) * d, FLOOR_Y + (2.3 + r() * 1.0) * s, z + Math.sin(a) * d * 0.6], s: [sc, sc * 0.8, sc], r: [r(), r(), r()], c: pick(P.canopy) }); }
    };
    if (scene === 'picnic') { tree(-4.6, -6.2, 1.15); tree(4.8, -7.8, 1.05); }
    else { tree(-5.2, -8.2, 0.95); tree(5.2, -8.2, 0.95); }
    // lavender beds (golden: lots; dusk: some), clumps of spikes over a green tuft
    const clumps: [number, number][] = [];
    if (scene !== 'picnic') {
      for (const sx of [-1, 1]) for (let i = 0; i < (lo ? 5 : 8); i++) clumps.push([sx * (2.75 + r() * 0.9), -2.6 + i * 0.55 + r() * 0.2]);
      for (let i = 0; i < (lo ? 4 : 7); i++) clumps.push([-5.2 + i * 1.6 + r() * 0.3, -9.0]);
    }
    for (const [x, z] of clumps) {
      tuft.push({ p: [x, FLOOR_Y + 0.08, z], s: [0.26, 0.16, 0.26], r: [0, r() * 3, 0], c: pick(P.hedge) });
      for (let k = 0; k < (lo ? 7 : 12); k++) { const a = r() * Math.PI * 2, d = r() * 0.2; lav.push({ p: [x + Math.cos(a) * d, FLOOR_Y + 0.12, z + Math.sin(a) * d], s: [0.022, 0.26 + r() * 0.16, 0.022], r: [(r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5], c: pick(P.lav) }); }
    }
    // rose bushes in pots by the terrace (golden + dusk)
    if (scene !== 'picnic') for (const [x, z, s] of [[-2.2, -2.3, 1], [2.3, -2.2, 1.1], [-3.4, 0.6, 0.9], [3.5, 0.8, 1]] as const) {
      pots.push({ p: [x, FLOOR_Y + 0.18 * s, z], s: [0.24 * s, 0.36 * s, 0.24 * s], c: '#ffffff' });
      for (let k = 0; k < 4; k++) hedge.push({ p: [x + (r() - 0.5) * 0.3 * s, FLOOR_Y + (0.5 + r() * 0.35) * s, z + (r() - 0.5) * 0.3 * s], s: 0.24 * s, r: [r(), r(), r()], c: pick(P.hedge) });
      for (let k = 0; k < (lo ? 8 : 16); k++) { const a = r() * Math.PI * 2; rose.push({ p: [x + Math.cos(a) * 0.3 * s, FLOOR_Y + (0.5 + r() * 0.45) * s, z + Math.sin(a) * 0.3 * s], s: 0.032 + r() * 0.02, c: pick(P.rose) }); }
    }
    // daisies in the lawn (picnic)
    if (scene === 'picnic') for (let i = 0; i < (lo ? 120 : 260); i++) { const a = r() * Math.PI * 2, d = 1.9 + r() * 5; const x = Math.sin(a) * d, z = Math.cos(a) * d; if (Math.abs(x) < 1.7 && z < -2 && z > -8) continue; daisy.push({ p: [x, FLOOR_Y + 0.012, z], s: 0.035 + r() * 0.02, r: [0, r() * 3, 0], c: r() < 0.85 ? '#ffffff' : '#ffe27a' }); }
    return { hedge, lav, tuft, rose, canopy, trunks, daisy, pots };
  }, [scene, lo]);
  const potGeo = useMemo(() => new THREE.CylinderGeometry(1, 0.7, 1, 12), []);
  return (
    <group>
      <Instances geo={lo ? GEO.blobLo : GEO.blob} mat={mats.leaf} items={data.hedge} />
      <Instances geo={lo ? GEO.blobLo : GEO.blob} mat={mats.leaf} items={data.canopy} />
      <Instances geo={GEO.cyl} mat={mats.trunk} items={data.trunks} />
      {data.tuft.length > 0 && <Instances geo={GEO.blobLo} mat={mats.plain} items={data.tuft} />}
      {data.lav.length > 0 && <Instances geo={GEO.cone} mat={mats.flower} items={data.lav} />}
      {data.rose.length > 0 && <Instances geo={GEO.sphere} mat={mats.flower} items={data.rose} />}
      {data.daisy.length > 0 && <Instances geo={GEO.disc} mat={mats.flower} items={data.daisy} />}
      {data.pots.length > 0 && <Instances geo={potGeo} mat={mats.pot} items={data.pots} />}
    </group>
  );
});

/** Catenary point list between two posts. */
function sagLine(a: V3, b: V3, sag: number, n: number): V3[] {
  return Array.from({ length: n + 1 }, (_, i) => { const u = i / n; return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - sag * 4 * u * (1 - u), a[2] + (b[2] - a[2]) * u] as V3; });
}
/** Strings of fairy lights: dark wire + warm glowing bulbs as additive point sprites (one draw call). */
export const FairyLights = memo(function FairyLights({ strings, color = '#ffd27a', size = 0.16, twinkle }: { strings: { a: V3; b: V3; sag: number }[]; color?: string; size?: number; twinkle: boolean }) {
  const { wire, bulbs } = useMemo(() => {
    const w: number[] = [], b: number[] = [];
    for (const s of strings) {
      const pts = sagLine(s.a, s.b, s.sag, 24);
      for (let i = 0; i < pts.length - 1; i++) w.push(...pts[i]!, ...pts[i + 1]!);
      const len = Math.hypot(s.b[0] - s.a[0], s.b[2] - s.a[2], s.b[1] - s.a[1]); const n = Math.max(3, Math.round(len / 0.3));
      for (const p of sagLine(s.a, s.b, s.sag, n).slice(1, -1)) b.push(p[0], p[1] - 0.035, p[2]);
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(w, 3));
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(b, 3));
    return { wire: wg, bulbs: bg };
  }, [strings]);
  const m = useMemo(() => ({
    wire: new THREE.LineBasicMaterial({ color: '#2a2016', transparent: true, opacity: 0.7 }),
    bulb: new THREE.PointsMaterial({ map: glowDot(), color, size, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    core: new THREE.PointsMaterial({ color: '#fff8e0', size: size * 0.16, sizeAttenuation: true, fog: false }),
  }), [color, size]);
  useFrame((st) => { if (twinkle) m.bulb.opacity = 0.85 + Math.sin(st.clock.elapsedTime * 2.3) * 0.08 + Math.sin(st.clock.elapsedTime * 5.1) * 0.05; });
  return (
    <group>
      <lineSegments geometry={wire} material={m.wire} />
      <points geometry={bulbs} material={m.bulb} renderOrder={5} />
      <points geometry={bulbs} material={m.core} />
    </group>
  );
});

/** Wooden posts that carry the light strings. */
export function Posts({ at, h, color = '#6a4426' }: { at: [number, number][]; h: number; color?: string }) {
  const m = useMemo(() => new THREE.MeshLambertMaterial({ color }), [color]);
  return <>{at.map(([x, z], i) => <mesh key={i} geometry={GEO.box} material={m} position={[x, FLOOR_Y + h / 2, z]} scale={[0.09, h, 0.09]} />)}</>;
}

export { shadowMat };
