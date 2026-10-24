// The Orange waiter (sketch book v8 p22–27, W1–W6): a third Orange guy who strolls in from the kitchen door
// along the outer stone patio corridors (STOP_R = 2.46, LOOP_R = 2.62 on the patio floor y = -0.42, strictly outside
// the table and chairs with >150px screen-space separation from the tabletop), visiting EVERY seated player's teacup
// one by one during a 60-second active tour, then stepping off-screen for a 60-second break and returning in the next outfit!
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { PlayerView } from '@marlivo/engine';
import type { Layout3, V3 } from '../layout3d';
import { loadManifest, entryFor, loadModel, normalise } from '../registry';
import {
  findArms,
  findLegs,
  poseLeg,
  computeWalkGait,
  solveArm,
  curlArm,
  resetArm,
  stepArmSmoothing,
  handPos,
  triggerEmote,
  activeEmoteFor,
  type ArmChain,
  type LegChain,
  type Side,
} from '../actors';
import type { FaceShaderUniform } from '../Figures';
import { attachBlinkShader } from '../Figures';
import { propLayout } from './propLayout';
import { refillTea } from './tea';
import { shadowMat } from './props';
import {
  WAITER_OUTFITS,
  OUTFIT_ORDER,
  waiterOutfitForCycle,
  evaluateWaiterCycle,
  pickWaiterOutfit,
  pickRefillOrder,
  cupStopForSeat,
  computeWaiterStops,
  nearestStop,
  KITCHEN_DOOR,
  KITCHEN_DOOR_R,
  WAITER_FLOOR_Y,
  LOOP_R,
  REFILL_POUR,
  REFILL_WALK,
  WAITER_ACTIVE_SEC,
  WAITER_AWAY_SEC,
  WAITER_CYCLE_SEC,
  type WaiterOutfit,
  type WaiterStop,
} from './waiterPath';

export type WaiterActionKind = 'visit' | 'refill' | 'shuffle' | 'roundEnd' | 'medal';

