// The Orange waiter (sketch book v8 p22–27, W1–W6): a third Orange guy who works the table in shifts. On a shift
// (~60 s) he walks in from the kitchen exit (off-screen, front-left of the terrace), goes round the WHOLE table on
// a ring behind the chairs, stops beside every seated player to pour their tea, then walks out through the exit,
// takes a 60 s break off-screen and comes back in the next outfit. Game events (a round winner's cheer, the match
// medal) are short visits that start while he is standing at a cup and bring him back to the same spot.
// Motion is planned in waiterPath.ts (time-indexed walk / hold segments): position, speed and the leg cycle all come
// from the plan at the current clock time, the legs use 2-bone IK with a walking foot path whose stride is tied to
// the distance walked (no foot sliding, no stepping in place), and he turns smoothly to face where he walks.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { PlayerView } from '@marlivo/engine';
import type { Layout3, V3 } from '../layout3d';
import { loadManifest, entryFor, loadModel, normalise } from '../registry';
import { findArms, findLegs, resetLeg, solveArm, curlArm, resetArm, stepArmSmoothing, handPos, type ArmChain, type LegChain, type Side } from '../actors';
import type { FaceShaderUniform } from '../Figures';
import { attachBlinkShader } from '../Figures';
import { propLayout } from './propLayout';
import { refillTea } from './tea';
import { shadowMat } from './props';
import {
  WAITER_OUTFITS,
  OUTFIT_ORDER,
  waiterOutfitForCycle,
  pickWaiterOutfit,
  cupStopForSeat,
  waiterObstacles,
  buildShiftPlan,
  buildEventPlan,
  samplePlan,
  legGeomFrom,
  walkPose,
  cadenceOf,
  KITCHEN_DOOR,
  WAITER_FLOOR_Y,
  WAITER_MODEL_H,
  WAITER_SCALE,
  WALK_SPEED,
  WAITER_ACTIVE_SEC,
  WAITER_AWAY_SEC,
  WAITER_CYCLE_SEC,
  type WaiterOutfit,
  type WaiterPlan,
  type LegGeom,
  type LegPose,
} from './waiterPath';

export type WaiterActionKind = 'visit' | 'refill' | 'shuffle' | 'roundEnd' | 'medal';

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

function TeapotProp({ pouring, propRef, spoutRef }: { pouring: boolean; propRef?: React.RefObject<THREE.Group>; spoutRef?: React.RefObject<THREE.Object3D> }) {
  return (
    <group ref={propRef} position={[0.25, 0.40, 0.18]} rotation={[pouring ? 0.5 : 0.08, -0.22, pouring ? -0.62 : 0]}>
      <mesh geometry={WG.sph} material={WM.porcelain} scale={[0.082, 0.074, 0.082]} />
      <mesh geometry={WG.torus} material={WM.gold} position={[0, 0.056, 0]} rotation={[Math.PI / 2, 0, 0]} scale={0.048} />
      <mesh geometry={WG.sph} material={WM.porcelain} position={[0, 0.065, 0]} scale={[0.045, 0.022, 0.045]} />
      <mesh geometry={WG.sph} material={WM.gold} position={[0, 0.086, 0]} scale={0.014} />
      <mesh geometry={WG.cyl} material={WM.porcelain} position={[0.082, 0.02, 0.02]} rotation={[0.2, 0, -0.75]} scale={[0.014, 0.082, 0.018]} />
      <mesh geometry={WG.arc} material={WM.porcelain} position={[-0.076, 0.005, -0.01]} rotation={[0, 0, Math.PI * 0.45]} scale={0.038} />
      <object3D ref={spoutRef} position={[0.112, 0.048, 0.028]} />
      {pouring && (
        <group>
          <mesh geometry={WG.sph} material={WM.steam} position={[0.12, 0.09, 0.03]} scale={0.022} />
          <mesh geometry={WG.sph} material={WM.steam} position={[0.135, 0.14, 0.04]} scale={0.028} />
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

interface WaiterRig {
  arms: Partial<Record<Side, ArmChain>>;
  legs: Partial<Record<Side, LegChain>>;
  geom: Partial<Record<Side, LegGeom>>;
  blinkU: FaceShaderUniform[];
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
    let added: THREE.Object3D | null = null;
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
      normalise(obj, { ...e, height: WAITER_MODEL_H, baseY: 0 });
      const arms = findArms(obj);
      const legs = findLegs(obj);
      // measure the leg bones in body space (obj has no parent yet, so its world space is the body space)
      obj.updateMatrixWorld(true);
      const geom: Partial<Record<Side, LegGeom>> = {};
      for (const sd of ['L', 'R'] as Side[]) {
        const l = legs[sd];
        if (!l) continue;
        const w = (b: THREE.Object3D): V3 => { const v = b.getWorldPosition(new THREE.Vector3()); return [v.x, v.y, v.z]; };
        geom[sd] = legGeomFrom(w(l.hip), w(l.knee), w(l.foot));
      }
      const fb = container.getObjectByName('fallback-egg');
      if (fb) container.remove(fb);
      for (const ch of [...container.children]) container.remove(ch);
      container.userData.waiterRig = { arms, legs, geom, blinkU } satisfies WaiterRig;
      container.add(obj);
      added = obj;
    })();
    return () => { alive = false; if (added) container.remove(added); };
  }, [container, level]);

  return container;
}

