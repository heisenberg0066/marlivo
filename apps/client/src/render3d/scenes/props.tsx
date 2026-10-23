// Shared table props for the garden scenes (sketch book v8 p08–09): porcelain tea cup + saucer with a gold rim
// and a level that drains on its own, sugar cubes (one instanced mesh for the whole table), the half-unwrapped
// gold-foil chocolate bar with a bite, and the chairs. Each table variant lives in its scene's own module. Procedural three.js geometry
// (lathe profiles, rounded boxes), shared geometries/materials, Lambert/Phong only (no env maps, no shadows:
// contact shadows are baked blobs).
import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { PropLayout } from './propLayout';
import { tickTea, teaLevel } from './tea';
import { TEA, CHOCO, FLOOR_Y } from '../sceneConfig';
import { foilTexture, blobShadow, glowDot } from './stex';

export type SceneKey = 'golden' | 'picnic' | 'dusk';
export const lam = (o: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(o);
export const phong = (o: THREE.MeshPhongMaterialParameters) => new THREE.MeshPhongMaterial(o);

// ---------- tea ----------
// cup profile (r, y): foot, belly, rim, then the inner wall back down to the bottom
const CUP_OUT: [number, number][] = [[0, 0.004], [0.02, 0.004], [0.022, 0.008], [0.031, 0.016], [0.038, 0.028], [0.0415, 0.04], [0.0435, 0.05]];
const CUP_IN: [number, number][] = [[0.0408, 0.05], [0.0392, 0.04], [0.0358, 0.028], [0.0285, 0.017], [0.018, 0.011], [0, 0.0095]];
const SAUCER: [number, number][] = [[0, 0.0012], [0.028, 0.0012], [0.031, 0.004], [0.034, 0.0058], [0.052, 0.0085], [0.063, 0.0115], [TEA.saucerR, 0.0135], [0.0645, 0.0142], [0.057, 0.0118], [0.034, 0.0078], [0, 0.0072]];
const innerR = (y: number) => { for (let i = CUP_IN.length - 1; i > 0; i--) { const [r1, y1] = CUP_IN[i]!, [r0, y0] = CUP_IN[i - 1]!; if (y >= y1 && y <= y0) return r1 + ((y - y1) / (y0 - y1)) * (r0 - r1); } return 0.04; };
const TEA_Y0 = 0.0105, TEA_Y1 = 0.047;

const G = {
  cup: new THREE.LatheGeometry([...CUP_OUT, ...CUP_IN].map(([r, y]) => new THREE.Vector2(r, y)), 28),
  saucer: new THREE.LatheGeometry(SAUCER.map(([r, y]) => new THREE.Vector2(r, y)), 32),
  cupRim: new THREE.TorusGeometry(0.0422, 0.0014, 4, 40),
  saucerRim: new THREE.TorusGeometry(TEA.saucerR - 0.0006, 0.0012, 4, 44),
  handle: new THREE.TorusGeometry(0.0125, 0.0034, 6, 14, Math.PI * 1.25),
  tea: new THREE.CircleGeometry(1, 24),
  sugar: new RoundedBoxGeometry(0.019, 0.019, 0.019, 2, 0.0035),
  spoonBowl: new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  spoonStem: new THREE.BoxGeometry(0.052, 0.0016, 0.0045),
  plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
};
/** unit plane lying flat (XZ), facing up */
export const FLAT = G.plane;
const M = {
  porcelain: phong({ color: '#fbf8f2', specular: '#ffffff', shininess: 70, side: THREE.DoubleSide, emissive: '#3a3028' }),
  gold: phong({ color: '#d4a642', specular: '#fff0b8', shininess: 90, emissive: '#3a2a08' }),
  tea: phong({ color: '#a8561c', specular: '#ffdcb0', shininess: 120, emissive: '#2e1204' }),
  sugar: lam({ color: '#fffdf8', emissive: '#2a2824' }),
  silver: phong({ color: '#cfd2d6', specular: '#ffffff', shininess: 110 }),
  shadow: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, opacity: 0.9 }),
};

