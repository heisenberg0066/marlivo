// The cosy pumpkin back room (sketchbook v3 p37–39): a round wooden table with felt under a warm pendant lamp,
// shelves with pumpkins, badminton rackets on the wall, chocolates and tea, France / Palestine / Sweden bunting
// and a big window onto an evening city. Low-poly, unlit-ish materials with the light "baked" into textures.
import { memo, useMemo } from 'react';
import * as THREE from 'three';
import { TABLE_R } from './layout3d';
import { feltTexture, woodTexture, wallTexture, skylineTexture, flagTexture, FLAG_ASPECT, shadowTexture } from './textures';

const lam = (c: string, map?: THREE.Texture) => new THREE.MeshLambertMaterial(map ? { color: c, map } : { color: c });
const basic = (map: THREE.Texture, color = '#ffffff') => new THREE.MeshBasicMaterial({ map, color });

export function Pumpkin3D({ p, s = 1, rot = 0, tone = '#e8842c' }: { p: [number, number, number]; s?: number; rot?: number; tone?: string }) {
  const m = useMemo(() => ({ a: lam(tone), b: lam('#d06f22'), stem: lam('#5b7f3a'), leaf: lam('#6aa13f') }), [tone]);
  return (
    <group position={p} scale={s} rotation={[0, rot, 0]}>
      {[0, 1, 2, 3, 4, 5].map((i) => { const a = (i / 6) * Math.PI * 2; return <mesh key={i} material={i % 2 ? m.b : m.a} position={[Math.cos(a) * 0.05, 0.075, Math.sin(a) * 0.05]} scale={[0.075, 0.07, 0.075]}><sphereGeometry args={[1, 12, 10]} /></mesh>; })}
      <mesh material={m.a} position={[0, 0.08, 0]} scale={[0.08, 0.075, 0.08]}><sphereGeometry args={[1, 12, 10]} /></mesh>
      <mesh material={m.stem} position={[0, 0.17, 0]} rotation={[0.2, 0, 0.15]}><cylinderGeometry args={[0.012, 0.016, 0.05, 6]} /></mesh>
      <mesh material={m.leaf} position={[0.03, 0.17, 0]} rotation={[0, 0, -0.5]} scale={[0.035, 0.008, 0.02]}><sphereGeometry args={[1, 8, 6]} /></mesh>
    </group>
  );
}

function Racket3D({ p, rot }: { p: [number, number, number]; rot: number }) {
  const frame = useMemo(() => lam('#e8892f'), []);
  const strings = useMemo(() => new THREE.MeshBasicMaterial({ color: '#f6ebd9', transparent: true, opacity: 0.35 }), []);
  const grip = useMemo(() => lam('#3b6fb0'), []);
  return (
    <group position={p} rotation={[0, 0, rot]}>
      <mesh material={frame} position={[0, 0.25, 0]} scale={[1, 1.28, 1]}><torusGeometry args={[0.11, 0.008, 6, 28]} /></mesh>
      <mesh material={strings} position={[0, 0.25, 0]} scale={[0.11, 0.14, 1]}><circleGeometry args={[1, 20]} /></mesh>
      <mesh material={frame} position={[0, -0.0, 0]}><cylinderGeometry args={[0.008, 0.008, 0.26, 6]} /></mesh>
      <mesh material={grip} position={[0, -0.17, 0]}><cylinderGeometry args={[0.016, 0.016, 0.12, 8]} /></mesh>
    </group>
  );
}
function Shuttle3D({ p, rot = 0 }: { p: [number, number, number]; rot?: number }) {
  return (
    <group position={p} rotation={[0, 0, rot]}>
      <mesh position={[0, 0.03, 0]}><coneGeometry args={[0.035, 0.06, 10, 1, true]} /><meshLambertMaterial color="#fffaf0" side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, -0.005, 0]}><sphereGeometry args={[0.014, 10, 8]} /><meshLambertMaterial color="#e8892f" /></mesh>
    </group>
  );
}

