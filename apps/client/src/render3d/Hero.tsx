// The two "real" MarLivo characters, modelled from Ammar's references (never from a photo):
//  · Orange guy (id "tango"): an egg-shaped orange with peel texture, big bulging blue eyes, a bulbous nose,
//    a wide flat mouth, long thin pale arms with three spindly fingers, thick legs and splayed duck feet.
//  · Ammar (id "ammar"): a chibi of Ammar's own cartoon avatar: dark curly hair with a short fade, round thin
//    glasses, thick brows, moustache and short beard, silver chain, black t-shirt, black cargo trousers, white
//    sneakers and a watch.
// Procedural three.js geometry (smooth lathe/tube shapes), driven by the shared rig (idle / think / celebrate…).
// `pose="stand"` straightens the legs for the comparison renders; at the table they sit.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Mood } from '../render/characters';
import { useRigMotion, type Rig } from './rig';

type V3 = [number, number, number];
const std = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material) { let m = std.get(key); if (!m) { m = make(); std.set(key, m); } return m; }
const S = (c: string, rough = 0.75, metal = 0) => mat(`s${c}${rough}${metal}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }));

const GEO = {
  sph: new THREE.SphereGeometry(1, 28, 20),
  sphLo: new THREE.SphereGeometry(1, 14, 10),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 20),
  capsule: new THREE.CapsuleGeometry(1, 1, 6, 14),
  cone: new THREE.ConeGeometry(1, 1, 12),
  thinRing: new THREE.TorusGeometry(1, 0.075, 8, 40),
  chain: new THREE.TorusGeometry(1, 0.06, 6, 48),
};
function P({ g = 'sph', m, p = [0, 0, 0], s = 1, r = [0, 0, 0] }: { g?: keyof typeof GEO | THREE.BufferGeometry; m: THREE.Material; p?: V3; s?: number | V3; r?: V3 }) {
  const sc: V3 = typeof s === 'number' ? [s, s, s] : s;
  return <mesh geometry={typeof g === 'string' ? GEO[g] : g} material={m} position={p} scale={sc} rotation={r} />;
}
/** A smooth tube through points (limbs, fingers). */
function tube(pts: V3[], r0: number, r1 = r0, seg = 24) {
  const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)));
  const g = new THREE.TubeGeometry(curve, seg, 1, 12, false);
  // taper: scale each ring's radius from r0 to r1
  const pos = g.attributes.position as THREE.BufferAttribute; const v = new THREE.Vector3(); const c = new THREE.Vector3();
  const rings = seg + 1, per = 13;
  for (let i = 0; i < rings; i++) {
    const t = i / seg; const rad = r0 + (r1 - r0) * t; curve.getPointAt(t, c);
    for (let j = 0; j < per; j++) { const k = i * per + j; v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(rad).add(c); pos.setXYZ(k, v.x, v.y, v.z); }
  }
  g.computeVertexNormals();
  return g;
}
const lathe = (pts: [number, number][], seg = 40) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

// ---------- peel texture (bump) ----------
let peel: THREE.Texture | null = null;
function peelBump() {
  if (peel) return peel;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d')!; g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) { const x = rnd() * 256, y = rnd() * 256, r = 0.8 + rnd() * 1.8; g.fillStyle = `rgba(40,40,40,${0.25 + rnd() * 0.35})`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  peel = new THREE.CanvasTexture(cv); peel.wrapS = peel.wrapT = THREE.RepeatWrapping; peel.repeat.set(3, 3);
  return peel;
}
let skinTone: THREE.Texture | null = null;
/** Orange → paler peach towards the limbs' ends (the reference's limbs fade to a light, almost skin tone). */
function fadeTex() {
  if (skinTone) return skinTone;
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 128;
  const g = cv.getContext('2d')!; const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#e9a066'); gr.addColorStop(0.5, '#f2c39a'); gr.addColorStop(1, '#f4c9a0');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
  skinTone = new THREE.CanvasTexture(cv); skinTone.colorSpace = THREE.SRGBColorSpace;
  return skinTone;
}

function EyeBall({ p, r, iris, lid, lidAt = 0.38, look = [0, 0] }: { p: V3; r: number; iris: string; lid?: THREE.Material; lidAt?: number; look?: [number, number] }) {
  const white = S('#f7f4ee', 0.25); const ir = S(iris, 0.35); const pupil = S('#0d0d10', 0.2); const hl = mat('hl', () => new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  return (
    <group position={p} rotation={[look[1], look[0], 0]}>
      <P m={white} s={r} />
      <P m={ir} p={[0, 0, r * 0.78]} s={[r * 0.5, r * 0.5, r * 0.3]} />
      <P m={pupil} p={[0, 0, r * 0.9]} s={[r * 0.24, r * 0.24, r * 0.15]} />
      <P m={hl} p={[r * 0.2, r * 0.22, r * 0.98]} s={r * 0.09} />
      {lid && <P g="thinRing" m={lid} p={[0, 0, r * lidAt]} s={[r * 1.0, r * 1.0, r * 1.6]} />}
    </group>
  );
}

// ======================================================================
// ORANGE GUY
// ======================================================================
export function OrangeGuy({ mood, seed, pose = 'sit' }: { mood: Mood; seed: number; pose?: 'sit' | 'stand' }) {
  const rig = useRef<Rig>({ root: null, head: null, armL: null, armR: null, eyes: null });
  const sit = pose === 'sit';
  useRigMotion(rig, mood, seed, { armScale: 0.4, baseY: sit ? -0.06 : 0.18 });
  const set = (k: keyof Rig) => (g: THREE.Group | null) => { rig.current[k] = g; };
  const m = useMemo(() => {
    const peelMat = new THREE.MeshStandardMaterial({ color: '#e8954f', roughness: 0.58, bumpMap: peelBump(), bumpScale: 0.5, emissive: '#5a2a0c', emissiveIntensity: 0.35 });
    const limb = new THREE.MeshStandardMaterial({ color: '#f0b88c', roughness: 0.55 });
    const foot = new THREE.MeshStandardMaterial({ color: '#eea56c', roughness: 0.5 });
    const mouthIn = S('#4a170d', 0.85); const nostril = S('#8a4a24', 0.9);
    return { peelMat, limb, foot, mouthIn, nostril };
  }, []);
  const g = useMemo(() => {
    // a wide, nearly round orange: domed top, widest just below the eyes' level, tucked bottom into the legs
    const body = lathe([[0, -0.215], [0.1, -0.21], [0.19, -0.185], [0.26, -0.135], [0.305, -0.06], [0.32, 0.0], [0.322, 0.08], [0.31, 0.16], [0.28, 0.235], [0.225, 0.3], [0.15, 0.345], [0.075, 0.368], [0, 0.374]], 56);
    const nose = lathe([[0, -0.05], [0.045, -0.048], [0.062, -0.028], [0.062, 0.0], [0.05, 0.03], [0.04, 0.065], [0.034, 0.1], [0.02, 0.118], [0, 0.12]], 28);
    // arms leave the body sideways, bend at the elbow and hang down, getting thinner towards the hands
    const arm = tube([[-0.03, 0, 0], [0.06, 0.04, 0.01], [0.15, 0.03, 0.03], [0.22, -0.06, 0.05], [0.25, -0.19, 0.06]], 0.058, 0.019);
    const finger = (dx: number, dz: number): THREE.BufferGeometry => tube([[0, 0, 0], [dx * 0.35, -0.04, dz * 0.35], [dx * 0.8, -0.085, dz * 0.8], [dx, -0.1, dz]], 0.011, 0.0045, 12);
    const fingers = [finger(-0.03, 0.025), finger(0.012, 0.035), finger(0.04, -0.005)];
    const legSit = tube([[0, 0.05, 0], [0, -0.04, 0.07], [0.01, -0.07, 0.2], [0.02, -0.2, 0.26], [0.03, -0.38, 0.27]], 0.1, 0.075);
    const legStand = tube([[-0.02, 0.06, 0], [0.0, -0.07, 0.0], [0.04, -0.19, 0.0], [0.075, -0.3, 0.02]], 0.135, 0.08);
    return { body, nose, arm, fingers, legSit, legStand };
  }, []);
  const Foot = () => (
    <group>
      <P m={m.foot} s={[0.085, 0.04, 0.08]} />
      {[-0.5, -0.05, 0.45].map((a, i) => <P key={i} g="capsule" m={m.foot} p={[Math.sin(a) * 0.1, -0.012, 0.03 + Math.cos(a) * 0.1]} s={[0.026, 0.045, 0.02]} r={[Math.PI / 2, 0, -a]} />)}
    </group>
  );
  const wide = mood === 'happy' || mood === 'surprised';
  return (
    <group ref={set('root')}>
      <group ref={set('head')}>
        <mesh geometry={g.body} material={m.peelMat} />
        {/* big bulging eyes high on the face, set wide apart */}
        <group ref={set('eyes')} position={[0, 0.205, 0]}>
          <EyeBall p={[-0.108, 0, 0.245]} r={0.06} iris="#5b7fc4" lid={m.peelMat} lidAt={0.15} look={[-0.04, 0.0]} />
          <EyeBall p={[0.108, 0, 0.245]} r={0.06} iris="#5b7fc4" lid={m.peelMat} lidAt={0.15} look={[0.04, 0.0]} />
        </group>
        {/* a long bulbous nose with nostrils */}
        <mesh geometry={g.nose} material={m.peelMat} position={[0, 0.1, 0.305]} rotation={[Math.PI / 2 + 0.45, 0, 0]} />
        <P m={m.peelMat} p={[0, 0.17, 0.27]} s={[0.026, 0.06, 0.03]} r={[-0.35, 0, 0]} />
        <P m={m.nostril} p={[-0.022, 0.07, 0.325]} s={[0.011, 0.007, 0.008]} /><P m={m.nostril} p={[0.022, 0.07, 0.325]} s={[0.011, 0.007, 0.008]} />
        {/* the wide, flat, slightly open mouth with soft lips */}
        <group position={[0, -0.03, 0.3]} rotation={[0.12, 0, 0]}>
          <P m={m.mouthIn} s={[0.125, wide ? 0.034 : 0.02, 0.03]} />
          <P g="thinRing" m={m.peelMat} p={[0, 0, 0.006]} s={[0.13, wide ? 0.04 : 0.027, 0.3]} />
        </group>
      </group>
      {([-1, 1] as const).map((sd) => (
        <group key={sd} ref={set(sd < 0 ? 'armL' : 'armR')} position={[0.29 * sd, 0.07, 0.02]}>
          <group scale={[sd, 1, 1]}>
            <mesh geometry={g.arm} material={m.limb} />
            <group position={[0.25, -0.19, 0.06]}>
              <P m={m.limb} s={[0.022, 0.024, 0.02]} />
              {g.fingers.map((f, i) => <mesh key={i} geometry={f} material={m.limb} />)}
            </group>
          </group>
        </group>
      ))}
      {([-1, 1] as const).map((sd) => (
        <group key={'l' + sd} position={[0.15 * sd, -0.18, 0]}>
          <group scale={[sd, 1, 1]}>
            <mesh geometry={sit ? g.legSit : g.legStand} material={m.limb} />
            <group position={sit ? [0.03, -0.42, 0.3] : [0.07, -0.33, 0.06]} rotation={[0, 0.3, 0]}><Foot /></group>
          </group>
        </group>
      ))}
    </group>
  );
}

// ======================================================================
// AMMAR (chibi of his avatar)
// ======================================================================
export function AmmarFigure({ mood, seed, pose = 'sit' }: { mood: Mood; seed: number; pose?: 'sit' | 'stand' }) {
  const rig = useRef<Rig>({ root: null, head: null, armL: null, armR: null, eyes: null });
  useRigMotion(rig, mood, seed, { baseY: pose === 'sit' ? 0 : 0.25, armScale: pose === 'sit' ? 1 : 0.02 });
  const set = (k: keyof Rig) => (g: THREE.Group | null) => { rig.current[k] = g; };
  const c = useMemo(() => ({
    skin: S('#e7b08b', 0.7), skinD: S('#d49a76', 0.75), hair: S('#26170e', 0.85), hairHi: S('#4a2f1c', 0.8), beard: S('#9c6f55', 0.95), fade: S('#5e4334', 0.95),
    shirt: S('#18181b', 0.9), pants: S('#232326', 0.9), pocket: S('#1b1b1e', 0.9), shoe: S('#f3f1ec', 0.6), sole: S('#bdbab4', 0.7), swoosh: S('#8d8d92', 0.6),
    glass: S('#cdb889', 0.35, 0.6), chain: S('#d9dde2', 0.25, 0.95), watch: S('#2b2b2e', 0.4, 0.4), mouth: S('#7a3a2c', 0.8), lens: mat('lens', () => new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, roughness: 0.05 })),
    brow: S('#1d130d', 0.9), strap: S('#0f0f11', 0.9),
  }), []);
  const g = useMemo(() => {
    const torso = lathe([[0, -0.27], [0.15, -0.27], [0.165, -0.2], [0.17, -0.05], [0.18, 0.08], [0.17, 0.15], [0.12, 0.2], [0.05, 0.215], [0, 0.215]], 36);
    // curls: many small spheres on the top and front of the head (fixed pseudo-random layout)
    const curls: { p: V3; r: number; hi: boolean }[] = [];
    let sd = 11; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) {
      const th = rnd() * Math.PI * 2, ph = rnd() * 0.85; // a tall curly crown on top only (the sides are a short fade)
      const x = Math.sin(ph) * Math.cos(th), z = Math.sin(ph) * Math.sin(th), y = Math.cos(ph);
      curls.push({ p: [x * 0.178, 0.11 + y * 0.165, z * 0.16 - 0.01], r: 0.036 + rnd() * 0.022, hi: rnd() < 0.4 });
    }
    // curls tumbling forward over the top of the forehead (above the brows)
    for (let i = 0; i < 8; i++) curls.push({ p: [-0.1 + i * 0.029, 0.195 + (i % 2) * 0.014, 0.125 - Math.abs(i - 3.5) * 0.01], r: 0.032 + (i % 3) * 0.006, hi: i % 2 === 1 });
    const temple = (sdx: number) => tube([[0.13 * sdx, 0.0, 0.17], [0.17 * sdx, 0.005, 0.1], [0.178 * sdx, 0.0, 0.0]], 0.0045);
    const thigh = new THREE.CapsuleGeometry(0.068, 0.2, 6, 14);
    const shin = new THREE.CapsuleGeometry(0.062, 0.22, 6, 14);
    return { torso, curls, templeL: temple(-1), templeR: temple(1), thigh, shin };
  }, []);
  const sit = pose === 'sit';
  const Leg = ({ sd }: { sd: 1 | -1 }) => (
    <group position={[0.075 * sd, -0.27, 0]} rotation={[sit ? -Math.PI / 2 + 0.08 : 0, 0, 0]}>
      <P g={g.thigh} m={c.pants} p={[0, -0.13, 0]} />
      <P g="sphLo" m={c.pocket} p={[0.06 * sd, -0.14, 0.0]} s={[0.018, 0.06, 0.05]} />
      <group position={[0, -0.28, 0]} rotation={[sit ? Math.PI / 2 - 0.08 : 0, 0, 0]}>
        <P g={g.shin} m={c.pants} p={[0, -0.14, 0]} />
        {/* white sneakers */}
        <group position={[0, -0.32, 0.035]}>
          <P g="capsule" m={c.shoe} s={[0.06, 0.08, 0.05]} r={[Math.PI / 2, 0, 0]} />
          <P m={c.sole} p={[0, -0.04, 0.01]} s={[0.065, 0.018, 0.115]} />
          <P m={c.swoosh} p={[0.058 * sd, 0.0, 0.0]} s={[0.004, 0.012, 0.045]} r={[0.3, 0, 0]} />
        </group>
      </group>
    </group>
  );
  const Arm = ({ sd }: { sd: 1 | -1 }) => (
    <group ref={set(sd < 0 ? 'armL' : 'armR')} position={[0.19 * sd, 0.15, 0]}>
      <P m={c.shirt} p={[0, -0.03, 0]} s={[0.07, 0.07, 0.07]} />
      <P g="cyl" m={c.shirt} p={[0, -0.075, 0]} s={[0.058, 0.1, 0.058]} />
      <P g="capsule" m={c.skin} p={[0, -0.18, 0]} s={[0.04, 0.12, 0.04]} />
      {sd < 0 && <P g="cyl" m={c.watch} p={[0, -0.235, 0]} s={[0.045, 0.025, 0.045]} />}
      <P m={c.skin} p={[0, -0.275, 0.005]} s={[0.045, 0.05, 0.04]} />
    </group>
  );
  const happy = mood === 'happy';
  return (
    <group ref={set('root')}>
      {/* body: black tee, backpack straps, silver chain */}
      <mesh geometry={g.torso} material={c.shirt} />
      {([-1, 1] as const).map((sd) => <P key={sd} m={c.strap} p={[0.11 * sd, 0.08, 0.13]} s={[0.022, 0.13, 0.03]} r={[0.25, 0, -0.08 * sd]} />)}
      <P g="chain" m={c.chain} p={[0, 0.17, 0.07]} s={[0.075, 0.085, 0.06]} r={[1.15, 0, 0]} />
      <P g="cyl" m={c.skin} p={[0, 0.235, 0]} s={[0.055, 0.06, 0.055]} />
      <Arm sd={-1} /><Arm sd={1} />
      <Leg sd={-1} /><Leg sd={1} />
      {/* big chibi head */}
      <group ref={set('head')} position={[0, 0.44, 0]} scale={1.18}>
        <P m={c.skin} s={[0.18, 0.2, 0.175]} />
        {/* ears */}
        <P m={c.skinD} p={[-0.185, -0.01, 0]} s={[0.03, 0.045, 0.025]} /><P m={c.skinD} p={[0.185, -0.01, 0]} s={[0.03, 0.045, 0.025]} />
        {/* short fade on the sides + curls on top */}
        <P m={c.fade} p={[0, 0.05, -0.02]} s={[0.188, 0.175, 0.18]} />
        <P m={c.skin} p={[0, 0.0, 0.03]} s={[0.179, 0.175, 0.162]} />
        {g.curls.map((q, i) => <P key={i} g="sphLo" m={q.hi ? c.hairHi : c.hair} p={q.p} s={q.r} />)}
        {/* brows, eyes, glasses */}
        <P g="capsule" m={c.brow} p={[-0.07, 0.088, 0.16]} s={[0.014, 0.018, 0.012]} r={[0, 0, Math.PI / 2 - 0.15]} />
        <P g="capsule" m={c.brow} p={[0.07, 0.088, 0.16]} s={[0.014, 0.018, 0.012]} r={[0, 0, Math.PI / 2 + 0.15]} />
        <group ref={set('eyes')} position={[0, 0.015, 0]}>
          <EyeBall p={[-0.068, 0, 0.138]} r={0.04} iris="#4a2c1a" />
          <EyeBall p={[0.068, 0, 0.138]} r={0.04} iris="#4a2c1a" />
        </group>
        <P g="thinRing" m={c.glass} p={[-0.07, 0.014, 0.182]} s={[0.064, 0.06, 0.04]} />
        <P g="thinRing" m={c.glass} p={[0.07, 0.014, 0.182]} s={[0.064, 0.06, 0.04]} />
        <P g="cyl" m={c.lens} p={[-0.07, 0.014, 0.182]} s={[0.061, 0.003, 0.057]} r={[Math.PI / 2, 0, 0]} />
        <P g="cyl" m={c.lens} p={[0.07, 0.014, 0.182]} s={[0.061, 0.003, 0.057]} r={[Math.PI / 2, 0, 0]} />
        <P g="cyl" m={c.glass} p={[0, 0.025, 0.187]} s={[0.004, 0.02, 0.004]} r={[0, 0, Math.PI / 2]} />
        <mesh geometry={g.templeL} material={c.glass} position={[0, 0.02, 0]} /><mesh geometry={g.templeR} material={c.glass} position={[0, 0.02, 0]} />
        {/* nose, moustache, mouth, short beard */}
        <P m={c.skinD} p={[0, -0.025, 0.183]} s={[0.019, 0.024, 0.02]} />
        <P m={c.skin} p={[0, -0.08, 0.03]} s={[0.125, 0.12, 0.135]} />
        <P m={c.beard} p={[0, -0.09, 0.03]} s={[0.118, 0.114, 0.13]} />
        <P m={c.skin} p={[0, -0.084, 0.034]} s={[0.117, 0.113, 0.131]} />
        <P g="capsule" m={c.brow} p={[-0.022, -0.056, 0.176]} s={[0.008, 0.009, 0.008]} r={[0, 0, Math.PI / 2 - 0.3]} />
        <P g="capsule" m={c.brow} p={[0.022, -0.056, 0.176]} s={[0.008, 0.009, 0.008]} r={[0, 0, Math.PI / 2 + 0.3]} />
        <P m={c.mouth} p={[0, -0.083, 0.172]} s={[happy ? 0.03 : 0.02, happy ? 0.011 : 0.004, 0.008]} />
        <P m={c.beard} p={[0, -0.112, 0.162]} s={[0.022, 0.012, 0.01]} />
      </group>
    </group>
  );
}