const qA = new THREE.Quaternion();
/** Sets one leg from the gait (no smoothing needed: the pose is an exact function of the distance walked). */
function applyLeg(leg: LegChain | undefined, pose: LegPose) {
  if (!leg) return;
  resetLeg(leg);
  if (Math.abs(pose.hipPitch) > 1e-5) leg.hip.quaternion.multiply(qA.setFromAxisAngle(leg.axHip[0], -pose.hipPitch));
  if (Math.abs(pose.kneeBend) > 1e-5) leg.knee.quaternion.multiply(qA.setFromAxisAngle(leg.axKnee[0], pose.kneeBend));
  if (Math.abs(pose.footPitch) > 1e-5) leg.foot.quaternion.multiply(qA.setFromAxisAngle(leg.axFoot[0], -pose.footPitch));
}

type Flags = {
  visible: boolean;
  pouring: boolean;
  wink: boolean;
  flourish: 'gather' | 'bridge' | 'set' | null;
  cushionMedal: 'none' | 'with' | 'empty';
  confetti: 'none' | 'multi' | 'gold';
};
const NO_FLAGS: Flags = { visible: false, pouring: false, wink: false, flourish: null, cushionMedal: 'none', confetti: 'none' };

/** What he is doing right now: a work shift, a short event visit (medal / cheer / shuffle / wave), or a manual
 *  test job. All of them are time-indexed WaiterPlans, so he always walks from where he is to where he goes. */
interface Run {
  kind: WaiterActionKind;
  outfit: WaiterOutfit;
  plan: WaiterPlan;
  /** clock time at which plan time 0 happened (shift pauses for an event push this later) */
  t0: number;
  /** locked plan progress 0..1 (manual showcase / test scrubbing) */
  locked?: number;
  winner?: number;
  loser?: number;
  cycleIndex?: number;
}
type Pending = { kind: 'roundEnd' | 'medal'; winner: number; loser?: number; at: number };