/** Bunting with the three flags in their correct proportions, hanging from a sagging string. */
function Bunting({ from, to, sag, n }: { from: [number, number, number]; to: [number, number, number]; sag: number; n: number }) {
  const kinds = ['fr', 'ps', 'se'] as const;
  const at = (u: number): [number, number, number] => [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u - sag * 4 * u * (1 - u), from[2] + (to[2] - from[2]) * u];
  const curve = useMemo(() => new THREE.CatmullRomCurve3(Array.from({ length: 13 }, (_, i) => new THREE.Vector3(...at(i / 12)))), []);
  const flagMats = useMemo(() => Object.fromEntries(kinds.map((k) => [k, new THREE.MeshBasicMaterial({ map: flagTexture(k), side: THREE.DoubleSide, color: '#e9dccb' })])), []);
  return (
    <group>
      <mesh><tubeGeometry args={[curve, 40, 0.006, 4, false]} /><meshLambertMaterial color="#c9a15b" /></mesh>
      {Array.from({ length: n }, (_, i) => {
        const k = kinds[i % 3]!; const u = (i + 0.5) / n; const [x, y, z] = at(u);
        const h = 0.17, w = h * FLAG_ASPECT[k];
        return <mesh key={i} material={flagMats[k]} position={[x, y - h / 2 - 0.01, z + 0.01]} rotation={[0, 0, (u - 0.5) * -0.25]}><planeGeometry args={[w, h]} /></mesh>;
      })}
    </group>
  );
}