export function TeaCup({ seat, at, yaw, hi }: { seat: number; at: [number, number, number]; yaw: number; hi: boolean }) {
  const surf = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const s = surf.current; if (!s) return;
    const lv = teaLevel(seat), y = TEA_Y0 + lv * (TEA_Y1 - TEA_Y0), r = innerR(y) - 0.0004;
    s.position.y = y; s.scale.set(r, r, 1);
  });
  return (
    <group position={at} rotation={[0, yaw, 0]}>
      <mesh geometry={G.plane} material={shadowMat()} position={[0.004, 0.0006, -0.004]} scale={[0.16, 1, 0.16]} renderOrder={1} />
      <mesh geometry={G.saucer} material={M.porcelain} />
      <mesh geometry={G.saucerRim} material={M.gold} position={[0, 0.0136, 0]} rotation={[Math.PI / 2, 0, 0]} />
      <group position={[0, 0.0072, 0]}>
        <mesh geometry={G.cup} material={M.porcelain} />
        <mesh geometry={G.cupRim} material={M.gold} position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]} />
        <mesh geometry={G.handle} material={M.porcelain} position={[0.0455, 0.03, 0]} rotation={[0, 0, -Math.PI * 0.62]} />
        <mesh ref={surf} geometry={G.tea} material={M.tea} rotation={[-Math.PI / 2, 0, 0]} />
      </group>
      {hi && (
        <group position={[0.0, 0.0085, 0.05]} rotation={[0, -0.5, 0]}>
          <mesh geometry={G.spoonBowl} material={M.silver} position={[0.03, 0.002, 0]} scale={[0.009, 0.003, 0.006]} rotation={[Math.PI, 0, 0]} />
          <mesh geometry={G.spoonStem} material={M.silver} position={[-0.0, 0.0035, 0]} rotation={[0, 0, 0.08]} />
        </group>
      )}
    </group>
  );
}
let shadowM: THREE.MeshBasicMaterial | null = null;
export const shadowMat = () => (shadowM ??= new THREE.MeshBasicMaterial({ map: blobShadow(), transparent: true, depthWrite: false }));

/** Every seat's sugar cubes in one instanced mesh. */
export function SugarCubes({ props: P }: { props: PropLayout }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const list = useMemo(() => Object.entries(P.sugar).flatMap(([s, cs]) => cs.map((c, i) => ({ c, yaw: (P.tea[Number(s)]?.yaw ?? 0) + i * 0.7 + 0.2 }))), [P]);
  useLayoutEffect(() => {
    const m = ref.current; if (!m) return;
    const o = new THREE.Object3D();
    list.forEach(({ c, yaw }, i) => {
      // c[1] = layer: 0 lies on the saucer (top ~0.0098 at the sugar radius), 1 is stacked across the first two
      o.position.set(c[0], 0.0098 + 0.0095 + c[1] * 0.0185, c[2]); o.rotation.set(0, yaw, c[1] ? 0.12 : 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
    });
    m.count = list.length; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
  }, [list]);
  return <instancedMesh ref={ref} args={[G.sugar, M.sugar, 16]} frustumCulled={false} />;
}

/** Drives the tea levels (one clock for all cups) + a soft steam wisp per cup on High. */
export function TeaClock({ seats }: { seats: number[] }) {
  useFrame((st, dt) => tickTea(st.clock.elapsedTime, Math.min(dt, 0.1), seats));
  return null;
}
export function Steam({ props: P, strength = 1 }: { props: PropLayout; strength?: number }) {
  const N = 5;
  const seats = useMemo(() => Object.keys(P.tea).map(Number), [P]);
  const geo = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seats.length * N * 3), 3)); g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(seats.length * N), 1)); return g; }, [seats]);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { map: { value: glowDot() }, k: { value: strength }, h: { value: 800 } }, transparent: true, depthWrite: false,
    vertexShader: 'uniform float h; attribute float alpha; varying float vA; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = 0.07 * h * projectionMatrix[1][1] * 0.5 / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform sampler2D map; uniform float k; varying float vA; void main(){ float a = texture2D(map, gl_PointCoord).r; gl_FragColor = vec4(1.0, 0.98, 0.95, a * vA * 0.07 * k); }',
  }), [strength]);
  useFrame((st) => {
    const t = st.clock.elapsedTime, pos = geo.attributes.position as THREE.BufferAttribute, al = geo.attributes.alpha as THREE.BufferAttribute;
    mat.uniforms.h!.value = st.size.height * st.gl.getPixelRatio();
    seats.forEach((s, si) => {
      const c = P.tea[s]!; const lv = teaLevel(s);
      for (let i = 0; i < N; i++) {
        const u = ((t * 0.22 + i / N + s * 0.13) % 1);
        pos.setXYZ(si * N + i, c.p[0] + Math.sin(u * 5 + i) * 0.012, 0.06 + u * 0.16, c.p[2] + Math.cos(u * 4 + i) * 0.01);
        al.setX(si * N + i, Math.sin(u * Math.PI) * (0.4 + lv * 0.6));
      }
    });
    pos.needsUpdate = true; al.needsUpdate = true;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={3} />;
}

// ---------- chocolate ----------
const CH = {
  base: new RoundedBoxGeometry(CHOCO.w, 0.006, CHOCO.d, 1, 0.002),
  piece: new RoundedBoxGeometry(CHOCO.w / 4 - 0.004, 0.006, CHOCO.d / 2 - 0.004, 2, 0.002),
  bite: new THREE.CylinderGeometry(0.011, 0.011, 0.014, 10),
  foil: (() => {
    const g = new THREE.BoxGeometry(CHOCO.w * 0.56, 0.02, CHOCO.d + 0.006, 8, 2, 4);
    const p = g.attributes.position as THREE.BufferAttribute; let s = 13; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5);
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setXYZ(i, p.getX(i) + r() * 0.003, y + (y > 0 ? r() * 0.003 : 0), p.getZ(i) + r() * 0.0025); }
    g.computeVertexNormals(); return g;
  })(),
};
const CHM = {
  choc: phong({ color: '#5b2f1b', specular: '#a0705a', shininess: 35, emissive: '#120604' }),
  foil: phong({ color: '#ffffff', map: null, specular: '#fff2c0', shininess: 80, emissive: '#2a1a04', flatShading: true }),
  paper: lam({ color: '#5a1a1a' }),
};
export function ChocolateBar({ at, yaw }: { at: [number, number, number]; yaw: number }) {
  useMemo(() => { if (!CHM.foil.map) { CHM.foil.map = foilTexture(); CHM.foil.needsUpdate = true; } }, []);
  return (
    <group position={at} rotation={[0, yaw, 0]}>
      <mesh geometry={G.plane} material={shadowMat()} position={[0, 0.0006, 0]} scale={[CHOCO.w * 1.5, 1, CHOCO.d * 1.9]} renderOrder={1} />
      <mesh geometry={CH.base} material={CHM.choc} position={[0, 0.004, 0]} />
      {[0, 1, 2, 3].flatMap((i) => [0, 1].map((j) => {
        if (i === 3 && j === 0) return <mesh key="bite" geometry={CH.piece} material={CHM.choc} position={[(i - 1.5) * (CHOCO.w / 4) - 0.004, 0.0095, (j - 0.5) * (CHOCO.d / 2) + 0.003]} scale={[0.7, 1, 0.75]} />;
        return <mesh key={i + '' + j} geometry={CH.piece} material={CHM.choc} position={[(i - 1.5) * (CHOCO.w / 4), 0.0095, (j - 0.5) * (CHOCO.d / 2)]} />;
      }))}
      {/* the gold foil wraps the left half, crinkled */}
      <mesh geometry={CH.foil} material={CHM.foil} position={[-CHOCO.w * 0.24, 0.0085, 0]} />
    </group>
  );
}

