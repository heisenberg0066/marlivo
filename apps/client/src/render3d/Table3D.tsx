// The 3D table renderer (three.js via react-three-fiber). Same props as the 2D <Table>: a pure view of the
// game plus the animation director's overrides. Game logic, rules and hidden-info filtering are untouched —
// it only ever sees the filtered PlayerView, exactly like 2D.
import { memo, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import * as THREE from 'three';
import type { PlayerView } from '@marlivo/engine';
import type { TableProps } from '../render/Table';
import { NamePlate } from '../render/Table';
import { SEAT_COLORS, type Mood } from '../render/characters';
import { setFlyBackend } from '../render/fly';
import { usePrefs, graphicsLevel } from '../prefs';
import { t } from '../i18n';
import { layout3, TABLE_R, CARD_T, type Layout3, type V3 } from './layout3d';
import { Room, Chair } from './Room';
import { SCENE_VIEWS, preloadScene } from './scenes';
import type { SceneName } from '../prefs';
import { GardenChair, type SceneKey } from './scenes/props';
import { CHAR_SCALE, CHAIR_BACK, CAMERA } from './sceneConfig';
import { propLayout } from './scenes/propLayout';
import { Card3D, PLANE, type Glow } from './Card3D';
import { Figure, useCharacterEntry } from './Figures';
import { Die3D } from './Die3D';
import { backend3d, setCtx3, project, updateMyEmoteHand } from './backend3d';
import { triggerEmote, activeEmoteFor, subscribeEmotes } from './actors';
import { setMaxAnisotropy, glowTexture } from './textures';

const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function moodOf(v: PlayerView, ov: TableProps['ov'], seat: number): Mood {
  if (ov.moods[seat]) return ov.moods[seat]!;
  const si = v.seats[seat]; const r = v.round; const active = r?.active;
  if (si && !si.isBot && !si.connected) return 'away';
  if (r?.result?.winner === seat) return 'happy';
  if (v.phase === 'MATCH_END' && v.matchWinner === seat) return 'happy';
  if (active?.k === 'attempt' && active.seat === seat) return 'think';
  if (r && r.current === seat && v.phase === 'PLAY') return 'think';
  return 'idle';
}

type OverlayPoints = Map<string, () => V3 | null>;

/** Fits the seat-view camera so every seat's card area, the deck/pile and the opponents' heads are on screen. */
function CameraRig({ L, me, mode, portrait, outdoor }: { L: Layout3; me: number | null; mode: 'seat' | 'top'; portrait: boolean; outdoor: boolean }) {
  const { camera, size } = useThree();
  const seatsKey = Object.entries(L.seats).map(([s, x]) => s + x.pos + (L.maxAreas[Number(s)]?.w ?? 0).toFixed(2)).join(',');
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = portrait ? 56 : 44; cam.aspect = size.width / size.height;
    // outdoor scenes sit a little lower (more garden + court behind the far player, sketch book v8 p06/p07)
    const el = mode === 'top' ? 1.15 : portrait ? (outdoor ? CAMERA.portraitEl : 0.98) : outdoor ? CAMERA.laptopEl : 0.6;
    // key points: the full box of every area (as big as it can grow), deck, pile, heads of the opponents
    const pts: THREE.Vector3[] = [];
    for (const [seatS, a] of Object.entries(L.maxAreas)) {
      const yaw = a.yaw; const mine = Number(seatS) === me; const hw = Math.max(a.w, 0.3) / 2 + 0.03, hh = Math.max(a.h, 0.2) / 2 + (mine ? 0.07 : 0.03); // my cards tilt up when face up: extra room
      for (const [x, z] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) pts.push(new THREE.Vector3(a.p[0] + x! * Math.cos(yaw) + z! * Math.sin(yaw), 0, a.p[2] - x! * Math.sin(yaw) + z! * Math.cos(yaw)));
      const seat = Number(seatS);
      // phone portrait: side characters may be cut at the screen edge (their name plates stay pinned), the cards matter more
      const side = portrait && mode === 'seat' && Math.abs(Math.sin(L.seats[seat]?.a ?? 0)) > 0.9;
      // phone portrait, side seats: keep the inner part of the figure in frame (face towards the table)
      if (side && seat !== me && L.chars[seat]) { const c = L.chars[seat]!.p; pts.push(new THREE.Vector3(c[0] * CAMERA.sideKeep, 0.55, c[2]), new THREE.Vector3(c[0] * CAMERA.sideKeep, 0.2, c[2])); }
      if (seat !== me && L.chars[seat] && !side) { const c = L.chars[seat]!.p; const y = mode === 'top' ? 0.2 : 0.66; const sx = Math.cos(L.seats[seat]!.a) * 0.2, sz = -Math.sin(L.seats[seat]!.a) * 0.2; pts.push(new THREE.Vector3(c[0], y, c[2]), new THREE.Vector3(c[0] + sx, 0.3, c[2] + sz), new THREE.Vector3(c[0] - sx, 0.3, c[2] - sz)); }
    }
    pts.push(new THREE.Vector3(-0.3, 0, 0), new THREE.Vector3(0.32, 0, 0));
    // outdoor scenes: my own tea cup (at my right hand) stays in frame too
    if (outdoor && !portrait && me !== null) { const tp = propLayout(L).tea[me]; if (tp) pts.push(new THREE.Vector3(tp.p[0] + 0.05, 0.05, tp.p[2])); }
    const dir = new THREE.Vector3(0, Math.sin(el), Math.cos(el));
    const target = new THREE.Vector3();
    const range = () => {
      let minY = 9, maxY = -9, maxX = 0, behind = false;
      for (const p of pts) { const q = p.clone().project(cam); if (q.z >= 1) behind = true; minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y); maxX = Math.max(maxX, Math.abs(q.x)); }
      return { minY, maxY, maxX, behind };
    };
    const place = (d: number) => { cam.clearViewOffset(); cam.position.copy(target).addScaledVector(dir, d); cam.lookAt(target); cam.updateProjectionMatrix(); cam.updateMatrixWorld(); };
    // fits when the points' width fits and their height fits once centred (a lens shift centres them later)
    const fits = (d: number) => { place(d); const r = range(); return !r.behind && r.maxX < 0.95 && r.maxY - r.minY < 1.8; };
    const solve = () => { let lo = 0.8, hi = 9; for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; } return hi; };
    // pick the look-at point that lets the camera sit closest (biggest cards)
    let best = { z: 0, d: 99 };
    for (let z = -0.4; z <= 0.41; z += 0.1) { target.set(0, 0, z); const d = solve(); if (d < best.d - 1e-3) best = { z, d }; }
    target.set(0, 0, best.z); place(best.d);
    const r = range();
    const shift = ((r.maxY + r.minY) / 2 + 0.03) * (size.height / 2); // centre the content vertically (lens shift)
    cam.setViewOffset(size.width, size.height, 0, -shift, size.width, size.height);
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height, seatsKey, mode, portrait, me, outdoor]);
  return null;
}