export const OrangeWaiter = memo(function OrangeWaiter({ L, view, level }: { L: Layout3; view?: PlayerView; level: 'high' | 'low' }) {
  const model = useWaiterModel(level);
  const rootRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const confettiRef = useRef<THREE.Group>(null);
  const towelRef = useRef<THREE.Group>(null);
  const teapotRef = useRef<THREE.Group>(null);
  const spoutRef = useRef<THREE.Object3D>(null);
  const streamRef = useRef<THREE.Mesh>(null);
  const cushionRef = useRef<THREE.Group>(null);

  const props = useMemo(() => propLayout(L), [L]);
  const obs = useMemo(() => waiterObstacles(L), [L]);
  const clockRef = useRef(0);
  const camRef = useRef<THREE.Camera | null>(null);
  // the shift / break state machine (refs: it runs inside useFrame)
  const shiftRef = useRef<Run | null>(null);
  const eventRef = useRef<(Run & { during: 'shift' | 'break' }) | null>(null);
  const manualRef = useRef<Run | null>(null);
  const breakUntilRef = useRef(0);
  const cycleRef = useRef(0);
  const pendingRef = useRef<Pending | null>(null);
  const yawRef = useRef<number | null>(null);
  const lastRef = useRef<{ x: number; z: number; t: number; speed: number; amt: number; cyc: number; mode: string; tag: string | null }>({ x: 0, z: 0, t: 0, speed: 0, amt: 0, cyc: 0, mode: 'break', tag: null });
  const [shown, setShown] = useState<{ kind: WaiterActionKind; outfit: WaiterOutfit } | null>(null);
  const [flags, setFlags] = useState<Flags>(NO_FLAGS);
  const [medalWinner, setMedalWinner] = useState<number | null>(null);
  const prevResultRef = useRef<boolean>(!!view?.round?.result);
  const prevPhaseRef = useRef<string>(view?.phase ?? '');

  const seatsAll = () => Object.keys(L.seats).map(Number).sort((a, b) => a - b);
  const charPos = (seat: number): V3 => L.chars[seat]?.p ?? [0, 0, 1.2];
  const shiftPlan = () => buildShiftPlan(L, props.tea, WAITER_ACTIVE_SEC);
  /** Plan for a short event visit, from `start` back to `end`. */
  const eventPlan = (kind: WaiterActionKind, start: [number, number], end: [number, number], winner?: number): WaiterPlan => {
    const seat = winner ?? seatsAll()[0] ?? 0;
    const st = cupStopForSeat(L, seat, props.tea[seat]?.p, obs);
    const c = charPos(seat);
    if (kind === 'visit') return buildEventPlan(start, [st.standPos[0], st.standPos[2]], [0, 3], 5, 'visit', end, seat);
    if (kind === 'shuffle') return buildEventPlan(start, [st.standPos[0], st.standPos[2]], [0, 0], 5, 'shuffle', end, seat);
    if (kind === 'roundEnd') return buildEventPlan(start, [st.standPos[0], st.standPos[2]], [c[0], c[2]], 5, 'cheer', end, seat);
    return buildEventPlan(start, [st.standPos[0], st.standPos[2]], [c[0], c[2]], 7, 'medal', end, seat);
  };
  const doorXZ: [number, number] = [KITCHEN_DOOR[0], KITCHEN_DOOR[2]];

  const trigger = (kind: WaiterActionKind, opts: { outfit?: WaiterOutfit; winner?: number; loser?: number; progress?: number } = {}) => {
    const outfit = opts.outfit ?? (kind === 'medal' ? 'tuxedo' : pickWaiterOutfit(Math.random, shown?.outfit));
    const plan = kind === 'refill' ? shiftPlan() : eventPlan(kind, doorXZ, doorXZ, opts.winner);
    manualRef.current = { kind, outfit, plan, t0: clockRef.current, locked: opts.progress, winner: opts.winner, loser: opts.loser };
    if (kind === 'medal') setMedalWinner(opts.winner ?? seatsAll()[0] ?? 0);
  };

  useEffect(() => {
    const api = {
      outfits: WAITER_OUTFITS,
      outfitOrder: OUTFIT_ORDER,
      cycleSpec: { activeSec: WAITER_ACTIVE_SEC, awaySec: WAITER_AWAY_SEC, cycleSec: WAITER_CYCLE_SEC },
      plan: () => shiftPlan(),
      get job() { const r = manualRef.current ?? eventRef.current ?? shiftRef.current; return r ? { kind: r.kind, outfit: r.outfit, cycleIndex: r.cycleIndex, lockedProgress: r.locked } : null; },
      state: () => {
        const r = manualRef.current ?? eventRef.current ?? shiftRef.current;
        const rig = model.userData.waiterRig as WaiterRig | undefined;
        const fp = (sd: Side) => { const l = rig?.legs[sd]; if (!l) return null; const v = l.foot.getWorldPosition(new THREE.Vector3()); return [+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)]; };
        const lr = lastRef.current;
        return {
          mode: manualRef.current ? 'manual' : eventRef.current ? 'event' : shiftRef.current ? 'shift' : 'break',
          job: r ? { kind: r.kind, outfit: r.outfit, cycleIndex: r.cycleIndex } : null,
          visible: !!rootRef.current?.visible,
          pos: rootRef.current ? [rootRef.current.position.x, rootRef.current.position.y, rootRef.current.position.z] : null,
          yaw: rootRef.current ? rootRef.current.rotation.y : 0,
          speed: lr.speed, stride: lr.amt, cycle: lr.cyc, tag: lr.tag,
          breakLeft: Math.max(0, breakUntilRef.current - clockRef.current),
          clock: clockRef.current,
          footL: fp('L'), footR: fp('R'),
          rigReady: !!rig,
          // on-screen test: fraction of a few body points (feet .. head) inside the view (NDC within +-1)
          onScreen: (() => {
            const cam = camRef.current, rt = rootRef.current;
            if (!cam || !rt || !rt.visible) return 0;
            let n = 0; const pts = [[0, 0.05, 0], [0, 0.4, 0], [0, 0.75, 0], [0.25, 0.4, 0], [-0.25, 0.4, 0]];
            for (const q of pts) { const v = rt.localToWorld(new THREE.Vector3(q[0], q[1], q[2])).project(cam); if (Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z < 1) n++; }
            return n / pts.length;
          })(),
        };
      },
      // debug: floor footprint of every seated group (character + chair + props) and of the waiter himself, from the
      // real (skinned) vertices: max distance from the root per 10-degree bin, in world units
      footprints: () => {
        const rt = rootRef.current; if (!rt) return null;
        let scene: THREE.Object3D = rt; while (scene.parent) scene = scene.parent;
        scene.updateMatrixWorld(true);
        const v = new THREE.Vector3();
        const prof = (obj: THREE.Object3D, cx: number, cz: number) => {
          const bins = new Array(36).fill(0); let max = 0;
          obj.traverse((o) => {
            const m = o as THREE.Mesh; if (!m.isMesh || !m.visible || !m.geometry?.attributes?.position) return;
            const pos = m.geometry.attributes.position; const step = Math.max(1, Math.floor(pos.count / 4000));
            for (let i = 0; i < pos.count; i += step) {
              m.getVertexPosition(i, v); m.localToWorld(v);
              const dx = v.x - cx, dz = v.z - cz, d = Math.hypot(dx, dz);
              const b = Math.floor(((Math.atan2(dx, dz) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 36) % 36;
              if (d > bins[b]) bins[b] = d; if (d > max) max = d;
            }
          });
          return { max: +max.toFixed(3), bins: bins.map((b: number) => +b.toFixed(3)) };
        };
        const seats: Record<string, unknown> = {};
        for (const [sk, c] of Object.entries(L.chars)) {
          let found: THREE.Object3D | null = null;
          scene.traverse((o) => { if (found || o === scene) return; o.getWorldPosition(v); if (Math.abs(v.x - c.p[0]) < 1e-3 && Math.abs(v.z - c.p[2]) < 1e-3 && Math.abs(o.scale.x - 0.85) < 1e-3) found = o; });
          seats[sk] = found ? { p: c.p, yaw: c.yaw, ...prof(found, c.p[0], c.p[2]) } : null;
        }
        return { seats, waiter: rt.visible ? prof(rt, rt.position.x, rt.position.z) : null };
      },
      trigger,
      setProgress: (p?: number) => { if (manualRef.current) manualRef.current = { ...manualRef.current, locked: p }; },
      stop: () => { manualRef.current = null; },
    };
    (window as unknown as { __mlWaiter?: typeof api }).__mlWaiter = api;
  });

  // game events: a cheer for the round winner, the gold medal at the end of the match (queued until he is standing
  // still, so he never stops dead in the middle of a step)
  useEffect(() => {
    if (!view) return;
    if (view.phase !== 'MATCH_END') setMedalWinner(null);
    if (view.phase === 'MATCH_END' && prevPhaseRef.current !== 'MATCH_END' && view.matchWinner !== null && view.matchWinner !== undefined) {
      pendingRef.current = { kind: 'medal', winner: view.matchWinner, at: clockRef.current };
    } else if (view.round?.result && !prevResultRef.current && view.round.result.winner !== null && view.round.result.winner !== undefined) {
      pendingRef.current = { kind: 'roundEnd', winner: view.round.result.winner, at: clockRef.current };
    }
    prevResultRef.current = !!view.round?.result;
    prevPhaseRef.current = view.phase;
  }, [view?.phase, view?.roundNo, !!view?.round?.result, view?.matchWinner]);

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

  useFrame((st, rawDt) => {
    const now = st.clock.elapsedTime;
    const dt = Math.min(0.25, Math.max(0, rawDt));
    clockRef.current = now;
    camRef.current = st.camera;

    // ---- which plan runs now ----
    let run: Run | null = null;
    let t = 0;
    if (manualRef.current) {
      run = manualRef.current;
      t = run.locked !== undefined ? Math.min(1, Math.max(0, run.locked)) * run.plan.total : now - run.t0;
      if (run.locked === undefined && t >= run.plan.total) { manualRef.current = null; run = null; }
    }
    if (!run && !manualRef.current) {
      const sh = shiftRef.current, ev = eventRef.current;
      if (ev) {
        if (now - ev.t0 >= ev.plan.total) {
          // back exactly where he left the shift (or at the exit): the shift carries on from there
          if (ev.during === 'shift' && sh) sh.t0 += ev.plan.total;
          eventRef.current = null;
        } else { run = ev; t = now - ev.t0; }
      }
      if (!run && sh) {
        const ts = now - sh.t0;
        if (ts >= sh.plan.total) {
          refillTea();
          shiftRef.current = null;
          // the break: 60 s off-screen (plus whatever was left of the shift minute)
          breakUntilRef.current = now + WAITER_AWAY_SEC + Math.max(0, WAITER_ACTIVE_SEC - sh.plan.total);
          cycleRef.current += 1;
        } else {
          // a queued event starts when he is standing still at a cup (or straight away for the medal)
          const pd = pendingRef.current;
          const cur = samplePlan(sh.plan, ts);
          if (pd && now - pd.at > 45 && pd.kind !== 'medal') pendingRef.current = null;
          else if (pd && !cur.moving && cur.tag === 'pour' && ts > 1) {
            pendingRef.current = null;
            const here: [number, number] = [cur.x, cur.z];
            const outfit = sh.outfit;
            eventRef.current = { kind: pd.kind, outfit, plan: eventPlan(pd.kind, here, here, pd.winner), t0: now, winner: pd.winner, during: 'shift' };
            if (pd.kind === 'medal') setMedalWinner(pd.winner);
            run = eventRef.current; t = 0;
          }
          if (!run) { run = sh; t = ts; }
        }
      }
      if (!run && !shiftRef.current && !eventRef.current) {
        const pd = pendingRef.current;
        if (pd && pd.kind === 'medal') {
          // the medal is worth interrupting the break for: walk in, present it, walk out again
          pendingRef.current = null;
          eventRef.current = { kind: 'medal', outfit: 'tuxedo', plan: eventPlan('medal', doorXZ, doorXZ, pd.winner), t0: now, winner: pd.winner, during: 'break' };
          setMedalWinner(pd.winner);
          run = eventRef.current; t = 0;
        } else if (now >= breakUntilRef.current) {
          if (pd) pendingRef.current = null;
          shiftRef.current = { kind: 'refill', outfit: waiterOutfitForCycle(cycleRef.current), plan: shiftPlan(), t0: now, cycleIndex: cycleRef.current };
          run = shiftRef.current; t = 0;
        }
      }
    }

    if (!run) {
      if (rootRef.current) rootRef.current.visible = false;
      if (streamRef.current) streamRef.current.visible = false;
      yawRef.current = null;
      lastRef.current = { ...lastRef.current, speed: 0, amt: 0, mode: 'break', tag: null };
      if (flags.visible) setFlags(NO_FLAGS);
      if (shown) setShown(null);
      return;
    }
    if (!shown || shown.kind !== run.kind || shown.outfit !== run.outfit) setShown({ kind: run.kind, outfit: run.outfit });

    // ---- where he is, how fast he walks, where he looks ----
    const smp = samplePlan(run.plan, t);
    const seg = run.plan.segs[smp.seg];
    const vCruise = seg && seg.k === 'walk' ? seg.v : WALK_SPEED;
    // time spent walking so far drives the leg cycle at a constant cadence (stride shortens while easing in/out)
    let moveT = 0;
    for (let i = 0; i < smp.seg && i < run.plan.segs.length; i++) { const sg = run.plan.segs[i]!; if (sg.k === 'walk') moveT += sg.dur; }
    if (seg && seg.k === 'walk') moveT += Math.min(seg.dur, Math.max(0, t - seg.t0));
    const rig = model.userData.waiterRig as WaiterRig | undefined;
    const g = rig?.geom.L ?? rig?.geom.R;
    const amt = smp.moving ? Math.min(1, smp.speed / vCruise) : 0;
    const cyc = g ? (moveT * cadenceOf(g, vCruise)) % 1 : 0;

    const wantYaw = Math.atan2(smp.hx, smp.hz);
    if (yawRef.current === null) yawRef.current = wantYaw;
    else {
      let dy = wantYaw - yawRef.current;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      // turn smoothly (about a quarter turn in 0.35 s), a little faster when standing
      yawRef.current += dy * (1 - Math.exp(-dt * (smp.moving ? 7 : 5)));
    }
    const yaw = yawRef.current;

    // ---- what he does at a stop ----
    let pouring = false, lean = 0, wink = false;
    let flourish: Flags['flourish'] = null;
    let cushionMedal: Flags['cushionMedal'] = run.kind === 'medal' ? 'with' : 'none';
    let confettiKind: Flags['confetti'] = 'none';
    let confettiAt: V3 = [0, 0, 0], confettiU = 0;
    const hu = smp.holdU;
    if (smp.tag === 'pour') {
      pouring = hu > 0.16 && hu < 0.86;
      lean = 0.07 * Math.sin(Math.PI * Math.min(1, hu / 0.2) * 0.5) * Math.min(1, (1 - hu) / 0.12);
      if (pouring && smp.seat !== undefined) refillTea(smp.seat);
    } else if (smp.tag === 'visit') {
      lean = hu < 0.5 ? 0.06 : 0; wink = hu >= 0.5;
    } else if (smp.tag === 'shuffle') {
      flourish = hu < 0.35 ? 'gather' : hu < 0.75 ? 'bridge' : 'set'; lean = flourish === 'bridge' ? 0.05 : 0.12;
    } else if (smp.tag === 'cheer') {
      const c = charPos(smp.seat ?? 0);
      confettiKind = 'multi'; confettiAt = [c[0], 0, c[2]]; confettiU = hu;
    } else if (smp.tag === 'medal') {
      lean = hu < 0.45 ? 0.12 : 0;
      cushionMedal = hu < 0.5 ? 'with' : 'empty';
      if (hu >= 0.5) { const c = charPos(smp.seat ?? 0); confettiKind = 'gold'; confettiAt = [c[0], 0, c[2]]; confettiU = (hu - 0.5) / 0.5; }
    }
    if (run.kind === 'medal') {
      const done = run.plan.segs.findIndex((s) => s.k === 'hold');
      if (done >= 0 && smp.seg > done) cushionMedal = 'empty';
    }

    // ---- body + legs ----
    const pose = g ? walkPose(g, cyc, amt) : null;
    if (rootRef.current) {
      rootRef.current.visible = true;
      rootRef.current.position.set(smp.x, WAITER_FLOOR_Y, smp.z);
      rootRef.current.rotation.set(0, yaw, 0);
    }
    if (bodyRef.current) {
      bodyRef.current.position.set(0, pose ? pose.bodyY : 0, 0);
      bodyRef.current.rotation.set(lean + 0.03 * amt, 0, 0);
    }
    lastRef.current = { x: smp.x, z: smp.z, t: now, speed: smp.speed, amt, cyc, mode: run === shiftRef.current ? 'shift' : 'event', tag: smp.tag };

    if (rig && bodyRef.current && rootRef.current) {
      if (pose) { applyLeg(rig.legs.L, pose.L); applyLeg(rig.legs.R, pose.R); }

      const ph = (now + 1.1) % 3.8;
      const bl = wink ? 0 : ph < 0.14 ? Math.sin((ph / 0.14) * Math.PI) : 0;
      for (const bu of rig.blinkU) {
        bu.value = bl;
        bu.mouth?.set(0, 0.25, 1.0, 0);
      }

      // arms: a gentle swing opposite the legs while walking; tray + teapot on a shift
      const swing = (pose?.armSwing ?? 0) * 0.07;
      let tL: V3 = [-0.28, 0.33, 0.06 - swing], wL = 0.78, cL = 0.35;
      let tR: V3 = [0.28, 0.33, 0.06 + swing], wR = 0.78, cR = 0.35;
      if (run.kind === 'refill') {
        // tray and teapot held in close to the body (a compact footprint between the chairs)
        tL = [-0.24, 0.39, 0.12 + swing * 0.15]; wL = 0.96; cL = 0.48;
        tR = pouring ? [0.2, 0.45, 0.27] : [0.23, 0.39, 0.12 + swing * 0.2]; wR = 1.0; cR = pouring ? 0.92 : 0.85;
      } else if (smp.tag === 'visit') {
        if (hu < 0.5) { tR = [0.22, 0.42, 0.24]; wR = 0.95; cR = 0.55; tL = [-0.26, 0.36, 0.16]; wL = 0.85; cL = 0.45; }
        else { const wv = Math.sin(hu * 40) * 0.085; tR = [0.30 + wv, 0.56, 0.22]; wR = 1.0; cR = 0.12; tL = [-0.28, 0.36, 0.12]; wL = 0.88; cL = 0.6; }
      } else if (flourish === 'gather') {
        const gg = Math.sin(hu * 30) * 0.03; tL = [-0.09 - gg, 0.38, 0.25]; tR = [0.09 + gg, 0.38, 0.25]; wL = wR = 1.0; cL = cR = 0.75;
      } else if (flourish === 'bridge') {
        tL = [-0.18, 0.41, 0.25]; tR = [0.18, 0.41, 0.25]; wL = wR = 1.0; cL = cR = 0.85;
      } else if (flourish === 'set') {
        tL = [-0.11, 0.34, 0.26]; tR = [0.11, 0.34, 0.26]; wL = wR = 0.95; cL = cR = 0.4;
      } else if (smp.tag === 'cheer') {
        const clap = Math.abs(Math.sin(hu * 40)) * 0.075; tL = [-0.045 - clap, 0.45, 0.24]; tR = [0.045 + clap, 0.45, 0.24]; wL = wR = 1.0; cL = cR = 0.25;
      } else if (run.kind === 'medal') {
        if (cushionMedal === 'with') { tL = [-0.12, 0.38, 0.24]; tR = [0.12, 0.38, 0.24]; wL = wR = 1.0; cL = cR = 0.55; }
        else { tL = [-0.15, 0.36, 0.20 - swing * 0.2]; wL = 0.9; cL = 0.55; }
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
        if (sd === 'R' && wink) arm.hand.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.sin(hu * 40) * 0.35));
        if (run.locked !== undefined) arm.up.updateMatrixWorld(true); else stepArmSmoothing(arm, dt > 0 ? dt : 1 / 60, true);
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
      if (rig.arms.L && rig.arms.R && cushionRef.current) {
        const hL = bodyRef.current.worldToLocal(handPos(rig.arms.L, new THREE.Vector3()));
        const hR = bodyRef.current.worldToLocal(handPos(rig.arms.R, new THREE.Vector3()));
        cushionRef.current.position.lerpVectors(hL, hR, 0.5).add(new THREE.Vector3(0, 0.015, 0.02));
      }
    }

    // tea stream: from the spout down into the cup (world space, so it always lands in the cup)
    if (streamRef.current) {
      const cup = smp.seat !== undefined ? props.tea[smp.seat]?.p : undefined;
      const sp = spoutRef.current;
      if (pouring && cup && sp && teapotRef.current) {
        teapotRef.current.updateMatrixWorld(true);
        const a = sp.getWorldPosition(new THREE.Vector3());
        const b = new THREE.Vector3(cup[0], cup[1] + 0.045, cup[2]);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const len = a.distanceTo(b);
        streamRef.current.visible = true;
        streamRef.current.position.copy(mid);
        streamRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        streamRef.current.scale.set(0.009, len, 0.009);
      } else streamRef.current.visible = false;
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
      !flags.visible || flags.pouring !== pouring || flags.wink !== wink || flags.flourish !== flourish ||
      flags.cushionMedal !== cushionMedal || flags.confetti !== confettiKind
    ) {
      setFlags({ visible: true, pouring, wink, flourish, cushionMedal, confetti: confettiKind });
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
      <group ref={rootRef} scale={WAITER_SCALE} visible={false}>
        <mesh geometry={WG.shadow} material={shadowMat()} position={[0, 0.004, 0]} renderOrder={1} />
        <group ref={bodyRef}>
          <primitive object={model} />
          {shown && <OutfitMeshes outfit={shown.outfit} showTowel={shown.kind === 'refill'} towelRef={towelRef} />}
          {flags.wink && (
            <mesh geometry={WG.sph} material={WM.wink} position={[0.055, 0.55, 0.195]} scale={[0.028, 0.012, 0.015]} />
          )}
          {shown?.kind === 'refill' && <TeapotProp pouring={flags.pouring} propRef={teapotRef} spoutRef={spoutRef} />}
          {flags.flourish && <CardFlourishProp phase={flags.flourish} />}
          {flags.cushionMedal !== 'none' && <CushionAndMedal hasMedal={flags.cushionMedal === 'with'} propRef={cushionRef} />}
        </group>
      </group>

      <mesh ref={streamRef} geometry={WG.cyl} material={WM.amber} visible={false} />

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