export const TG = {
  cyl: new THREE.CylinderGeometry(1, 1, 1, 48),
  cylLo: new THREE.CylinderGeometry(1, 1, 1, 10),
  box: new THREE.BoxGeometry(1, 1, 1),
  disc: new THREE.CircleGeometry(1, 72).rotateX(-Math.PI / 2),
};

// ---------- chairs (in the seated character's local frame, before CHAR_SCALE; seat top at y = -0.3) ----------
const CHAIR_M = new Map<string, Record<string, THREE.Material>>();
function chairMats(scene: SceneKey) {
  let m = CHAIR_M.get(scene);
  if (!m) {
    m = scene === 'golden' ? { wood: lam({ color: '#8a5a32' }), cushion: lam({ color: '#9fb58c' }) }
      : scene === 'picnic' ? { wood: lam({ color: '#9a6438' }), cushion: lam({ color: '#9a6438' }) }
      : { wood: lam({ color: '#4e2f1a' }), cushion: lam({ color: '#7d8a62' }) };
    CHAIR_M.set(scene, m);
  }
  return m;
}
const CUSHION = new RoundedBoxGeometry(0.44, 0.06, 0.4, 2, 0.025);
const FL = FLOOR_Y / 0.85; // floor in the (scaled) seat frame
export function GardenChair({ scene }: { scene: SceneKey }) {
  const m = chairMats(scene);
  if (scene === 'picnic') {
    // a short plank bench (no back), like the picnic table's benches
    return (
      <group>
        <mesh geometry={TG.box} material={m.wood} position={[0, -0.345, 0]} scale={[0.7, 0.05, 0.34]} />
        {[-1, 1].map((s) => <mesh key={s} geometry={TG.box} material={m.wood} position={[s * 0.26, (FL - 0.36) / 2, 0]} scale={[0.06, -FL - 0.36, 0.28]} />)}
      </group>
    );
  }
  const legH = -FL - 0.42;
  return (
    <group>
      <mesh geometry={TG.box} material={m.wood} position={[0, -0.4, 0]} scale={[0.48, 0.04, 0.44]} />
      <mesh geometry={CUSHION} material={m.cushion} position={[0, -0.35, 0.01]} />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => <mesh key={i} geometry={TG.cylLo} material={m.wood} position={[sx! * 0.2, -0.42 - legH / 2, sz! * 0.18]} scale={[0.022, legH, 0.022]} />)}
      {/* ladder back: two posts + three slats */}
      {[-1, 1].map((s) => <mesh key={s} geometry={TG.cylLo} material={m.wood} position={[s * 0.21, 0.08, -0.2]} scale={[0.025, 0.86, 0.025]} />)}
      {[0.02, 0.22, 0.42].map((y) => <mesh key={y} geometry={TG.box} material={m.wood} position={[0, y, -0.2]} scale={[0.42, 0.06, 0.02]} />)}
    </group>
  );
}