function OverlaySync({ points, els, stage }: { points: React.MutableRefObject<OverlayPoints>; els: React.MutableRefObject<Map<string, HTMLElement>>; stage: React.RefObject<HTMLDivElement> }) {
  const savedCam = useRef<{ pos: THREE.Vector3; quat: THREE.Quaternion; fov: number } | null>(null);
  useFrame(({ camera, size }) => {
    const cam = camera as THREE.PerspectiveCamera;
    const ov = (window as unknown as { __mlCam?: { pos: [number, number, number]; target: [number, number, number]; fov?: number } | null }).__mlCam;
    if (ov) {
      if (!savedCam.current) savedCam.current = { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov };
      cam.clearViewOffset();
      cam.fov = ov.fov ?? 40;
      cam.aspect = size.width / size.height;
      cam.position.set(ov.pos[0], ov.pos[1], ov.pos[2]);
      cam.lookAt(ov.target[0], ov.target[1], ov.target[2]);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
    } else if (savedCam.current) {
      cam.position.copy(savedCam.current.pos);
      cam.quaternion.copy(savedCam.current.quat);
      cam.fov = savedCam.current.fov;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      savedCam.current = null;
    }
    updateMyEmoteHand();
    const st = stage.current; if (!st) return;
    const r = st.getBoundingClientRect();
    for (const [k, el] of els.current) {
      const f = points.current.get(k); const p = f?.();
      if (!p) { el.style.visibility = 'hidden'; continue; }
      const s = project(p);
      el.style.visibility = s.inFront ? 'visible' : 'hidden';
      // keep plates on screen: a side player cut off at the edge still shows his name pinned to that edge
      const hw = el.offsetWidth / 2 + 4;
      const x = Math.min(Math.max(s.x - r.left, hw), r.width - hw);
      const y = Math.min(Math.max(s.y - r.top, el.offsetHeight + 2), r.height - 2);
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  });
  return null;
}

// High graphics: light contrast-adaptive sharpen after an MSAA render (crisper character textures/edges at the table)
const SHARPEN = {
  uniforms: { tDiffuse: { value: null }, texel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) }, amount: { value: 0.4 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 texel; uniform float amount; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 a = texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb, b = texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb;
      vec3 d = texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb, e = texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb;
      vec3 mn = min(c.rgb, min(min(a, b), min(d, e))), mx = max(c.rgb, max(max(a, b), max(d, e)));
      vec3 w = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, 1e-4), 0.0, 1.0)) * amount; // CAS-style: less sharpening where contrast is already high
      vec3 s = c.rgb + w * (4.0 * c.rgb - a - b - d - e) * 0.25;
      gl_FragColor = vec4(clamp(s, mn, mx), c.a);
    }`,
};
function Sharpen() {
  const { gl, scene, camera, size } = useThree();
  const comp = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
    const c = new EffectComposer(gl, rt); c.addPass(new RenderPass(scene, camera)); c.addPass(new ShaderPass(SHARPEN)); c.addPass(new OutputPass());
    return c;
  }, [gl, scene, camera]);
  useEffect(() => {
    const pr = gl.getPixelRatio(); comp.setPixelRatio(pr); comp.setSize(size.width, size.height);
    ((comp.passes[1] as ShaderPass).uniforms.texel.value as THREE.Vector2).set(1 / (size.width * pr), 1 / (size.height * pr));
  }, [comp, gl, size]);
  useEffect(() => () => comp.dispose(), [comp]);
  useFrame(() => comp.render(), 1);
  return null;
}

function Stats() {
  const acc = useRef({ n: 0, t: 0, fps: 0 });
  useFrame((st, dt) => {
    const a = acc.current; a.n++; a.t += dt;
    if (a.t > 1) { a.fps = a.n / a.t; a.n = 0; a.t = 0; const i = st.gl.info.render; (window as unknown as { __ml3d?: object }).__ml3d = { fps: Math.round(a.fps * 10) / 10, calls: i.calls, tris: i.triangles, dpr: st.gl.getPixelRatio(), at: Date.now() }; }
  });
  return null;
}

function AreaGlow({ a, color, pulse }: { a: Layout3['areas'][number]; color: string; pulse: boolean }) {
  const m = useMemo(() => new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, color, opacity: 0.4 }), [color]);
  useFrame((s) => { m.opacity = pulse ? 0.3 + 0.18 * Math.sin(s.clock.elapsedTime * 3) : 0.35; });
  return <mesh geometry={PLANE} material={m} position={[a.p[0], 0.0002, a.p[2]]} rotation={[0, a.yaw, 0]} scale={[a.w + 0.2, 1, a.h + 0.18]} renderOrder={1} />;
}

function Deck({ L, onDeck, clickable }: { L: Layout3; onDeck(): void; clickable: boolean }) {
  const n = L.deck.count;
  const h = Math.max(0.002, n * CARD_T * 0.6);
  const mats = useMemo(() => {
    const side = new THREE.MeshLambertMaterial({ color: '#efe3cc' });
    return { side };
  }, []);
  const glowM = useMemo(() => new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, color: '#ffae42', opacity: 0 }), []);
  useFrame((s) => { glowM.opacity = clickable ? 0.5 + 0.3 * Math.sin(s.clock.elapsedTime * 5) : 0; });
  if (n <= 0 && !clickable) return null;
  return (
    <group position={[L.deck.p[0], 0, L.deck.p[2]]} rotation={[0, L.deck.yaw, 0]} onClick={(e) => { e.stopPropagation(); onDeck(); }}>
      <mesh geometry={PLANE} material={glowM} scale={[L.deck.w * 1.6, 1, L.deck.h * 1.45]} position={[0, 0.0003, 0]} renderOrder={1} />
      <mesh material={mats.side} position={[0, h / 2, 0]}><boxGeometry args={[L.deck.w * 0.985, h, L.deck.h * 0.985]} /></mesh>
      <Card3D id="deck-top" place={{ p: [0, h + 0.0004, 0], yaw: 0, w: L.deck.w, h: L.deck.h }} face={null} up={false} four={false} onTap={onDeck} />
    </group>
  );
}

const Scene = memo(function Scene({ p, L, stage, points, els, portrait, scene }: { p: TableProps; L: Layout3; stage: React.RefObject<HTMLDivElement>; points: React.MutableRefObject<OverlayPoints>; els: React.MutableRefObject<Map<string, HTMLElement>>; portrait: boolean; scene: SceneName }) {
  const prefs = usePrefs();
  const hi = !!prefs.graphics && graphicsLevel() === 'high';
  const SceneView = SCENE_VIEWS[scene];
  const { camera, gl } = useThree();
  const group = useRef<THREE.Group>(null);
  const v = p.view; const r = v.round; const me = v.you; const ov = p.ov;
  const four = prefs.fourColor;
  // keep the director's 3D context current (layout of the view on screen right now)
  useLayoutEffect(() => { if (group.current) setCtx3({ camera, el: gl.domElement, group: group.current, layout: L, view: v, four }); });
  useEffect(() => { setMaxAnisotropy(gl.capabilities.getMaxAnisotropy()); }, [gl]);
  const seatsShown = r ? r.participants : v.players.length ? v.players : v.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  const [, setEmoteTick] = useState(0);
  useEffect(() => {
    const un = subscribeEmotes(() => setEmoteTick((n) => n + 1));
    const id = window.setInterval(() => setEmoteTick((n) => n + 1), 400);
    return () => { un(); clearInterval(id); };
  }, []);
  const prevWinKey = useRef('');
  useEffect(() => {
    const rw = r?.result?.winner ?? null;
    const mw = v.phase === 'MATCH_END' ? v.matchWinner : null;
    const key = `${v.roundNo}:${rw ?? ''}:${mw ?? ''}`;
    if (key === prevWinKey.current) return;
    prevWinKey.current = key;
    const w = mw ?? rw;
    if (w !== null && (r?.result || v.phase === 'MATCH_END')) {
      triggerEmote(w, 'win');
      for (const s of seatsShown) if (s !== w) triggerEmote(s, 'slam');
    }
  }, [v.roundNo, r?.result?.winner, v.phase, v.matchWinner]);
  const active = r?.active;
  const discard = r?.discard ?? [];
  const pileStart = Math.max(0, discard.length - 14);
  const pileShown = discard.length - Math.min(ov.pileHide, discard.length);
  const showDie = (seat: number) => !!(ov.dice && seat in (ov.dice.values ?? {})) || (v.phase === 'START_ROLL' && !!v.roll);
  const myTurnDraw = !!(r && r.current === me && v.phase === 'PLAY' && !r.drawn && !active);

  return (
    <>
      <CameraRig L={L} me={me} mode={prefs.camera} portrait={portrait} outdoor={scene !== 'classic'} />
      <OverlaySync points={points} els={els} stage={stage} />
      <Stats />
      {hi && <Sharpen />}
      <Suspense fallback={null}><SceneView L={L} view={v} hi={hi} level={hi ? 'high' : 'low'} portrait={portrait} /></Suspense>
      <group ref={group} />
      <Deck L={L} onDeck={p.onDeck} clickable={myTurnDraw} />
      {/* the discard pile, scattered inside the centre circle */}
      <group onClick={(e) => { e.stopPropagation(); p.onPile(); }}>
        {discard.slice(pileStart, pileShown).map((f, k) => {
          const i = pileStart + k;
          const pl = L.pile(i, `${f.r}${f.s}`);
          return <Card3D key={'pile' + i} id={'pile' + i} place={pl} face={f} up four={four} onTap={p.onPile} />;
        })}
      </group>
      {seatsShown.map((seat) => {
        const S = L.seats[seat]; if (!S) return null;
        const slots = r?.areas[seat] ?? [];
        const isMe = seat === me;
        const si = v.seats[seat];
        const area = L.areas[seat];
        const turn = r?.current === seat && v.phase === 'PLAY';
        const pick = p.seatSelectable.has(seat);
        return (
          <group key={seat}>
            {area && (turn || pick) && <AreaGlow a={area} color={pick ? '#ffe066' : SEAT_COLORS[seat] ?? '#e8892f'} pulse={pick} />}
            {area && pick && <mesh geometry={PLANE} material={HIT} position={[area.p[0], 0.003, area.p[2]]} rotation={[0, area.yaw, 0]} scale={[area.w + 0.2, 1, area.h + 0.18]} onClick={(e) => { e.stopPropagation(); p.onSeat(seat); }} />}
            {slots.map((sv) => {
              const o = ov.slot[sv.id];
              const forced = o?.show;
              const face = forced && forced !== 'back' ? forced : forced === 'back' ? null : sv.face ?? null;
              const shown = !o?.hide && (!sv.empty || (!!forced && forced !== 'back'));
              const tentative = active?.k === 'attempt' && active.tentative.includes(sv.id);
              const wrongMark = active?.k === 'attempt' && active.wrong.includes(sv.id);
              const cls = o?.cls ?? '';
              const glow: Glow = cls.includes('wrong') ? 'wrong' : cls.includes('queen') || sv.why === 'queen' ? 'queen' : p.selected.has(sv.id) ? 'selected' : tentative || cls.includes('tentative') ? 'tentative' : p.selectable.has(sv.id) ? 'selectable' : Object.values(p.hover).includes(sv.id) ? 'hovered' : null;
              const lifted = sv.why === 'peek' || sv.why === 'queen';
              const pl = L.slots[sv.id]!;
              return (
                <Card3D key={sv.id} id={sv.id} place={pl} face={face} up={!!face} four={four} glow={glow}
                  empty={!shown} hidden={!!o?.hide} lift={lifted ? 0.05 : sv.why === 'test' ? 0.01 : 0} tilt={lifted ? (isMe ? 0.75 : 1.0) : 0}
                  num={prefs.slotNumbers ? sv.num : null} ghost={sv.ghost && !face ? RANKS[sv.ghost.r] ?? null : null} wrongMark={wrongMark && !face}
                  onTap={() => p.onSlot(sv.id, seat)} onLong={isMe ? p.onLongPressMine : undefined}
                  onHover={(over) => p.onHoverSlot?.(over ? sv.id : null)} />
              );
            })}
            {!isMe && si && L.chars[seat] && (
              <group position={L.chars[seat]!.p} rotation={[0, L.chars[seat]!.yaw, 0]} scale={CHAR_SCALE} onClick={(e) => { if (pick) { e.stopPropagation(); p.onSeat(seat); } }}>
                <SeatChair id={si.characterId} scene={scene} />
                <Suspense fallback={null}><Figure key={si.characterId} id={si.characterId} mood={moodOf(v, ov, seat)} seed={seat} /></Suspense>
              </group>
            )}
            {!isMe && r?.drawn?.by === seat && !ov.hideHand[seat] && L.hands[seat] && (
              <Card3D id={'hand' + seat} place={L.hands[seat]!} face={null} up four={four} />
            )}
            {showDie(seat) && <Die3D seat={seat} view={v} ov={ov} at={L.dice[seat]!} yaw={S.a} big={isMe} />}
          </group>
        );
      })}
    </>
  );
});
const HIT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 });


export const Table3D = memo(function Table3D(p: TableProps & { onFail?(why: string): void }) {
  const prefs = usePrefs();
  const stage = useRef<HTMLDivElement>(null);
  const points = useRef<OverlayPoints>(new Map());
  const els = useRef<Map<string, HTMLElement>>(new Map());
  const [portrait, setPortrait] = useState(() => innerHeight > innerWidth * 1.05);
  useLayoutEffect(() => { const f = () => setPortrait(innerHeight > innerWidth * 1.05); addEventListener('resize', f); return () => removeEventListener('resize', f); }, []);
  const v = p.view; const r = v.round; const me = v.you;
  const L = useMemo(() => layout3(v, prefs.largeCards, portrait), [v, prefs.largeCards, portrait]);
  // Scene switch (Settings or the in-game menu, any time during a match): download the new scene's chunk first,
  // fade to black, swap, fade back. Only dressing changes: the game state, layout and director are untouched.
  const want: SceneName = prefs.scene ?? 'golden';
  const [shown, setShown] = useState<SceneName>(want);
  const [fade, setFade] = useState(false);
  useEffect(() => {
    if (want === shown) return;
    let alive = true; const ts: number[] = [];
    preloadScene(want).then(() => {
      if (!alive) return;
      setFade(true);
      ts.push(window.setTimeout(() => { setShown(want); ts.push(window.setTimeout(() => setFade(false), 220)); }, 180));
    }, () => {});
    return () => { alive = false; ts.forEach(clearTimeout); };
  }, [want, shown]);
  useEffect(() => { setFlyBackend(backend3d); return () => { backend3d.clear(); setFlyBackend(null); setCtx3(null); }; }, []);
  const seatsShown = r ? r.participants : v.players.length ? v.players : v.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  // Hooks for the headless end-to-end check: where to click (real canvas clicks, ray-cast like a finger).
  useEffect(() => {
    const w = window as unknown as { __ml3dHook?: object };
    const xy = (k: string) => { const b = backend3d.rect(k); return b ? { x: b.x, y: b.y } : null; };
    w.__ml3dHook = {
      selectable: [...p.selectable], seatSelectable: [...p.seatSelectable],
      slot: (id: string) => xy('slot:' + id), deck: () => xy('deck'), area: (s: number) => xy('area-' + s),
    };
  });

  // DOM overlays that follow 3D points: name plates + chat bubbles + "+2" badges above heads, the Match badge, deck count
  const reg = (k: string, f: () => V3 | null) => (el: HTMLElement | null) => { if (el) { els.current.set(k, el); points.current.set(k, f); } else { els.current.delete(k); points.current.delete(k); } };
  const dpr = Math.min(window.devicePixelRatio || 1, prefs.graphics && graphicsLevel() === 'high' ? 2 : portrait ? 1.5 : 1.75);
  return (
    <div className="stage stage3d" ref={stage}>
      <Canvas dpr={dpr} gl={{ antialias: true, powerPreference: 'default', alpha: false }} camera={{ fov: 42, near: 0.05, far: 30, position: [0, 1.6, 2.4] }}
        onCreated={({ gl }) => {
          gl.setClearColor('#1a0e08');
          gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); p.onFail?.('context-lost'); });
        }}
        frameloop="always">
        <Scene p={p} L={L} stage={stage} points={points} els={els} portrait={portrait} scene={shown} />
      </Canvas>
      <div className={'scene-fade' + (fade ? ' on' : '')} aria-hidden />
      <div className="ov3d">
        {seatsShown.map((seat) => {
          const si = v.seats[seat]; if (!si || seat === me || !L.chars[seat]) return null;
          const c = L.chars[seat]!.p;
          return (
            <div key={seat} className="ov3d-item plate3d" ref={reg('plate' + seat, () => (Math.abs(Math.sin(L.seats[seat]?.a ?? 0)) > 0.9 ? [c[0] * 0.9, 0.66, c[2]] : [c[0], 0.74, c[2]]))}>
              {p.bubbles[seat] && Date.now() - p.bubbles[seat]!.at < 5000 && <div className="bubble">{p.bubbles[seat]!.text}</div>}
              {(() => { const em = activeEmoteFor(seat); return em ? <div className="emote-pill in3d">{em.icon} {em.label}</div> : null; })()}
              {p.ov.badges[seat] && <div className="plus-badge in3d">{p.ov.badges[seat]}</div>}
              <div className={p.ov.pulse[seat] ?? ''}><NamePlate view={v} seat={seat} /></div>
            </div>
          );
        })}
        {me !== null && p.ov.badges[me] && L.areas[me] && <div className="ov3d-item" ref={reg('mybadge', () => [L.areas[me]!.p[0], 0.05, L.areas[me]!.p[2] - L.areas[me]!.h / 2])}><div className="plus-badge in3d">{p.ov.badges[me]}</div></div>}
        {r?.window && v.phase === 'PLAY' && <div className="ov3d-item" ref={reg('target', () => [0.2, 0.02, -0.2])}><div className="target-badge in3d"><span>{t('game.match', { n: r.window.target })}</span></div></div>}
        {r && <div className="ov3d-item" ref={reg('deckcount', () => [L.deck.p[0], 0, L.deck.p[2] + L.deck.h / 2 + 0.06])}><span className="deck-count in3d">{r.deckCount}</span></div>}
      </div>
    </div>
  );
});
export default Table3D;
export { TABLE_R };

/** The chair behind a seated figure; figures that stand (manifest "chair": false) get none. */
function SeatChair({ id, scene }: { id: string; scene: SceneKey | 'classic' }) {
  const e = useCharacterEntry(id);
  if (e && e.chair === false && e.model) return null;
  if (scene === 'classic') return <Chair p={[0, 0, CHAIR_BACK]} yaw={0} />;
  return <group position={[0, 0, CHAIR_BACK]}><GardenChair scene={scene} /></group>;
}