export interface WaiterJob {
  kind: WaiterActionKind;
  outfit: WaiterOutfit;
  startedAt: number;
  duration: number;
  winner?: number;
  loser?: number;
  lockedProgress?: number;
  refillOrder?: number[];
  cycleIndex?: number;
}

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x: number) => { x = clamp(x); return x * x * (3 - 2 * x); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const normAngle = (a: number) => {
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
};

/** Builds a contoured 3D garment shell matching the exact measured cross-section of orange-guy.glb (height=0.80, baseY=0),
 *  rising up over the chest/shoulders/back (yMax ~ 0.49) and dipping smoothly below the mouth at the front center (y ~ 0.38). */
function makeTorsoShell(
  yMin: number,
  yMax: number,
  pad = 0.006,
  openFrontW = 0,
  frontOnly = false,
  frontDip = 0,
): THREE.BufferGeometry {
  const PROF = [
    { y: 0.300, rx: 0.216, cz: -0.020, rz: 0.172 },
    { y: 0.320, rx: 0.222, cz: -0.017, rz: 0.195 },
    { y: 0.340, rx: 0.228, cz: -0.016, rz: 0.208 },
    { y: 0.360, rx: 0.238, cz: -0.016, rz: 0.216 },
    { y: 0.380, rx: 0.252, cz: -0.016, rz: 0.224 },
    { y: 0.400, rx: 0.270, cz: -0.015, rz: 0.232 },
    { y: 0.425, rx: 0.280, cz: -0.012, rz: 0.242 },
    { y: 0.450, rx: 0.285, cz: -0.008, rz: 0.250 },
    { y: 0.480, rx: 0.286, cz: -0.006, rz: 0.255 },
    { y: 0.515, rx: 0.280, cz: -0.008, rz: 0.254 },
    { y: 0.550, rx: 0.268, cz: -0.010, rz: 0.248 },
  ];
  const interp = (y: number) => {
    if (y <= PROF[0]!.y) return PROF[0]!;
    if (y >= PROF[PROF.length - 1]!.y) return PROF[PROF.length - 1]!;
    for (let i = 0; i < PROF.length - 1; i++) {
      const a = PROF[i]!, b = PROF[i + 1]!;
      if (y >= a.y && y <= b.y) {
        const t = (y - a.y) / (b.y - a.y);
        return { y, rx: a.rx + (b.rx - a.rx) * t, cz: a.cz + (b.cz - a.cz) * t, rz: a.rz + (b.rz - a.rz) * t };
      }
    }
    return PROF[0]!;
  };
  const rings = 12, segs = 32;
  const pos: number[] = [], idx: number[] = [];
  for (let ir = 0; ir <= rings; ir++) {
    const f = ir / rings;
    for (let is = 0; is <= segs; is++) {
      let ang: number;
      if (frontOnly) {
        const halfSpan = Math.max(0.24, openFrontW * (0.65 + 0.35 * f));
        ang = -halfSpan + (is / segs) * (2 * halfSpan);
      } else {
        const a0 = openFrontW * (0.22 + 0.78 * f);
        ang = a0 + (is / segs) * (Math.PI * 2 - 2 * a0);
      }
      const angNorm = Math.atan2(Math.sin(ang), Math.cos(ang));
      const dip = frontDip * Math.exp(-Math.pow(angNorm / 0.46, 2));
      const yTop = yMax - dip;
      const y = yMin + (yTop - yMin) * f;
      const p = interp(y);
      const rx = p.rx + pad, rz = p.rz + pad;
      pos.push(Math.sin(ang) * rx, y, p.cz + Math.cos(ang) * rz);
    }
  }
  const stride = segs + 1;
  for (let ir = 0; ir < rings; ir++) {
    for (let is = 0; is < segs; is++) {
      const i0 = ir * stride + is;
      const i1 = i0 + 1;
      const i2 = i0 + stride;
      const i3 = i2 + 1;
      idx.push(i0, i1, i2, i1, i3, i2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const WG = {
  shirtBib: makeTorsoShell(0.312, 0.516, 0.012, 0.62, true, 0.056),
  vestShell: makeTorsoShell(0.308, 0.542, 0.017, 0.30, false, 0.082),
  jacketShell: makeTorsoShell(0.304, 0.548, 0.019, 0.28, false, 0.086),
  chefShell: makeTorsoShell(0.304, 0.546, 0.017, 0.0, false, 0.084),
  apronShell: makeTorsoShell(0.302, 0.382, 0.021, 0.0, false, 0.0),
  apronFront: makeTorsoShell(0.304, 0.378, 0.025, 0.54, true, 0.0),
  fez: new THREE.CylinderGeometry(0.78, 1.0, 1, 20),
  sph: new THREE.SphereGeometry(1, 18, 14),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 20),
  cone: new THREE.ConeGeometry(1, 1, 14),
  box: new THREE.BoxGeometry(1, 1, 1),
  rbox: new RoundedBoxGeometry(1, 1, 1, 2, 0.12),
  torus: new THREE.TorusGeometry(1, 0.22, 8, 24),
  arc: new THREE.TorusGeometry(1, 0.14, 8, 20, Math.PI * 1.15),
  card: new THREE.BoxGeometry(0.068, 0.002, 0.096),
  confetti: new THREE.PlaneGeometry(0.036, 0.024),
  shadow: new THREE.PlaneGeometry(0.62, 0.48).rotateX(-Math.PI / 2),
};

const WM = {
  orange: new THREE.MeshLambertMaterial({ color: '#f39a2e', emissive: '#1e0d02' }),
  white: new THREE.MeshLambertMaterial({ color: '#fbfaf5', emissive: '#22201c' }),
  towel: new THREE.MeshLambertMaterial({ color: '#f7f4eb', emissive: '#201e1a', side: THREE.DoubleSide }),
  black: new THREE.MeshLambertMaterial({ color: '#18191f', emissive: '#060608' }),
  navy: new THREE.MeshLambertMaterial({ color: '#1d2d4e', emissive: '#070c18' }),
  crimson: new THREE.MeshLambertMaterial({ color: '#a81e26', emissive: '#240508' }),
  emerald: new THREE.MeshLambertMaterial({ color: '#1f6e46', emissive: '#061c10' }),
  fezRed: new THREE.MeshLambertMaterial({ color: '#8e1620', emissive: '#220306' }),
  satin: new THREE.MeshPhongMaterial({ color: '#242630', specular: '#777a88', shininess: 60 }),
  silver: new THREE.MeshPhongMaterial({ color: '#d8dee8', specular: '#ffffff', shininess: 110, emissive: '#1a1e24' }),
  redTie: new THREE.MeshLambertMaterial({ color: '#d4282c', emissive: '#280406' }),
  gold: new THREE.MeshPhongMaterial({ color: '#ecc044', specular: '#fff4c2', shininess: 95, emissive: '#382806' }),
  star: new THREE.MeshPhongMaterial({ color: '#fff0a6', specular: '#ffffff', shininess: 110, emissive: '#4a3608' }),
  velvet: new THREE.MeshLambertMaterial({ color: '#a81c28', emissive: '#280408' }),
  ribbon: new THREE.MeshLambertMaterial({ color: '#2860c8', emissive: '#081838', side: THREE.DoubleSide }),
  porcelain: new THREE.MeshPhongMaterial({ color: '#fcfaf5', specular: '#ffffff', shininess: 80, emissive: '#2c2620' }),
  amber: new THREE.MeshPhongMaterial({ color: '#c86418', specular: '#ffe0b2', shininess: 110, emissive: '#421a04', transparent: true, opacity: 0.94 }),
  steam: new THREE.MeshBasicMaterial({ color: '#fffaf0', transparent: true, opacity: 0.52 }),
  glass: new THREE.MeshPhongMaterial({ color: '#c8ecff', specular: '#ffffff', shininess: 100, transparent: true, opacity: 0.58 }),
  water: new THREE.MeshPhongMaterial({ color: '#4cb2ff', specular: '#e8f8ff', shininess: 90, emissive: '#0c3458' }),
  waterHi: new THREE.MeshBasicMaterial({ color: '#a8e0ff' }),
  cardBack: new THREE.MeshLambertMaterial({ color: '#2b569a', emissive: '#0a1830' }),
  cardEdge: new THREE.MeshLambertMaterial({ color: '#f5ead6' }),
  wink: new THREE.MeshBasicMaterial({ color: '#d8761c' }),
};

/** 6 bold, visually distinct waiter outfits contoured directly to the exact surface of `orange-guy.glb` (height=0.80, baseY=0):
 *  - Crown dome sits at y = 0.735..0.800 (radius 0.160 at y=0.738); forehead above eyes sits at y = 0.632 (rx=0.228, rz=0.220);
 *  - Chest / torso shell rises from y = 0.304 (above the leg hip joints at y=0.255) up to y = 0.495 across the shoulders/sides/back,
 *    with a tailored V-neck dipping to y = 0.382 right below the mouth (y=0.395..0.415) so the vest, jacket, chef coat, shirt bib,
 *    bow-tie, necktie, and apron hug his orange torso snugly from every camera angle without floating or sagging! */
function OutfitMeshes({
  outfit,
  showTowel,
  towelRef,
}: {
  outfit: WaiterOutfit;
  showTowel: boolean;
  towelRef?: React.RefObject<THREE.Group>;
}) {
  const hasBowTie = outfit === 'full' || outfit === 'tuxedo';
  const hasNeckTie = outfit === 'suit' || outfit === 'tie';
  const hasShirt = outfit === 'full' || outfit === 'suit' || outfit === 'tuxedo' || outfit === 'tie';
  const hasVest = outfit === 'full' || outfit === 'tie';
  const vestMat = outfit === 'tie' ? WM.crimson : WM.black;
  const hasApron = outfit === 'full' || outfit === 'plain' || outfit === 'chef';
  const apronMat = outfit === 'plain' ? WM.emerald : WM.white;
  const hasJacket = outfit === 'suit' || outfit === 'tuxedo' || outfit === 'chef';
  const jacketMat = outfit === 'tuxedo' ? WM.black : outfit === 'chef' ? WM.white : WM.navy;

  return (
    <group>
      {/* ---- DISTINCT HEADPIECES / HATS (snugly enclosing the crown dome y=0.736..0.800 or forehead y=0.632) ---- */}
      {outfit === 'full' && (
        // Classic Bellhop / Waiter Pillbox Cap in black & gold seated snugly over the crown (y=0.738..0.814, r=0.162)
        <group position={[0, 0.752, -0.022]} rotation={[-0.03, 0, 0.03]}>
          <mesh geometry={WG.cyl} material={WM.black} scale={[0.178, 0.076, 0.178]} />
          <mesh geometry={WG.sph} material={WM.black} position={[0, 0.032, 0]} scale={[0.178, 0.026, 0.178]} />
          <mesh geometry={WG.cyl} material={WM.gold} position={[0, -0.029, 0]} scale={[0.182, 0.018, 0.182]} />
          <mesh geometry={WG.sph} material={WM.gold} position={[0, 0.056, 0]} scale={0.020} />
        </group>
      )}
      {outfit === 'suit' && (
        // Tall Burgundy Tapered Fez Hat with Gold Tassel seated snugly over the crown (y=0.737..0.855, base r=0.164)
        <group position={[0, 0.772, -0.022]} rotation={[-0.03, 0, -0.03]}>
          <mesh geometry={WG.fez} material={WM.fezRed} scale={[0.178, 0.114, 0.178]} />
          <mesh geometry={WG.cyl} material={WM.gold} position={[0, -0.048, 0]} scale={[0.181, 0.016, 0.181]} />
          <mesh geometry={WG.sph} material={WM.gold} position={[0, 0.060, 0]} scale={0.020} />
          <mesh geometry={WG.cyl} material={WM.gold} position={[0.112, 0.010, 0.02]} rotation={[0, 0, -0.48]} scale={[0.014, 0.082, 0.014]} />
        </group>
      )}
      {outfit === 'tie' && (
        // Sporty Crimson & Gold Headband / Bandana hugging the forehead above the eyes (y=0.632, rx=0.228, rz=0.220)
        <group position={[0, 0.632, -0.024]}>
          <mesh geometry={WG.cyl} material={WM.redTie} scale={[0.232, 0.036, 0.224]} />
          <mesh geometry={WG.cyl} material={WM.gold} scale={[0.235, 0.012, 0.227]} />
          <mesh geometry={WG.sph} material={WM.redTie} position={[-0.225, -0.004, -0.04]} scale={[0.032, 0.028, 0.032]} />
          <mesh geometry={WG.cone} material={WM.redTie} position={[-0.252, -0.042, -0.05]} rotation={[0.18, 0, 0.45]} scale={[0.022, 0.064, 0.015]} />
        </group>
      )}
      {outfit === 'plain' && (
        // Emerald Bistro Sun Visor Cap with Gold Trim hugging the forehead above the eyes (y=0.632)
        <group position={[0, 0.632, -0.024]} rotation={[0.05, 0, 0]}>
          <mesh geometry={WG.cyl} material={WM.emerald} scale={[0.232, 0.036, 0.224]} />
          <mesh geometry={WG.cyl} material={WM.emerald} position={[0, -0.008, 0.168]} scale={[0.178, 0.012, 0.108]} />
          <mesh geometry={WG.cyl} material={WM.gold} position={[0, 0.010, 0]} scale={[0.235, 0.010, 0.227]} />
        </group>
      )}
      {outfit === 'tuxedo' && (
        // Sleek Black & Gold Silk Top Hat seated snugly over the crown (brim at y=0.740, cylinder r=0.160 covering y=0.740..0.885)
        <group position={[0, 0.718, -0.022]} rotation={[-0.03, 0, 0.02]}>
          <mesh geometry={WG.cyl} material={WM.black} position={[0, 0, 0]} scale={[0.236, 0.016, 0.236]} />
          <mesh geometry={WG.cyl} material={WM.gold} position={[0, 0.018, 0]} scale={[0.180, 0.026, 0.180]} />
          <mesh geometry={WG.cyl} material={WM.satin} position={[0, 0.074, 0]} scale={[0.176, 0.138, 0.176]} />
        </group>
      )}
      {outfit === 'chef' && (
        // Tall White Pleated Chef Toque Hat seated snugly over the crown (base r=0.164 covering y=0.736..0.810)
        <group position={[0, 0.718, -0.022]} rotation={[-0.03, 0, 0]}>
          <mesh geometry={WG.cyl} material={WM.white} position={[0, 0.032, 0]} scale={[0.178, 0.072, 0.178]} />
          <mesh geometry={WG.cyl} material={WM.gold} position={[0, 0.002, 0]} scale={[0.181, 0.012, 0.181]} />
          <mesh geometry={WG.sph} material={WM.white} position={[0, 0.096, 0]} scale={[0.204, 0.098, 0.204]} />
          <mesh geometry={WG.sph} material={WM.white} position={[-0.076, 0.106, 0.035]} scale={0.086} />
          <mesh geometry={WG.sph} material={WM.white} position={[0.076, 0.106, 0.035]} scale={0.086} />
        </group>
      )}

      {/* ---- CONTOURED TORSO SHELLS (y=0.304..0.496, hugging the chest/shoulders and dipping below mouth at y=0.382) ---- */}
      {hasShirt && (
        // Crisp white dress-shirt front bib contoured directly to the chest surface
        <mesh geometry={WG.shirtBib} material={WM.white} />
      )}
      {hasVest && (
        // Tailored V-neck waiter waistcoat wrapping around the contoured chest & shoulders
        <group>
          <mesh geometry={WG.vestShell} material={vestMat} />
          {[
            [0.350, 0.222],
            [0.390, 0.240],
            [0.430, 0.254],
          ].map(([y, z], i) => (
            <mesh key={i} geometry={WG.sph} material={WM.gold} position={[0, y!, z!]} scale={0.012} />
          ))}
        </group>
      )}
      {hasJacket && (
        // Tailored tuxedo / suit / double-breasted chef jacket contoured to the chest & shoulders
        <group>
          <mesh geometry={outfit === 'chef' ? WG.chefShell : WG.jacketShell} material={jacketMat} />
          {outfit !== 'chef' && (
            <>
              <mesh geometry={WG.box} material={outfit === 'tuxedo' ? WM.satin : WM.navy}
                position={[-0.068, 0.452, 0.252]} rotation={[-0.18, 0.22, -0.42]} scale={[0.032, 0.096, 0.010]} />
              <mesh geometry={WG.box} material={outfit === 'tuxedo' ? WM.satin : WM.navy}
                position={[0.068, 0.452, 0.252]} rotation={[-0.18, -0.22, 0.42]} scale={[0.032, 0.096, 0.010]} />
            </>
          )}
          {outfit === 'chef' && (
            // Red chef neckerchief around the collar under the chin
            <group position={[0, 0.448, 0.256]} rotation={[-0.12, 0, 0]}>
              <mesh geometry={WG.box} material={WM.redTie} position={[-0.042, 0.010, -0.004]} rotation={[0, 0, 0.42]} scale={[0.052, 0.018, 0.010]} />
              <mesh geometry={WG.box} material={WM.redTie} position={[0.042, 0.010, -0.004]} rotation={[0, 0, -0.42]} scale={[0.052, 0.018, 0.010]} />
              <mesh geometry={WG.sph} material={WM.redTie} scale={[0.018, 0.016, 0.014]} />
            </group>
          )}
          {(outfit === 'tuxedo' || outfit === 'chef') && [
            [0.370, 0.234],
            [0.418, 0.252],
          ].map(([y, z], i) => (
            <mesh key={i} geometry={WG.sph} material={outfit === 'chef' ? WM.black : WM.gold} position={[-0.034, y!, z!]} scale={0.012} />
          ))}
          {outfit === 'chef' && [
            [0.370, 0.234],
            [0.418, 0.252],
          ].map(([y, z], i) => (
            <mesh key={i} geometry={WG.sph} material={WM.black} position={[0.034, y!, z!]} scale={0.012} />
          ))}
        </group>
      )}
      {hasApron && (
        // Contoured bistro waist apron hugging the lower belly above the hips (y=0.300..0.370)
        <group>
          <mesh geometry={WG.apronShell} material={apronMat} />
          <mesh geometry={WG.apronFront} material={outfit === 'plain' ? WM.gold : WM.towel} />
        </group>
      )}
      {hasBowTie && (
        // Bow-tie seated flush on the V-neck shirt collar right below the mouth (y=0.380, z=0.200)
        <group position={[0, 0.446, 0.256]} rotation={[-0.14, 0, 0]}>
          <mesh geometry={WG.cone} material={outfit === 'tuxedo' ? WM.redTie : WM.black} position={[-0.034, 0, 0]} rotation={[0, 0, -Math.PI / 2]} scale={[0.025, 0.048, 0.014]} />
          <mesh geometry={WG.cone} material={outfit === 'tuxedo' ? WM.redTie : WM.black} position={[0.034, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.025, 0.048, 0.014]} />
          <mesh geometry={WG.sph} material={WM.gold} scale={[0.015, 0.015, 0.014]} />
        </group>
      )}
      {hasNeckTie && (
        // Silk necktie seated flush down the contoured shirt bib (y=0.380, z=0.200)
        <group position={[0, 0.446, 0.256]} rotation={[-0.18, 0, 0]}>
          <mesh geometry={WG.box} material={WM.white} position={[-0.034, 0.008, -0.004]} rotation={[0, 0, 0.38]} scale={[0.042, 0.018, 0.010]} />
          <mesh geometry={WG.box} material={WM.white} position={[0.034, 0.008, -0.004]} rotation={[0, 0, -0.38]} scale={[0.042, 0.018, 0.010]} />
          <mesh geometry={WG.sph} material={WM.redTie} scale={[0.017, 0.017, 0.014]} />
          <mesh geometry={WG.box} material={WM.redTie} position={[0, -0.034, 0.001]} scale={[0.026, 0.062, 0.008]} />
          <mesh geometry={WG.cone} material={WM.redTie} position={[0, -0.072, 0.001]} rotation={[0, 0, Math.PI]} scale={[0.019, 0.020, 0.008]} />
          <mesh geometry={WG.box} material={WM.gold} position={[0, -0.032, 0.007]} rotation={[0, 0, 0.45]} scale={[0.028, 0.008, 0.004]} />
        </group>
      )}
      {(showTowel || outfit === 'full' || outfit === 'tuxedo') && (
        <group ref={towelRef} position={[-0.28, 0.38, 0.18]} rotation={[0.1, 0.1, -0.05]}>
          {/* Silver serving tray balanced on the left hand + folded white waiter towel */}
          <mesh geometry={WG.cyl} material={WM.silver} position={[0, 0.025, 0.03]} scale={[0.125, 0.008, 0.125]} />
          <mesh geometry={WG.torus} material={WM.gold} position={[0, 0.03, 0.03]} rotation={[Math.PI / 2, 0, 0]} scale={0.125} />
          <mesh geometry={WG.rbox} material={WM.towel} position={[-0.02, -0.03, -0.01]} scale={[0.05, 0.12, 0.075]} />
          <mesh geometry={WG.box} material={WM.gold} position={[-0.02, -0.075, 0.032]} scale={[0.052, 0.008, 0.005]} />
        </group>
      )}
    </group>
  );
}

function TeapotProp({ pouring, propRef }: { pouring: boolean; propRef?: React.RefObject<THREE.Group> }) {
  return (
    <group ref={propRef} position={[0.25, 0.40, 0.18]} rotation={[pouring ? 0.72 : 0.08, -0.22, pouring ? -0.78 : 0]}>
      <mesh geometry={WG.sph} material={WM.porcelain} scale={[0.082, 0.074, 0.082]} />
      <mesh geometry={WG.torus} material={WM.gold} position={[0, 0.056, 0]} rotation={[Math.PI / 2, 0, 0]} scale={0.048} />
      <mesh geometry={WG.sph} material={WM.porcelain} position={[0, 0.065, 0]} scale={[0.045, 0.022, 0.045]} />
      <mesh geometry={WG.sph} material={WM.gold} position={[0, 0.086, 0]} scale={0.014} />
      <mesh geometry={WG.cyl} material={WM.porcelain} position={[0.082, 0.02, 0.02]} rotation={[0.2, 0, -0.75]} scale={[0.014, 0.082, 0.018]} />
      <mesh geometry={WG.arc} material={WM.porcelain} position={[-0.076, 0.005, -0.01]} rotation={[0, 0, Math.PI * 0.45]} scale={0.038} />
      {pouring && (
        <group>
          {/* Golden-amber tea stream pouring from spout toward the player's cup */}
          <mesh geometry={WG.cyl} material={WM.amber} position={[0.145, -0.13, 0.045]} rotation={[0.12, 0, -0.18]} scale={[0.010, 0.30, 0.010]} />
          {/* Rising warm steam puffs */}
          <mesh geometry={WG.sph} material={WM.steam} position={[0.16, -0.05, 0.05]} scale={0.022} />
          <mesh geometry={WG.sph} material={WM.steam} position={[0.175, 0.01, 0.06]} scale={0.028} />
          <mesh geometry={WG.sph} material={WM.steam} position={[0.155, 0.07, 0.04]} scale={0.034} />
        </group>
      )}
    </group>
  );
}

function CardFlourishProp({ phase }: { phase: 'gather' | 'bridge' | 'set' }) {
  const cards = useMemo(() => Array.from({ length: 11 }, (_, i) => i / 10 - 0.5), []);
  return (
    <group position={[0, 0.40, 0.28]}>
      {phase === 'bridge' ? (
        <>
          {cards.map((u, i) => {
            const x = u * 0.36;
            const y = (1 - 4 * u * u) * 0.16;
            const z = (1 - 4 * u * u) * 0.04;
            return (
              <mesh key={i} geometry={WG.card} material={[WM.cardEdge, WM.cardEdge, WM.cardBack, WM.cardEdge, WM.cardEdge, WM.cardEdge]}
                position={[x, y, z]} rotation={[0.25, 0, -u * 1.35]} />
            );
          })}
        </>
      ) : (
        <mesh geometry={WG.box} material={[WM.cardEdge, WM.cardEdge, WM.cardBack, WM.cardEdge, WM.cardEdge, WM.cardEdge]}
          position={[0, phase === 'set' ? -0.08 : 0, 0.05]} scale={[0.085, 0.035, 0.12]} />
      )}
    </group>
  );
}

function CushionAndMedal({ hasMedal, propRef }: { hasMedal: boolean; propRef?: React.RefObject<THREE.Group> }) {
  return (
    <group ref={propRef} position={[0, 0.38, 0.26]} rotation={[0.18, 0, 0]}>
      <mesh geometry={WG.rbox} material={WM.velvet} scale={[0.22, 0.055, 0.18]} />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <mesh key={i} geometry={WG.sph} material={WM.gold} position={[sx! * 0.105, -0.005, sz! * 0.085]} scale={[0.018, 0.026, 0.018]} />
      ))}
      {hasMedal && (
        <group position={[0, 0.034, 0.01]} rotation={[-Math.PI / 2 + 0.15, 0, 0]}>
          <GoldMedalMesh />
        </group>
      )}
    </group>
  );
}

export function GoldMedalMesh({ worn = false }: { worn?: boolean }) {
  return (
    <group scale={worn ? 1.15 : 1}>
      <mesh geometry={WG.box} material={WM.ribbon} position={[-0.028, 0.065, -0.004]} rotation={[0, 0, -0.38]} scale={[0.022, 0.12, 0.004]} />
      <mesh geometry={WG.box} material={WM.ribbon} position={[0.028, 0.065, -0.004]} rotation={[0, 0, 0.38]} scale={[0.022, 0.12, 0.004]} />
      <mesh geometry={WG.cyl} material={WM.gold} rotation={[Math.PI / 2, 0, 0]} scale={[0.042, 0.01, 0.042]} />
      {[0, 1, 2, 3, 4].map((k) => {
        const a = (k / 5) * Math.PI * 2;
        return (
          <mesh key={k} geometry={WG.cone} material={WM.star}
            position={[Math.sin(a) * 0.012, Math.cos(a) * 0.012, 0.007]}
            rotation={[0, 0, -a]} scale={[0.009, 0.022, 0.006]} />
        );
      })}
    </group>
  );
}

function useWaiterModel(level: 'high' | 'low') {
  const container = useMemo(() => {
    const g = new THREE.Group();
    const egg = new THREE.Mesh(WG.sph, WM.orange);
    egg.scale.set(0.24, 0.34, 0.21);
    egg.position.y = 0.36;
    egg.name = 'fallback-egg';
    g.add(egg);
    return g;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const m = await loadManifest();
      const e = entryFor(m, 'tango');
      const gltf = await loadModel(e, level);
      if (!alive || !gltf) return;
      const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
      const obj = clone(gltf.scene);
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.frustumCulled = false;
          const mt = mesh.material as THREE.MeshStandardMaterial;
          if (mt?.isMeshStandardMaterial) mt.metalness = 0;
        }
      });
      const blinkU = attachBlinkShader(obj, 'tango', e.rotationY ?? 0);
      normalise(obj, { ...e, height: 0.80, baseY: 0 });
      const arms = findArms(obj);
      const legs = findLegs(obj);
      const fb = container.getObjectByName('fallback-egg');
      if (fb) container.remove(fb);
      container.userData.waiterRig = { arms, legs, blinkU };
      container.add(obj);
    })();
    return () => { alive = false; };
  }, [container, level]);

  return container;
}