export const Room = memo(function Room() {
  const M = useMemo(() => {
    const floorTex = woodTexture('#5a3420', '#3a2012').clone(); floorTex.repeat.set(6, 6); floorTex.needsUpdate = true;
    const topTex = woodTexture('#8a4f2a', '#5a301a').clone(); topTex.repeat.set(2, 2); topTex.needsUpdate = true;
    return {
      floor: lam('#ffffff', floorTex), wall: lam('#ffffff', wallTexture()), wains: lam('#4a2a18'), trim: lam('#6b3d22'),
      tableTop: lam('#ffffff', topTex), tableEdge: lam('#6b3a1e'), felt: lam('#ffffff', feltTexture()), leg: lam('#4a2814'),
      sky: basic(skylineTexture()), frame: lam('#5a331d'), shelf: lam('#6b3d22'), rug: lam('#7a2f22'), rug2: lam('#c9853a'),
      shade: lam('#e8a85a'), bulb: new THREE.MeshBasicMaterial({ color: '#fff2c8' }), cord: lam('#2a1a10'), chair: lam('#5a2f18'),
      bowl: lam('#c9a15b'), glass: new THREE.MeshLambertMaterial({ color: '#b5531f', transparent: true, opacity: 0.85 }),
      shadow: new THREE.MeshBasicMaterial({ map: shadowTexture(true), transparent: true, depthWrite: false }),
    };
  }, []);
  const candies = useMemo(() => {
    const cols = ['#e2b23c', '#c0392b', '#e8892f', '#7a4a2a', '#5a2f1c', '#c9a15b', '#3b6fb0'];
    let s = 3; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 9 }, (_, i) => ({ c: cols[i % cols.length]!, x: (rnd() - 0.5) * 0.12, z: (rnd() - 0.5) * 0.1, y: 0.045 + rnd() * 0.02, r: rnd() * 3 }));
  }, []);
  const R = TABLE_R;
  return (
    <group>
      {/* light: warm hemisphere + the pendant lamp (no realtime shadows; contact shadows are baked blobs) */}
      <hemisphereLight args={['#ffd9a8', '#3a2010', 1.1]} />
      <directionalLight position={[0.6, 3, 1.4]} intensity={0.9} color="#ffe2b8" />
      <pointLight position={[0, 1.6, 0]} intensity={2.6} distance={4.5} decay={1.3} color="#ffc27a" />

      {/* floor, rug, walls */}
      <mesh material={M.floor} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.75, 0]}><planeGeometry args={[12, 12]} /></mesh>
      <mesh material={M.rug} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.745, 0]}><circleGeometry args={[2.1, 40]} /></mesh>
      <mesh material={M.rug2} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.744, 0]}><ringGeometry args={[1.85, 1.95, 40]} /></mesh>
      <mesh material={M.wall} position={[0, 1.0, -2.6]}><planeGeometry args={[9, 3.6]} /></mesh>
      <mesh material={M.wall} position={[-3.0, 1.0, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[9, 3.6]} /></mesh>
      <mesh material={M.wall} position={[3.0, 1.0, 0]} rotation={[0, -Math.PI / 2, 0]}><planeGeometry args={[9, 3.6]} /></mesh>
      <mesh material={M.wains} position={[0, -0.45, -2.58]}><boxGeometry args={[9, 0.6, 0.04]} /></mesh>
      <mesh material={M.trim} position={[0, -0.14, -2.56]}><boxGeometry args={[9, 0.05, 0.06]} /></mesh>

      {/* big window with the evening city */}
      <group position={[0, 1.05, -2.57]}>
        <mesh material={M.sky}><planeGeometry args={[2.7, 1.6]} /></mesh>
        {[[-1.38, 0, 0.08, 1.75], [1.38, 0, 0.08, 1.75], [0, 0.84, 2.84, 0.08], [0, -0.84, 2.84, 0.1], [0, 0, 0.05, 1.6], [0, 0.1, 2.7, 0.04]].map(([x, y, w, h], i) => (
          <mesh key={i} material={M.frame} position={[x!, y!, 0.03]}><boxGeometry args={[w!, h!, 0.06]} /></mesh>
        ))}
        <mesh material={M.shelf} position={[0, -0.9, 0.1]}><boxGeometry args={[3.0, 0.05, 0.22]} /></mesh>
        <Pumpkin3D p={[-1.1, -0.875, 0.1]} s={1.3} /><Pumpkin3D p={[-0.82, -0.875, 0.12]} s={0.85} tone="#f09a3e" /><Pumpkin3D p={[1.15, -0.875, 0.1]} s={1.1} />
      </group>
      <Bunting from={[-2.5, 2.2, -2.52]} to={[2.5, 2.2, -2.52]} sag={0.28} n={13} />

      {/* shelves with pumpkins (left and right of the window) */}
      {[-1, 1].map((sd) => (
        <group key={sd} position={[sd * 2.45, 0, -2.45]}>
          {[0.35, 0.95, 1.55].map((y, i) => <mesh key={i} material={M.shelf} position={[0, y, 0]}><boxGeometry args={[1.1, 0.04, 0.26]} /></mesh>)}
          <Pumpkin3D p={[-0.25, 0.37, 0]} s={1.4} /><Pumpkin3D p={[0.2, 0.37, 0.02]} s={0.9} tone="#f09a3e" />
          <Pumpkin3D p={[0.28, 0.97, 0]} s={1.1} tone="#d97a2a" />
          <Pumpkin3D p={[-0.3, 1.57, 0]} s={0.8} /><Pumpkin3D p={[0.05, 1.57, 0]} s={1.15} />
          {sd < 0 && <><mesh material={M.glass} position={[-0.2, 1.03, 0]}><cylinderGeometry args={[0.04, 0.03, 0.12, 10]} /></mesh><mesh material={M.glass} position={[-0.05, 1.03, 0]}><cylinderGeometry args={[0.04, 0.03, 0.12, 10]} /></mesh></>}
        </group>
      ))}
      {/* badminton on the wall */}
      <group position={[-1.75, 1.25, -2.55]}><Racket3D p={[-0.06, 0, 0]} rot={0.35} /><Racket3D p={[0.06, 0, 0.01]} rot={-0.35} /><Shuttle3D p={[0, 0.56, 0.02]} rot={0.4} /></group>
      <group position={[1.8, 1.3, -2.55]}><Shuttle3D p={[0, 0, 0]} rot={-0.3} /><Shuttle3D p={[0.12, -0.05, 0]} rot={0.5} /></group>

      {/* pendant lamp */}
      <mesh material={M.cord} position={[0, 2.35, 0]}><cylinderGeometry args={[0.006, 0.006, 0.7, 4]} /></mesh>
      <mesh material={M.shade} position={[0, 1.95, 0]}><coneGeometry args={[0.26, 0.2, 20, 1, true]} /></mesh>
      <mesh material={M.bulb} position={[0, 1.87, 0]}><sphereGeometry args={[0.07, 12, 8]} /></mesh>

      {/* the table: wooden top with a rim, green felt, pedestal */}
      <mesh material={M.tableTop} position={[0, -0.04, 0]}><cylinderGeometry args={[R + 0.12, R + 0.1, 0.08, 48]} /></mesh>
      <mesh material={M.tableEdge} position={[0, 0.004, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[R + 0.06, 0.03, 6, 64]} /></mesh>
      <mesh material={M.felt} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0005, 0]}><circleGeometry args={[R, 64]} /></mesh>
      <mesh material={M.leg} position={[0, -0.42, 0]}><cylinderGeometry args={[0.12, 0.2, 0.68, 12]} /></mesh>
      <mesh material={M.leg} position={[0, -0.74, 0]}><cylinderGeometry args={[0.55, 0.6, 0.03, 16]} /></mesh>

      {/* my corner: tea glass and a bowl of chocolates (Liv's favourites) */}
      <group position={[-0.66, 0, 0.6]}>
        <mesh material={M.shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}><planeGeometry args={[0.16, 0.16]} /></mesh>
        <mesh material={M.glass} position={[0, 0.055, 0]}><cylinderGeometry args={[0.04, 0.03, 0.11, 12]} /></mesh>
        <mesh material={M.bowl} position={[0, 0.003, 0]}><cylinderGeometry args={[0.06, 0.06, 0.006, 16]} /></mesh>
      </group>
      <group position={[0.66, 0, 0.6]}>
        <mesh material={M.shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}><planeGeometry args={[0.32, 0.32]} /></mesh>
        <mesh material={M.bowl} position={[0, 0.03, 0]} scale={[1, 0.55, 1]}><sphereGeometry args={[0.11, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} /></mesh>
        {candies.map((c, i) => <mesh key={i} position={[c.x, c.y, c.z]} rotation={[0, c.r, 0]}><boxGeometry args={[0.035, 0.018, 0.024]} /><meshLambertMaterial color={c.c} /></mesh>)}
      </group>
      {/* a few loose chocolates on the felt edge */}
      {[[0.8, 0.42, 0.4, '#c0392b'], [-0.52, 0.78, -0.3, '#e2b23c'], [0.5, 0.8, 1.2, '#7a4a2a'], [-0.82, 0.4, 2.2, '#3b6fb0']].map(([x, z, r, c], i) => (
        <mesh key={i} position={[x as number, 0.009, z as number]} rotation={[0, r as number, 0]}><boxGeometry args={[0.035, 0.016, 0.024]} /><meshLambertMaterial color={c as string} /></mesh>
      ))}
    </group>
  );
});

export function Chair({ p, yaw }: { p: [number, number, number]; yaw: number }) {
  const m = useMemo(() => lam('#5a2f18'), []);
  return (
    <group position={p} rotation={[0, yaw, 0]}>
      <mesh material={m} position={[0, -0.32, 0]}><boxGeometry args={[0.5, 0.05, 0.45]} /></mesh>
      <mesh material={m} position={[0, 0.1, -0.22]}><boxGeometry args={[0.5, 0.8, 0.05]} /></mesh>
    </group>
  );
}