export const OrangeWaiter = memo(function OrangeWaiter({ L, view, level }: { L: Layout3; view?: PlayerView; level: 'high' | 'low' }) {
  const model = useWaiterModel(level);
  const rootRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const splashRef = useRef<THREE.Group>(null);
  const confettiRef = useRef<THREE.Group>(null);
  const towelRef = useRef<THREE.Group>(null);
  const teapotRef = useRef<THREE.Group>(null);
  const cushionRef = useRef<THREE.Group>(null);
  const glassRef = useRef<THREE.Mesh>(null);

  const stops = useMemo(() => computeWaiterStops(L), [L]);
  const props = useMemo(() => propLayout(L), [L]);
  const [job, setJob] = useState<WaiterJob | null>(null);
  const [medalWinner, setMedalWinner] = useState<number | null>(null);
  const clockRef = useRef(0);
  const lastOutfitRef = useRef<WaiterOutfit | undefined>(undefined);
  const prevPosRef = useRef<V3>([...KITCHEN_DOOR] as V3);
  const walkPhaseRef = useRef(0);
  const strideSmoothRef = useRef(0);
  const prevRoundRef = useRef<number>(view?.roundNo ?? 0);
  const prevResultRef = useRef<boolean>(false);
  const prevPhaseRef = useRef<string>(view?.phase ?? '');

  const startJob = (
    kind: WaiterActionKind,
    opts: { outfit?: WaiterOutfit; winner?: number; loser?: number; progress?: number; duration?: number; cycleIndex?: number } = {}
  ) => {
    const outfit = opts.outfit ?? (opts.cycleIndex !== undefined ? waiterOutfitForCycle(opts.cycleIndex) : pickWaiterOutfit(Math.random, lastOutfitRef.current));
    lastOutfitRef.current = outfit;
    const cupSeats = pickRefillOrder(L, Object.keys(props.tea).map(Number));
    const durations: Record<WaiterActionKind, number> = {
      visit: 11,
      refill: opts.duration ?? WAITER_ACTIVE_SEC,
      shuffle: 10,
      roundEnd: 12,
      medal: 13,
    };
    const seats = Object.keys(L.seats).map(Number).sort((a, b) => a - b);
    const winner = opts.winner ?? view?.matchWinner ?? view?.round?.result?.winner ?? seats[0] ?? 0;
    const loser = opts.loser ?? seats.find((s) => s !== winner) ?? seats[seats.length - 1] ?? 1;
    if (kind === 'medal') setMedalWinner(winner);
    setJob({
      kind,
      outfit,
      startedAt: clockRef.current,
      duration: durations[kind],
      winner,
      loser,
      lockedProgress: opts.progress,
      refillOrder: cupSeats,
      cycleIndex: opts.cycleIndex,
    });
  };

  useEffect(() => {
    const api = {
      outfits: WAITER_OUTFITS,
      outfitOrder: OUTFIT_ORDER,
      stops,
      job,
      cycleSpec: { activeSec: WAITER_ACTIVE_SEC, awaySec: WAITER_AWAY_SEC, cycleSec: WAITER_CYCLE_SEC },
      state: () => ({
        job,
        lastOutfit: lastOutfitRef.current,
        refillOrder: pickRefillOrder(L, Object.keys(props.tea).map(Number)),
        pos: rootRef.current ? [rootRef.current.position.x, rootRef.current.position.y, rootRef.current.position.z] : null,
        yaw: rootRef.current ? rootRef.current.rotation.y : 0,
        legL: (() => { const l = model.userData.waiterRig?.legs?.L; return l ? { hip: l.hip.quaternion.toArray(), knee: l.knee.quaternion.toArray(), foot: l.foot.quaternion.toArray() } : null; })(),
        legR: (() => { const l = model.userData.waiterRig?.legs?.R; return l ? { hip: l.hip.quaternion.toArray(), knee: l.knee.quaternion.toArray(), foot: l.foot.quaternion.toArray() } : null; })(),
      }),
      trigger: (kind: WaiterActionKind, opts?: { outfit?: WaiterOutfit; winner?: number; loser?: number; progress?: number; duration?: number }) => startJob(kind, opts),
      setProgress: (p?: number) => setJob((cur) => (cur ? { ...cur, lockedProgress: p } : cur)),
      stop: () => setJob(null),
    };
    (window as unknown as { __mlWaiter?: typeof api }).__mlWaiter = api;
  });

  useEffect(() => {
    if (!view) return;
    if (view.phase !== 'MATCH_END') setMedalWinner(null);
    if (view.phase === 'MATCH_END' && prevPhaseRef.current !== 'MATCH_END' && view.matchWinner !== null) {
      startJob('medal', { winner: view.matchWinner, outfit: 'tuxedo' });
    } else if (view.round?.result && !prevResultRef.current) {
      const w = view.round.result.winner;
      const seats = Object.keys(L.seats).map(Number);
      const l = seats.find((s) => s !== w) ?? 0;
      startJob('roundEnd', { winner: w ?? 0, loser: l });
    } else if (view.roundNo && view.roundNo !== prevRoundRef.current && prevRoundRef.current > 0) {
      startJob('shuffle');
    }
    prevRoundRef.current = view.roundNo ?? 0;
    prevResultRef.current = !!view.round?.result;
    prevPhaseRef.current = view.phase;
  }, [view?.phase, view?.roundNo, !!view?.round?.result, view?.matchWinner]);

  const [flags, setFlags] = useState<{
    visible: boolean;
    pouring: boolean;
    wink: boolean;
    flourish: 'gather' | 'bridge' | 'set' | null;
    cushionMedal: 'none' | 'with' | 'empty';
    glass: boolean;
    splash: boolean;
    confetti: 'none' | 'multi' | 'gold';
  }>({ visible: false, pouring: false, wink: false, flourish: null, cushionMedal: 'none', glass: false, splash: false, confetti: 'none' });

  const dropsSpec = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    phase: (i / 18) * 0.4,
    ox: ((i * 7) % 11 - 5) * 0.025,
    oy: ((i * 5) % 9 - 4) * 0.022,
    oz: ((i * 3) % 7 - 3) * 0.025,
    r: 0.02 + (i % 3) * 0.008,
  })), []);

  const confettiSpec = useMemo(() => {
    const multiCols = ['#ffd23f', '#ff5a6e', '#3fb8ff', '#5ce07a', '#f78ae0'];
    const goldCols = ['#ffd84a', '#ffae24', '#fff2a6', '#e89a18'];
    return Array.from({ length: 34 }, (_, i) => {
      const a = (i / 34) * Math.PI * 2 + (i % 3) * 0.4;
      const rad = 0.08 + ((i * 13) % 17) * 0.018;
      return {
        dx: Math.cos(a) * rad,
        dz: Math.sin(a) * rad,
        y0: 0.76 + ((i * 7) % 11) * 0.04,
        rot: i * 1.1,
        multiMat: new THREE.MeshBasicMaterial({ color: multiCols[i % multiCols.length]!, side: THREE.DoubleSide }),
        goldMat: new THREE.MeshBasicMaterial({ color: goldCols[i % goldCols.length]!, side: THREE.DoubleSide }),
      };
    });
  }, []);

  useFrame((st, dt) => {
    const now = st.clock.elapsedTime;
    const d = dt > 0 && dt < 0.25 ? dt : 1 / 60;
    clockRef.current = now;

    // Optional showcase/test time multiplier (default 1.0 in real gameplay: 60s active tour + 60s off-screen break)
    const timeScale = (typeof window !== 'undefined' && (window as unknown as { __MARLIVO_WAITER_TIME_SCALE__?: number }).__MARLIVO_WAITER_TIME_SCALE__) || 1;
    const cyc = evaluateWaiterCycle(now, timeScale);

    // If no manual/event job is locked, drive the automatic 60s-active / 60s-away refill cycle!
    if (!job) {
      if (cyc.active) {
        startJob('refill', { outfit: cyc.outfit, cycleIndex: cyc.cycleIndex, duration: WAITER_ACTIVE_SEC / timeScale });
        return;
      }
      if (rootRef.current) rootRef.current.visible = false;
      if (flags.visible) setFlags((f) => ({ ...f, visible: false, splash: false, confetti: 'none' }));
      return;
    }

    // For an automatic refill tour (no lockedProgress), sync directly with the 60s active window
    let u: number;
    if (job.lockedProgress !== undefined) {
      u = clamp(job.lockedProgress);
    } else if (job.kind === 'refill' && job.cycleIndex !== undefined) {
      if (!cyc.active || cyc.cycleIndex !== job.cycleIndex) {
        refillTea();
        setJob(null);
        if (rootRef.current) rootRef.current.visible = false;
        return;
      }
      u = cyc.progress;
    } else {
      u = clamp((now - job.startedAt) / job.duration);
      if (u >= 1) {
        if (job.kind === 'refill') refillTea();
        setJob(null);
        return;
      }
    }

    const doorForX = (x: number): V3 => (x >= 0 ? KITCHEN_DOOR_R : KITCHEN_DOOR);

    // Always keep waiter angled toward the table/camera so his face and front outfit are clearly visible
    const faceTableYaw = (x: number, z: number, moveDx = 0): number => {
      const baseYaw = Math.atan2(-x * 0.55, 0.45 - z);
      return baseYaw + clamp(moveDx * 0.45, -0.28, 0.28);
    };

    const walkPos = (from: V3, to: V3, k: number): [V3, number] => {
      const t = ease(k);
      const x = lerp(from[0], to[0], t);
      const z = lerp(from[2], to[2], t);
      const yaw = faceTableYaw(x, z, to[0] - from[0]);
      return [[x, WAITER_FLOOR_Y, z], yaw];
    };

    // Route between stops strictly within the left or right open stone patio corridors (|x| >= 1.66),
    // never crossing x = 0 behind Seat 2 over the tabletop rim!
    const walkPatioCorridor = (stFrom: WaiterStop, stTo: WaiterStop, k: number): [V3, number] => {
      const x0 = stFrom.standPos[0], z0 = stFrom.standPos[2];
      const x1 = stTo.standPos[0], z1 = stTo.standPos[2];
      if (x0 * x1 < 0) {
        if (k < 0.5) {
          const doorL = doorForX(x0);
          return walkPos(stFrom.standPos, doorL, k / 0.5);
        }
        const doorR = doorForX(x1);
        return walkPos(doorR, stTo.standPos, (k - 0.5) / 0.5);
      }
      const t = ease(k);
      const da = normAngle(stTo.angle - stFrom.angle);
      const a = stFrom.angle + da * t;
      const rFrom = Math.hypot(x0, z0);
      const rTo = Math.hypot(x1, z1);
      const r = lerp(rFrom, rTo, t) + Math.sin(Math.PI * t) * 0.06;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      const yaw = faceTableYaw(x, z, x1 - x0);
      return [[x, WAITER_FLOOR_Y, z], yaw];
    };

    // Angle waiter 3/4 toward the camera & table so his front outfit (bow-tie/tie, shirt, vest/jacket) is always visible
    const presentYaw = (standPos: V3, targetX: number, targetZ: number): number => {
      const lookX = lerp(targetX, 0, 0.35);
      const lookZ = Math.max(targetZ, 0.25);
      return Math.atan2(lookX - standPos[0], lookZ - standPos[2]);
    };

    const targetPosForSeat = (seat: number): V3 => {
      if (L.chars[seat]) {
        const c = L.chars[seat]!.p;
        return [c[0], 0.48, c[2]];
      }
      return [0.42, 0.35, 0.78];
    };

    let pos: V3 = [...KITCHEN_DOOR] as V3;
    let yaw = 0;
    let lean = 0;
    let pouring = false;
    let pourCupWorld: V3 | null = null;
    let isWalkingSeg = false;
    let wink = false;
    let flourish: 'gather' | 'bridge' | 'set' | null = null;
    let cushionMedal: 'none' | 'with' | 'empty' = 'none';
    let glass = false;
    let showSplash = false;
    let splashFrom: V3 = [0, 0, 0], splashTo: V3 = [0, 0, 0], splashU = 0;
    let confettiKind: 'none' | 'multi' | 'gold' = 'none';
    let confettiAt: V3 = [0, 0, 0], confettiU = 0;

    if (job.kind === 'visit') {
      const stp = stops.A;
      const door = doorForX(stp.standPos[0]);
      if (u < 0.28) {
        [pos, yaw] = walkPos(door, stp.standPos, u / 0.28);
        isWalkingSeg = true;
      } else if (u < 0.55) {
        pos = stp.standPos;
        yaw = presentYaw(pos, 0, 0);
        lean = 0.06;
      } else if (u < 0.78) {
        pos = stp.standPos;
        yaw = Math.atan2(0 - pos[0], 2.2 - pos[2]);
        wink = true;
      } else {
        [pos, yaw] = walkPos(stp.standPos, door, (u - 0.78) / 0.22);
        isWalkingSeg = true;
      }
    } else if (job.kind === 'refill') {
      // Visit EVERY seated player's cup in circular order along the left and right open stone patio corridors!
      const order = job.refillOrder && job.refillOrder.length > 0
        ? job.refillOrder
        : pickRefillOrder(L, Object.keys(props.tea).map(Number));
      const seatStops = order.map((s) => cupStopForSeat(L, s, props.tea[s]?.p));
      const n = seatStops.length;
      const tEntry = 2.0;
      const tExit = 2.0;
      const totalT = tEntry + n * REFILL_POUR + Math.max(0, n - 1) * REFILL_WALK + tExit;
      const curT = u * totalT;

      if (curT < tEntry) {
        const st0 = seatStops[0]!;
        [pos, yaw] = walkPos(doorForX(st0.standPos[0]), st0.standPos, curT / tEntry);
        isWalkingSeg = true;
      } else if (curT >= totalT - tExit) {
        const stLast = seatStops[n - 1]!;
        const k = (curT - (totalT - tExit)) / tExit;
        [pos, yaw] = walkPos(stLast.standPos, doorForX(stLast.standPos[0]), k);
        isWalkingSeg = true;
      } else {
        const bodyT = curT - tEntry;
        const stepSpan = REFILL_POUR + REFILL_WALK;
        const seatIdx = Math.min(n - 1, Math.floor(bodyT / stepSpan));
        const localT = bodyT - seatIdx * stepSpan;
        const stCur = seatStops[seatIdx]!;
        const targetSeat = order[seatIdx]!;
        const cup = props.tea[targetSeat]?.p ?? [0, 0, 0];

        if (localT < REFILL_POUR) {
          pos = stCur.standPos;
          yaw = presentYaw(pos, cup[0], cup[2]);
          const pourU = clamp(localT / REFILL_POUR);
          const bowEnv = Math.sin(Math.PI * 0.5 * Math.min(1, pourU / 0.22) * Math.min(1, (1 - pourU) / 0.18));
          lean = 0.06 * bowEnv;
          pouring = pourU >= 0.12 && pourU <= 0.88;
          pourCupWorld = [cup[0], cup[1] + 0.15, cup[2]];
          if (pouring) refillTea(targetSeat);
        } else {
          const walkK = (localT - REFILL_POUR) / REFILL_WALK;
          const stNext = seatStops[seatIdx + 1]!;
          [pos, yaw] = walkPatioCorridor(stCur, stNext, walkK);
          isWalkingSeg = true;
        }
      }
    } else if (job.kind === 'shuffle') {
      const stp = stops.A;
      const door = doorForX(stp.standPos[0]);
      if (u < 0.24) {
        [pos, yaw] = walkPos(door, stp.standPos, u / 0.24);
        isWalkingSeg = true;
      } else if (u < 0.42) {
        pos = stp.standPos;
        yaw = presentYaw(pos, 0, 0);
        lean = 0.22;
        flourish = 'gather';
      } else if (u < 0.68) {
        pos = stp.standPos;
        yaw = presentYaw(pos, 0, 0);
        lean = 0.10;
        flourish = 'bridge';
      } else if (u < 0.8) {
        pos = stp.standPos;
        yaw = presentYaw(pos, 0, 0);
        lean = 0.24;
        flourish = 'set';
      } else {
        [pos, yaw] = walkPos(stp.standPos, door, (u - 0.8) / 0.2);
        isWalkingSeg = true;
      }
    } else if (job.kind === 'roundEnd') {
      const loserPos = targetPosForSeat(job.loser ?? 1);
      const winnerPos = targetPosForSeat(job.winner ?? 0);
      const stLoser = stops.A;
      const stWinner = stops.B;
      if (u < 0.2) {
        [pos, yaw] = walkPos(doorForX(stLoser.standPos[0]), stLoser.standPos, u / 0.2);
        isWalkingSeg = true;
        glass = true;
      } else if (u < 0.52) {
        pos = stLoser.standPos;
        yaw = presentYaw(pos, loserPos[0], loserPos[2]);
        glass = true;
        const su = (u - 0.2) / 0.32;
        lean = su < 0.22 ? -0.10 : 0.08;
        if (su >= 0.18) {
          showSplash = false;
          confettiKind = 'multi';
          confettiU = (u - 0.2) / 0.35;
          confettiAt = [stLoser.standPos[0], 0.55, stLoser.standPos[2]];
          splashFrom = [pos[0] + Math.sin(yaw) * 0.28, pos[1] + 0.48, pos[2] + Math.cos(yaw) * 0.28];
          splashTo = loserPos;
          splashU = (su - 0.18) / 0.82;
          const lSeat = job.loser ?? 1;
          if (!activeEmoteFor(lSeat)) triggerEmote(lSeat, 'sputter');
        }
      } else if (u < 0.84) {
        pos = stWinner.standPos;
        yaw = presentYaw(pos, winnerPos[0], winnerPos[2]);
        confettiKind = 'multi';
        confettiAt = [winnerPos[0], 0, winnerPos[2]];
        confettiU = (u - 0.52) / 0.32;
      } else {
        [pos, yaw] = walkPos(stWinner.standPos, doorForX(stWinner.standPos[0]), (u - 0.84) / 0.16);
        isWalkingSeg = true;
      }
    } else if (job.kind === 'medal') {
      const winnerPos = targetPosForSeat(job.winner ?? 0);
      const stWinner = stops.B;
      const door = doorForX(stWinner.standPos[0]);
      if (u < 0.25) {
        [pos, yaw] = walkPos(door, stWinner.standPos, u / 0.25);
        isWalkingSeg = true;
        cushionMedal = 'with';
      } else if (u < 0.55) {
        pos = stWinner.standPos;
        yaw = presentYaw(pos, winnerPos[0], winnerPos[2]);
        lean = 0.20;
        cushionMedal = 'with';
      } else if (u < 0.85) {
        pos = stWinner.standPos;
        yaw = presentYaw(pos, winnerPos[0], winnerPos[2]);
        cushionMedal = 'empty';
        confettiKind = 'gold';
        confettiAt = [winnerPos[0], 0, winnerPos[2]];
        confettiU = (u - 0.55) / 0.3;
      } else {
        [pos, yaw] = walkPos(stWinner.standPos, door, (u - 0.85) / 0.15);
        isWalkingSeg = true;
        cushionMedal = 'empty';
      }
    }

    // Compute instantaneous walking speed & stepping gait cycle
    const dist = Math.hypot(pos[0] - prevPosRef.current[0], pos[2] - prevPosRef.current[2]);
    prevPosRef.current = [...pos] as V3;
    const rawSpeed = dist / d;
    const targetStride = isWalkingSeg ? (job.lockedProgress !== undefined ? 1.0 : clamp(rawSpeed / 0.75, 0.55, 1.25)) : 0;
    if (job.lockedProgress !== undefined) {
      strideSmoothRef.current = targetStride;
    } else {
      strideSmoothRef.current += (targetStride - strideSmoothRef.current) * (1 - Math.exp(-d * 14));
    }
    const stride = strideSmoothRef.current;
    if (job.lockedProgress !== undefined) {
      walkPhaseRef.current = u * 18.0 * 7.5;
    } else if (stride > 0.03) {
      walkPhaseRef.current += d * (5.5 + stride * 3.5);
    }
    const gait = computeWalkGait(walkPhaseRef.current, stride);

    if (rootRef.current) {
      rootRef.current.visible = true;
      // Place waiter's feet on the patio floor plane WAITER_FLOOR_Y (-0.42), strictly in the outer stone patio corridors!
      rootRef.current.position.set(pos[0], WAITER_FLOOR_Y, pos[2]);
      rootRef.current.rotation.set(0, yaw, 0);
    }
    if (bodyRef.current) {
      bodyRef.current.position.y = gait.bob;
      bodyRef.current.rotation.set(lean, gait.torsoTwist, gait.hipRoll);
    }

    // Solve 3-bone leg gait & 4-bone arm IK and parent/follow waiter props
    const rig = model.userData.waiterRig as {
      arms: Partial<Record<Side, ArmChain>>;
      legs?: Partial<Record<Side, LegChain>>;
      blinkU: FaceShaderUniform[];
    } | undefined;
    if (rig && bodyRef.current && rootRef.current) {
      // Drive 3-bone articulated legs (legL -> legL_knee -> legL_foot & legR -> legR_knee -> legR_foot)
      if (rig.legs) {
        if (stride > 0.04) {
          poseLeg(rig.legs.L, gait.L.hipPitch, gait.L.kneeBend, gait.L.footPitch, gait.L.hipRoll, job.lockedProgress !== undefined ? undefined : d);
          poseLeg(rig.legs.R, gait.R.hipPitch, gait.R.kneeBend, gait.R.footPitch, gait.R.hipRoll, job.lockedProgress !== undefined ? undefined : d);
        } else {
          // Polite balanced pouring/standing stance with slight knee flexion
          const bowKnee = lean > 0.1 ? 0.20 : 0.08;
          const bowHip = lean > 0.1 ? 0.10 : 0.04;
          poseLeg(rig.legs.L, bowHip, bowKnee, 0.05, -0.04, job.lockedProgress !== undefined ? undefined : d);
          poseLeg(rig.legs.R, bowHip, bowKnee, 0.05, 0.04, job.lockedProgress !== undefined ? undefined : d);
        }
      }

      const ph = (now + 1.1) % 3.8;
      const bl = wink ? 0 : ph < 0.14 ? Math.sin((ph / 0.14) * Math.PI) : 0;
      for (const bu of rig.blinkU) {
        bu.value = bl;
        // Keep mouth shader overlay off on the waiter so his sculpted 3D mouth at y=0.40 is clean above his bowtie/collar
        bu.mouth?.set(0, 0.25, 1.0, 0);
      }

      const swing = gait.armSwing;
      let tL: V3 = [-0.28, 0.34, 0.08 + swing], wL = 0.78, cL = 0.35;
      let tR: V3 = [0.28, 0.34, 0.08 - swing], wR = 0.78, cR = 0.35;

      if (job.kind === 'visit') {
        if (u >= 0.28 && u < 0.55) {
          tR = [0.22, 0.42, 0.24]; wR = 0.95; cR = 0.55;
          tL = [-0.26, 0.36, 0.16]; wL = 0.85; cL = 0.45;
        } else if (u >= 0.55 && u < 0.78) {
          const wv = Math.sin((u - 0.55) * 58) * 0.085;
          tR = [0.30 + wv, 0.56, 0.22]; wR = 1.0; cR = 0.12;
          tL = [-0.28, 0.36, 0.12]; wL = 0.88; cL = 0.6;
        }
      } else if (job.kind === 'refill') {
        // Left hand holds the silver tray & folded towel steady outside his left flank
        tL = [-0.30, 0.39, 0.18]; wL = 0.96; cL = 0.48;
        if (pouring && pourCupWorld) {
          // Right hand extends forward-right outside his body toward the player's teacup to pour
          tR = [0.27, 0.44, 0.26]; wR = 1.0; cR = 0.92;
        } else {
          tR = [0.28, 0.39, 0.18 - swing * 0.5]; wR = 0.95; cR = 0.85;
        }
      } else if (job.kind === 'shuffle') {
        if (flourish === 'gather') {
          const g = Math.sin((u - 0.24) * 45) * 0.03;
          tL = [-0.09 - g, 0.38, 0.25]; tR = [0.09 + g, 0.38, 0.25];
          wL = wR = 1.0; cL = cR = 0.75;
        } else if (flourish === 'bridge') {
          tL = [-0.18, 0.41, 0.25]; tR = [0.18, 0.41, 0.25];
          wL = wR = 1.0; cL = cR = 0.85;
        } else if (flourish === 'set') {
          tL = [-0.11, 0.34, 0.26]; tR = [0.11, 0.34, 0.26];
          wL = wR = 0.95; cL = cR = 0.4;
        }
      } else if (job.kind === 'roundEnd') {
        if (u < 0.2) {
          tR = [0.21, 0.40, 0.18]; wR = 0.95; cR = 0.85;
        } else if (u < 0.52) {
          const su = (u - 0.2) / 0.32;
          tR = su < 0.22 ? [0.26, 0.48, 0.06] : [0.15, 0.48, 0.28];
          wR = 1.0; cR = su < 0.22 ? 0.9 : 0.45;
          tL = [-0.20, 0.36, 0.14]; wL = 0.85; cL = 0.4;
        } else if (u < 0.84) {
          const clap = Math.abs(Math.sin((u - 0.52) * 75)) * 0.075;
          tL = [-0.045 - clap, 0.45, 0.24]; tR = [0.045 + clap, 0.45, 0.24];
          wL = wR = 1.0; cL = cR = 0.25;
        }
      } else if (job.kind === 'medal') {
        if (u < 0.46) {
          tL = [-0.12, 0.38, 0.24]; tR = [0.12, 0.38, 0.24];
          wL = wR = 1.0; cL = cR = 0.55;
        } else if (u < 0.62) {
          tL = [-0.11, 0.46, 0.28]; tR = [0.11, 0.46, 0.28];
          wL = wR = 1.0; cL = cR = 0.4;
        } else if (u < 0.85) {
          tL = [-0.15, 0.36, 0.22]; wL = 0.95; cL = 0.55;
          tR = [0.22, 0.52, 0.20]; wR = 0.95; cR = 0.3;
        } else {
          tL = [-0.15, 0.36, 0.20]; wL = 0.9; cL = 0.55;
        }
      } else if (job.outfit === 'full' || job.outfit === 'tuxedo') {
        tL = [-0.19, 0.36, 0.18]; wL = 0.9; cL = 0.45;
      }

      rootRef.current.updateMatrixWorld(true);
      const bodyCentre = bodyRef.current.localToWorld(new THREE.Vector3(0, 0.38, -0.06));
      for (const [sd, tLoc, w, curl] of [['L', tL, wL, cL], ['R', tR, wR, cR]] as const) {
        const arm = rig.arms[sd];
        if (!arm) continue;
        arm.up.quaternion.copy(arm.restUp);
        resetArm(arm);
        const tWorld = bodyRef.current.localToWorld(new THREE.Vector3(tLoc[0], tLoc[1], tLoc[2]));
        for (let k = 0; k < 2; k++) solveArm(arm, tWorld, w, bodyCentre);
        curlArm(arm, curl * w);
        if (sd === 'R' && wink) {
          arm.hand.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.sin((u - 0.55) * 58) * 0.35));
        }
        if (job.lockedProgress !== undefined) { arm.up.updateMatrixWorld(true); } else { stepArmSmoothing(arm, d, true); }
      }

      if (rig.arms.L && towelRef.current) {
        const fPos = bodyRef.current.worldToLocal(rig.arms.L.fore.getWorldPosition(new THREE.Vector3()));
        const hPos = bodyRef.current.worldToLocal(handPos(rig.arms.L, new THREE.Vector3()));
        towelRef.current.position.lerpVectors(fPos, hPos, 0.72).add(new THREE.Vector3(-0.01, -0.01, 0.02));
      }
      if (rig.arms.R && teapotRef.current) {
        const hPos = bodyRef.current.worldToLocal(handPos(rig.arms.R, new THREE.Vector3()));
        teapotRef.current.position.copy(hPos).add(new THREE.Vector3(0.065, -0.005, 0.02));
      }
      if (rig.arms.R && glassRef.current) {
        const hPos = bodyRef.current.worldToLocal(handPos(rig.arms.R, new THREE.Vector3()));
        glassRef.current.position.copy(hPos).add(new THREE.Vector3(0.01, 0.01, 0.02));
        const su = job.kind === 'roundEnd' ? (u - 0.2) / 0.32 : 0;
        glassRef.current.rotation.set(su >= 0.18 && su <= 1 ? 1.15 : 0.12, 0, 0);
      }
      if (rig.arms.L && rig.arms.R && cushionRef.current) {
        const hL = bodyRef.current.worldToLocal(handPos(rig.arms.L, new THREE.Vector3()));
        const hR = bodyRef.current.worldToLocal(handPos(rig.arms.R, new THREE.Vector3()));
        if (u >= 0.46 && u < 0.85) {
          cushionRef.current.position.copy(hL).add(new THREE.Vector3(0.08, 0.01, 0.02));
        } else {
          cushionRef.current.position.lerpVectors(hL, hR, 0.5).add(new THREE.Vector3(0, 0.015, 0.02));
        }
      }
    }

    if (showSplash && splashRef.current) {
      splashRef.current.children.forEach((ch, i) => {
        const dp = dropsSpec[i]!;
        const t = clamp((splashU - dp.phase) / 0.6);
        if (t <= 0 || t >= 1) {
          ch.visible = false;
        } else {
          ch.visible = true;
          ch.position.set(
            lerp(splashFrom[0], splashTo[0] + dp.ox * 2.2, t),
            lerp(splashFrom[1], splashTo[1] + dp.oy, t) + Math.sin(t * Math.PI) * 0.26,
            lerp(splashFrom[2], splashTo[2] + dp.oz * 2.2, t)
          );
          ch.scale.setScalar(dp.r * (1 - t * 0.2));
        }
      });
    }

    if (confettiKind !== 'none' && confettiRef.current) {
      confettiRef.current.position.set(confettiAt[0], confettiAt[1], confettiAt[2]);
      confettiRef.current.children.forEach((ch, i) => {
        const p = confettiSpec[i]!;
        const fall = (confettiU * 1.2 + (i % 7) * 0.11) % 1;
        ch.position.set(p.dx * (0.5 + fall * 0.85), p.y0 - fall * 0.65, p.dz * (0.5 + fall * 0.85));
        ch.rotation.set(p.rot + fall * 5, p.rot * 2 + fall * 4, fall * 3);
      });
    }

    if (
      !flags.visible ||
      flags.pouring !== pouring ||
      flags.wink !== wink ||
      flags.flourish !== flourish ||
      flags.cushionMedal !== cushionMedal ||
      flags.glass !== glass ||
      flags.splash !== showSplash ||
      flags.confetti !== confettiKind
    ) {
      setFlags({
        visible: true,
        pouring,
        wink,
        flourish,
        cushionMedal,
        glass,
        splash: showSplash,
        confetti: confettiKind,
      });
    }
  });

  const wornMedalPlace = useMemo(() => {
    if (medalWinner === null) return null;
    if (L.chars[medalWinner]) {
      const c = L.chars[medalWinner]!;
      const fwdX = Math.sin(c.yaw), fwdZ = Math.cos(c.yaw);
      return { p: [c.p[0] + fwdX * 0.18, 0.28, c.p[2] + fwdZ * 0.18] as V3, yaw: c.yaw };
    }
    return { p: [0.36, 0.14, 0.76] as V3, yaw: Math.PI };
  }, [medalWinner, L]);

  return (
    <group>
      <group ref={rootRef} scale={0.86} visible={flags.visible && !!job}>
        <mesh geometry={WG.shadow} material={shadowMat()} position={[0, 0.004, 0]} renderOrder={1} />
        <group ref={bodyRef}>
          <primitive object={model} />
          {job && <OutfitMeshes outfit={job.outfit} showTowel={job.kind === 'refill'} towelRef={towelRef} />}
          {flags.wink && (
            <mesh geometry={WG.sph} material={WM.wink} position={[0.055, 0.55, 0.195]} scale={[0.028, 0.012, 0.015]} />
          )}
          {job?.kind === 'refill' && <TeapotProp pouring={flags.pouring} propRef={teapotRef} />}
          {flags.flourish && <CardFlourishProp phase={flags.flourish} />}
          {flags.cushionMedal !== 'none' && <CushionAndMedal hasMedal={flags.cushionMedal === 'with'} propRef={cushionRef} />}
          {flags.glass && (
            <mesh ref={glassRef} geometry={WG.cyl} material={WM.glass} position={[0.24, 0.4, 0.16]} scale={[0.028, 0.075, 0.028]} />
          )}
        </group>
      </group>

      <group ref={splashRef} visible={flags.splash}>
        {dropsSpec.map((_, i) => (
          <mesh key={i} geometry={WG.sph} material={i % 3 === 0 ? WM.waterHi : WM.water} />
        ))}
      </group>

      <group ref={confettiRef} visible={flags.confetti !== 'none'}>
        {confettiSpec.map((p, i) => (
          <mesh key={i} geometry={WG.confetti} material={flags.confetti === 'gold' ? p.goldMat : p.multiMat} />
        ))}
      </group>

      {wornMedalPlace && flags.cushionMedal !== 'with' && (
        <group position={wornMedalPlace.p} rotation={[0, wornMedalPlace.yaw, 0]}>
          <GoldMedalMesh worn />
        </group>
      )}
    </group>
  );
});
