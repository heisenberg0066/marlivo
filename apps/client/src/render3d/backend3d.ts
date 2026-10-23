// The 3D renderer's side of the animation director: anchors come from the world layout (projected to screen
// boxes that also carry the exact world placement), and flying cards are real 3D cards that arc, spin and flip
// over the table. The director itself is shared with 2D and does not know which renderer is on screen.
import * as THREE from 'three';
import type { CardFace, PlayerView } from '@marlivo/engine';
import type { Box, FlyBackend, SpriteLike, World3 } from '../render/fly';
import { speedScale, getPrefs } from '../prefs';
import { CARD_OPP, type Layout3, type Place3 } from './layout3d';
import { PLANE, backMat, faceMat, shadowMat, GLOW_COLOR } from './Card3D';
import { glowTexture } from './textures';
import { actorFor, stagedHidden, shoulderPos, handPos, armLength, easeInOut, easeOutBack, seg, type Side } from './actors';
import { TABLE_R, CARD_T } from './layout3d';

export interface Ctx3 { camera: THREE.Camera; el: HTMLElement; group: THREE.Group; layout: Layout3; view: PlayerView; four: boolean }
let ctx: Ctx3 | null = null;
export function setCtx3(c: Ctx3 | null) { ctx = c; if (c) checkHolds(); }
export const getCtx3 = () => ctx;

const v = new THREE.Vector3();
export function project(p: [number, number, number]): { x: number; y: number; inFront: boolean } {
  if (!ctx) return { x: 0, y: 0, inFront: false };
  const r = ctx.el.getBoundingClientRect();
  v.set(p[0], p[1], p[2]).project(ctx.camera);
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, inFront: v.z < 1 };
}
const ray = new THREE.Raycaster();
/** Screen point → point on the horizontal plane y = h. */
export function unproject(x: number, y: number, h = 0): [number, number, number] | null {
  if (!ctx) return null;
  const r = ctx.el.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), ctx.camera);
  const o = ray.ray.origin, d = ray.ray.direction;
  if (Math.abs(d.y) < 1e-5) return null;
  const t = (h - o.y) / d.y; if (t < 0) return null;
  return [o.x + d.x * t, h, o.z + d.z * t];
}

/** The world spot of my own held card: low in front of my eyes. */
export function myHandPlace(): Place3 {
  const cam = ctx?.camera;
  if (!cam) return { p: [0, 0.3, 1.4], yaw: 0, ...CARD_OPP };
  const f = new THREE.Vector3(); cam.getWorldDirection(f);
  const pos = cam.position.clone().addScaledVector(f, 0.62);
  pos.y -= 0.16;
  return { p: [pos.x, pos.y, pos.z], yaw: 0, w: 0.15, h: 0.21, tilt: -1.0 };
}

function placeFor(key: string): Place3 | null {
  if (!ctx) return null;
  const L = ctx.layout, view = ctx.view;
  const me = view.you;
  if (key.startsWith('slot:')) return L.slots[key.slice(5)] ?? null;
  if (key === 'deck') return { ...L.deck, p: [L.deck.p[0], L.deck.p[1] * 2 + 0.002, L.deck.p[2]] };
  const disc = view.round?.discard ?? [];
  if (key.startsWith('pile:')) { const i = Number(key.slice(5)); const f = disc[i]; return L.pile(i, f ? `${f.r}${f.s}` : 'next'); }
  if (key === 'pile-next') return L.pile(disc.length, 'next');
  if (key === 'hand-me' || key === 'handspot-me') return myHandPlace();
  const m = /^(hand|handspot|area)-(\d+)$/.exec(key);
  if (m) { const seat = Number(m[2]); if (seat === me && m[1] !== 'area') return myHandPlace(); return (m[1] === 'area' ? L.areas[seat] : L.hands[seat]) ?? null; }
  return null;
}

function boxOf(pl: Place3): Box {
  const c = project(pl.p);
  const e = project([pl.p[0] + Math.cos(pl.yaw) * pl.w / 2, pl.p[1], pl.p[2] - Math.sin(pl.yaw) * pl.w / 2]);
  const w = Math.max(8, Math.hypot(e.x - c.x, e.y - c.y) * 2);
  const w3: World3 = { p: [...pl.p], yaw: pl.yaw, w: pl.w, h: pl.h, tilt: pl.tilt, sx: c.x, sy: c.y };
  return { x: c.x, y: c.y, w, h: w * (pl.h / pl.w), rot: (-pl.yaw * 180) / Math.PI, w3 };
}

/** Box → world placement. Screen shifts the director made (e.g. "a bit higher") are applied on the table plane. */
function worldOf(b: Box): Place3 {
  if (b.w3) {
    const dx = b.x - b.w3.sx, dy = b.y - b.w3.sy;
    let p: [number, number, number] = [...b.w3.p];
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      const a = unproject(b.w3.sx, b.w3.sy, b.w3.p[1]), c = unproject(b.x, b.y, b.w3.p[1]);
      if (a && c) p = [p[0] + c[0] - a[0], p[1], p[2] + c[2] - a[2]];
    }
    return { p, yaw: b.w3.yaw, w: b.w3.w, h: b.w3.h, tilt: b.w3.tilt };
  }
  const p = unproject(b.x, b.y, 0.01) ?? [0, 0.01, 0];
  return { p, yaw: 0, ...CARD_OPP };
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
let glowM: THREE.MeshBasicMaterial | null = null;

class Sprite3D implements SpriteLike {
  root = new THREE.Group(); inner = new THREE.Group(); private face: THREE.Mesh; private glow: THREE.Mesh | null = null;
  private cur: Place3 & { flip: number; spin: number; roll?: number };
  private flipAnim: { from: number; to: number; t0: number; ms: number } | null = null;
  private raf = 0; private dead = false;
  constructor(from: Box, face: CardFace | null, up: boolean) {
    const pl = worldOf(from);
    this.cur = { ...pl, flip: up ? Math.PI : 0, spin: 0 };
    const back = new THREE.Mesh(PLANE, backMat()); back.position.y = 0.0009;
    const down = PLANE.clone().rotateZ(Math.PI);
    this.face = new THREE.Mesh(down, face ? faceMat(face, ctx?.four ?? false) : backMat()); this.face.position.y = -0.0009;
    this.face.visible = !!face;
    const sh = new THREE.Mesh(PLANE, shadowMat()); sh.position.set(0.004, -0.004, 0.006); sh.scale.set(1.3, 1, 1.25);
    this.inner.add(back, this.face, sh);
    this.root.add(this.inner);
    this.root.renderOrder = 5;
    this.apply();
    ctx?.group.add(this.root);
    const tick = () => { if (this.dead) return; this.step(); this.raf = requestAnimationFrame(tick); };
    this.raf = requestAnimationFrame(tick);
  }
  private apply(lift = 0) {
    const c = this.cur;
    this.root.position.set(c.p[0], c.p[1] + lift + Math.sin(Math.min(Math.PI, Math.max(0, c.flip))) * 0.05, c.p[2]);
    this.root.rotation.set(0, c.yaw + c.spin, 0);
    this.inner.rotation.set(c.tilt ?? 0, c.roll ?? 0, c.flip);
    this.inner.scale.set(c.w, 1, c.h);
  }
  private step() {
    const f = this.flipAnim;
    if (f) { const t = Math.min(1, (performance.now() - f.t0) / f.ms); this.cur.flip = lerp(f.from, f.to, ease(t)); if (t >= 1) this.flipAnim = null; if (!this.moving) this.apply(); }
  }
  private moving = false;
  /** Puts the card at an exact world placement (used while a hand carries it). */
  setPlace(p: THREE.Vector3, yaw: number, tilt: number, w: number, h: number, roll = 0, flip = 0) { const c = this.cur; c.p = [p.x, p.y, p.z]; c.yaw = yaw; c.tilt = tilt; c.w = w; c.h = h; c.roll = roll; c.flip = flip; c.spin = 0; this.apply(); }
  flip(up: boolean, ms = 260) { this.flipAnim = { from: this.cur.flip, to: up ? Math.PI : 0, t0: performance.now(), ms: Math.max(1, ms * speedScale()) }; }
  setFace(f: CardFace) { this.face.material = faceMat(f, ctx?.four ?? false); this.face.visible = true; }
  addClass(c: string) {
    if (c !== 'gold-trail' || this.glow) return;
    glowM ??= new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, color: GLOW_COLOR.gold, opacity: 0.9 });
    this.glow = new THREE.Mesh(PLANE, glowM); this.glow.scale.set(1.6, 1, 1.45); this.glow.position.y = -0.002;
    this.inner.add(this.glow);
  }
  move(to: Box, opts: { ms?: number; lift?: number; spin?: number; flipAt?: { up: boolean; at: number }; bounce?: boolean } = {}): Promise<void> {
    const ms = Math.max(1, (opts.ms ?? 420) * speedScale());
    const reduced = getPrefs().reduced;
    const from = { ...this.cur, p: [...this.cur.p] as [number, number, number] };
    const dest = worldOf(to);
    const lift = reduced ? 0.02 : ((opts.lift ?? 40) / 400) * 1.1 + 0.03;
    const spin = reduced ? 0 : ((opts.spin ?? 0) * Math.PI) / 180;
    let dyaw = dest.yaw - from.yaw; while (dyaw > Math.PI) dyaw -= 2 * Math.PI; while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
    if (opts.flipAt) setTimeout(() => this.flip(opts.flipAt!.up), ms * opts.flipAt.at);
    this.moving = true;
    return new Promise<void>((res) => {
      const t0 = performance.now();
      const frame = () => {
        if (this.dead) { res(); return; }
        const raw = Math.min(1, (performance.now() - t0) / ms);
        const t = ease(raw);
        const c = this.cur;
        c.p = [lerp(from.p[0], dest.p[0], t), lerp(from.p[1], dest.p[1], t), lerp(from.p[2], dest.p[2], t)];
        c.yaw = from.yaw + dyaw * t; c.spin = from.spin + spin * t;
        c.w = lerp(from.w, dest.w, t); c.h = lerp(from.h, dest.h, t);
        c.tilt = lerp(from.tilt ?? 0, dest.tilt ?? 0, t);
        let arc = Math.sin(Math.PI * raw) * lift;
        if (opts.bounce && raw > 0.85) arc += Math.sin(((raw - 0.85) / 0.15) * Math.PI) * 0.012;
        this.apply(arc);
        if (raw < 1) requestAnimationFrame(frame);
        else { this.moving = false; c.spin = 0; c.yaw = from.yaw + dyaw + spin; res(); }
      };
      requestAnimationFrame(frame);
    });
  }
  remove() { this.dead = true; cancelAnimationFrame(this.raf); this.root.removeFromParent(); }
}

const live = new Set<Sprite3D>();

// ---- staged actions: the character's hand carries the card -------------------------------------------------
const holds = new Map<number, { side: Side; target: THREE.Vector3; until: number }>();
const frame = () => new Promise<number>((r) => requestAnimationFrame(() => r(performance.now())));
function releaseSeat(seat: number) {
  const h = holds.get(seat); if (!h) return; holds.delete(seat);
  const a = actorFor(seat); const cmd = a?.cmd.arm[h.side]; if (!a || !cmd) return;
  const t0 = performance.now(), w0 = cmd.w, c0 = cmd.curl;
  const step = () => { const k = Math.min(1, (performance.now() - t0) / (380 * speedScale())); const e = easeInOut(k); cmd.w = w0 * (1 - e); cmd.curl = c0 * (1 - e); a.cmd.lookW *= 0.9; if (k < 1 && !holds.has(seat)) requestAnimationFrame(step); else if (k >= 1) { delete a.cmd.arm[h.side]; a.cmd.look = null; a.cmd.lookW = 0; } };
  requestAnimationFrame(step);
}
function checkHolds() { if (!ctx) return; for (const seat of [...holds.keys()]) if (ctx.view.round?.drawn?.by !== seat || performance.now() > holds.get(seat)!.until) releaseSeat(seat); }

// per-seat queue, so one character's actions never overlap while different characters act at the same time
const seatQ = new Map<number, Promise<void>>();
function queueSeat(seat: number, f: () => Promise<void>) { const prev = seatQ.get(seat) ?? Promise.resolve(); const next = prev.then(f, f).catch(() => {}); seatQ.set(seat, next); return next; }

/** An opponent peeks at one of its own cards: leans in, reaches the slot, the paw closes, lifts the card close to its
 *  face tilted towards itself (head down, focused look), then lays it back exactly in its slot. ~1 s at Normal. */
async function stagePeek(seat: number, slotId: string): Promise<void> {
  if (!ctx) return;
  const a = actorFor(seat); const sl = ctx.layout.slots[slotId]; const ch = ctx.layout.chars[seat];
  if (!a || !sl || !ch) return;
  const slotP = new THREE.Vector3(...sl.p);
  const side = (Object.keys(a.arms) as Side[]).sort((x, y) => shoulderPos(a.arms[x]!).distanceTo(slotP) - shoulderPos(a.arms[y]!).distanceTo(slotP))[0]!;
  const arm = a.arms[side]!;
  const c = new THREE.Vector3(...ch.p); const facing = slotP.clone().sub(c).setY(0).normalize();
  const head = new THREE.Vector3(); (a.head ?? a.root).getWorldPosition(head);
  const peekSpot = head.clone().addScaledVector(facing, 0.16); peekSpot.y -= 0.1;
  const grab = slotP.clone(); grab.y += 0.01;
  stagedHidden.add(slotId);
  const s = new Sprite3D(boxOf(sl), null, false); live.add(s);
  const start = handPos(arm); const cmd = { target: start.clone(), w: 0, curl: 0 };
  a.cmd.arm[side] = cmd; a.cmd.look = slotP.clone(); a.cmd.lookW = 0;
  const T = 1000 * speedScale(); const t0 = performance.now();
  const hp = new THREE.Vector3(), cp = new THREE.Vector3();
  try {
    for (;;) {
      const now = await frame(); const t = Math.min(1, (now - t0) / T);
      a.cmd.lean = t < 0.1 ? -0.04 * easeInOut(t / 0.1) : t < 0.38 ? -0.04 + 0.36 * easeInOut(seg(t, 0.1, 0.38)) : t < 0.75 ? 0.32 - 0.2 * easeInOut(seg(t, 0.38, 0.6)) : 0.12 + 0.2 * easeInOut(seg(t, 0.75, 0.86)) - 0.32 * easeOutBack(seg(t, 0.86, 1), 1.1);
      cmd.w = easeInOut(seg(t, 0.04, 0.24)) * (1 - easeInOut(seg(t, 0.9, 1)));
      if (t < 0.4) cmd.target.lerpVectors(start, grab, easeInOut(seg(t, 0.06, 0.38))).y += Math.sin(Math.PI * seg(t, 0.06, 0.38)) * 0.04;
      else if (t < 0.72) cmd.target.lerpVectors(grab, peekSpot, easeOutBack(seg(t, 0.42, 0.62), 1.2));
      else cmd.target.lerpVectors(peekSpot, grab, easeInOut(seg(t, 0.72, 0.88)));
      cmd.curl = easeInOut(seg(t, 0.34, 0.42)) * (1 - easeInOut(seg(t, 0.86, 0.94)));
      a.cmd.lookW = easeInOut(seg(t, 0, 0.15)) * (1 - 0.6 * seg(t, 0.9, 1));
      a.cmd.focus = easeInOut(seg(t, 0.45, 0.6)) * (1 - easeInOut(seg(t, 0.75, 0.88)));
      // the card: still in its slot until the paw closes, then in the hand, then laid back exactly in the slot
      const inHand = easeInOut(seg(t, 0.38, 0.46)) * (1 - easeInOut(seg(t, 0.84, 0.9)));
      handPos(arm, hp);
      const up = easeInOut(seg(t, 0.42, 0.6)) * (1 - easeInOut(seg(t, 0.72, 0.86)));
      cp.copy(slotP).lerp(hp, inHand); cp.y += sl.h * 0.32 * up;
      // angle the lifted card toward the camera (yaw + slight roll) so it never reads razor-thin / edge-on
      const camYawOff = (-Math.sin(sl.yaw) * 0.45 + (Math.cos(sl.yaw) < -0.5 ? (side === 'L' ? 0.28 : -0.28) : 0)) * up;
      const rollOff = (side === 'L' ? -0.16 : 0.16) * up;
      s.setPlace(cp, sl.yaw + camYawOff, (sl.tilt ?? 0) + 1.08 * up, sl.w, sl.h, rollOff);
      a.cmd.look!.copy(cp);
      if (t >= 1) break;
    }
  } finally {
    s.remove(); live.delete(s); stagedHidden.delete(slotId);
    delete a.cmd.arm[side]; a.cmd.lean = 0; a.cmd.focus = 0; a.cmd.lookW = 0; a.cmd.look = null;
  }
}

/** Draw by an opponent: the card slides low along the felt towards the seat, the character leans in and reaches
 *  (two-bone IK), the paw closes on it, the hand lifts it to the face (head follows, focused look), then lowers it to
 *  the hold spot where the held card rests until it is thrown or swapped. ~1.1 s at Normal speed. */
async function stageDraw(seat: number, face: CardFace | null): Promise<void> {
  if (!ctx) return;
  const L = ctx.layout; const a = actorFor(seat); const hold = L.hands[seat]; const ch = L.chars[seat]; const S = L.seats[seat];
  if (!a || !hold || !ch || !S) return;
  const deckPl = placeFor('deck')!; const deck = new THREE.Vector3(...deckPl.p);
  // the arm on the deck's side reaches
  const sides = (Object.keys(a.arms) as Side[]);
  const side = sides.sort((x, y) => shoulderPos(a.arms[x]!).distanceTo(deck) - shoulderPos(a.arms[y]!).distanceTo(deck))[0]!;
  const arm = a.arms[side]!;
  const sh = shoulderPos(arm); const len = armLength(arm);
  // pickup point on the felt: towards the deck, as far in as the arm reaches with a lean, never off the table
  const c = new THREE.Vector3(...ch.p); const dirIn = deck.clone().sub(c).setY(0).normalize();
  const tableY = CARD_T * 2;
  const reachH = Math.sqrt(Math.max(0, (len * 1.12) ** 2 - (sh.y - tableY) ** 2));
  const shAlong = sh.clone().sub(c).dot(dirIn);
  // just inside the rim at least (the current casino room seats are far from the table: the hand meets the card there)
  const along = Math.max(c.length() - TABLE_R + 0.06, Math.min(shAlong + reachH * 0.96, c.length() - 0.22));
  const P = c.clone().addScaledVector(dirIn, along); P.y = tableY;
  // a little to the reaching arm's side
  const lat = sh.clone().sub(c); lat.y = 0; lat.addScaledVector(dirIn, -lat.dot(dirIn)); P.addScaledVector(lat, 0.6);
  const head = new THREE.Vector3(); (a.head ?? a.root).getWorldPosition(head);
  const facing = dirIn.clone();
  const lookSpot = head.clone().addScaledVector(facing, 0.17); lookSpot.y -= 0.06;
  const holdT = new THREE.Vector3(...hold.p); holdT.y -= hold.h * 0.3;
  const yawSeat = S.a; const cw = hold.w, chh = hold.h;
  const s = new Sprite3D(boxOf(deckPl), face, false); live.add(s);
  const start = handPos(arm); const cmd = { target: start.clone(), w: 0, curl: 0 };
  a.cmd.arm[side] = cmd; a.cmd.look = deck.clone(); a.cmd.lookW = 0;
  holds.delete(seat);
  const T = 1100 * speedScale(); const t0 = performance.now();
  const yaw0 = deckPl.yaw; let dy = yawSeat - yaw0; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
  const cardPos = new THREE.Vector3(); const hp = new THREE.Vector3();
  for (;;) {
    const now = await frame(); const t = Math.min(1, (now - t0) / T);
    // body: anticipation back, lean in for the reach, settle back with a little overshoot
    a.cmd.lean = t < 0.12 ? -0.06 * easeInOut(t / 0.12) : t < 0.45 ? -0.06 + 0.32 * easeInOut(seg(t, 0.12, 0.45)) : 0.26 - 0.26 * easeOutBack(seg(t, 0.45, 0.85), 1.2);
    // arm: rest -> pickup -> face -> hold
    const r1 = easeInOut(seg(t, 0.1, 0.44)), r2 = easeOutBack(seg(t, 0.47, 0.76), 1.3), r3 = easeInOut(seg(t, 0.84, 1));
    cmd.w = easeInOut(seg(t, 0.06, 0.3));
    if (t < 0.47) cmd.target.lerpVectors(start, P, r1).y += Math.sin(Math.PI * r1) * 0.05;
    else if (t < 0.84) cmd.target.lerpVectors(P, lookSpot, r2);
    else cmd.target.lerpVectors(lookSpot, holdT, r3);
    cmd.curl = easeInOut(seg(t, 0.4, 0.5));
    a.cmd.lookW = easeInOut(seg(t, 0, 0.2));
    a.cmd.focus = easeInOut(seg(t, 0.55, 0.7)) * (1 - seg(t, 0.85, 1));
    // card: slides on the felt to the pickup point, then rides in the hand
    if (t < 0.45) {
      const k = easeInOut(seg(t, 0, 0.4));
      cardPos.lerpVectors(deck, P, k); cardPos.y = tableY + 0.002 + Math.sin(Math.PI * k) * 0.004;
      s.setPlace(cardPos, yaw0 + dy * k, 0, deckPl.w + (cw - deckPl.w) * k, deckPl.h + (chh - deckPl.h) * k);
      a.cmd.look!.copy(cardPos);
    } else {
      handPos(arm, hp); const up = seg(t, 0.45, 0.62);
      // if the hand stopped a little short of the card, the card is drawn into the paw over the grab
      const g = easeInOut(seg(t, 0.45, 0.55));
      cardPos.copy(P).lerp(hp, g); cardPos.y += chh * 0.34 * up;
      const tilt = (hold.tilt ?? 1.08) * easeOutBack(up, 1.05);
      const settle = easeInOut(seg(t, 0.84, 1));
      if (t > 0.84) cardPos.lerp(new THREE.Vector3(...hold.p), settle);
      // yaw/roll toward the camera while lifted and in the hold spot so the card is never edge-on
      const holdYaw = hold.yaw ?? yawSeat;
      const liftYaw = yawSeat - Math.sin(yawSeat) * 0.45 + (Math.cos(yawSeat) < -0.5 ? (side === 'L' ? 0.28 : -0.28) : 0);
      const cardYaw = yawSeat + (liftYaw - yawSeat) * easeInOut(up) * (1 - settle) + (holdYaw - yawSeat) * settle;
      const rollOff = (side === 'L' ? -0.15 : 0.15) * easeInOut(up) * (1 - 0.5 * settle);
      s.setPlace(cardPos, cardYaw, tilt, cw, chh, rollOff);
      a.cmd.look!.copy(cardPos);
    }
    if (t >= 1) break;
  }
  s.remove(); live.delete(s);
  holds.set(seat, { side, target: cmd.target, until: performance.now() + 30000 });
  a.cmd.lookW = 0.5; a.cmd.focus = 0;
}

/** Throw a held card to the discard pile: the holding hand swings forward to the rim, opens its paw, and releases
 *  the card onto the pile as it flips face-up. */
async function stageThrow(seat: number, face: CardFace | null, pileIdx: number): Promise<void> {
  if (!ctx) return;
  const L = ctx.layout; const a = actorFor(seat); const hold = L.hands[seat]; const ch = L.chars[seat];
  const pilePl = placeFor('pile:' + pileIdx) ?? placeFor('pile-next');
  if (!a || !hold || !ch || !pilePl) return;
  const h = holds.get(seat); holds.delete(seat);
  const pileP = new THREE.Vector3(...pilePl.p);
  const side: Side = h?.side ?? (Object.keys(a.arms) as Side[]).sort((x, y) => shoulderPos(a.arms[x]!).distanceTo(pileP) - shoulderPos(a.arms[y]!).distanceTo(pileP))[0]!;
  const arm = a.arms[side]!;
  const c = new THREE.Vector3(...ch.p); const dir = pileP.clone().sub(c).setY(0).normalize();
  const relP = c.clone().addScaledVector(dir, Math.max(c.length() - TABLE_R + 0.05, 0.24)); relP.y = 0.08;
  const startH = new THREE.Vector3(...hold.p);
  const s = new Sprite3D(boxOf(hold), face, false); live.add(s);
  const cmd = a.cmd.arm[side] ?? { target: handPos(arm), w: 1, curl: 1 };
  a.cmd.arm[side] = cmd; a.cmd.look = startH.clone(); a.cmd.lookW = 0.85;
  const T = 420 * speedScale(); const t0 = performance.now();
  const hp = new THREE.Vector3(), cp = new THREE.Vector3();
  const yaw0 = hold.yaw; let dy = pilePl.yaw - yaw0; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
  try {
    for (;;) {
      const now = await frame(); const t = Math.min(1, (now - t0) / T);
      a.cmd.lean = 0.22 * Math.sin(Math.PI * seg(t, 0, 0.85));
      if (t < 0.48) {
        const k = easeInOut(t / 0.48);
        cmd.target.lerpVectors(startH, relP, k); cmd.w = 1; cmd.curl = 1 - easeInOut(seg(t, 0.32, 0.48));
        handPos(arm, hp); cp.copy(startH).lerp(hp, 0.85);
        s.setPlace(cp, yaw0 + dy * k * 0.3, (hold.tilt ?? 1.08) * (1 - k * 0.7), hold.w, hold.h, 0, Math.PI * easeInOut(seg(t, 0.2, 0.55)));
      } else {
        const k = easeOutBack(seg(t, 0.45, 1), 1.08);
        const kLin = easeInOut(seg(t, 0.45, 1));
        cmd.w = 1 - kLin; cmd.curl = 0;
        cp.lerpVectors(relP, pileP, k); cp.y = THREE.MathUtils.lerp(relP.y, pileP.y, kLin) + Math.sin(Math.PI * kLin) * 0.04;
        s.setPlace(cp, yaw0 + dy * (0.3 + 0.7 * kLin), (hold.tilt ?? 1.08) * 0.3 * (1 - kLin), hold.w + (pilePl.w - hold.w) * kLin, hold.h + (pilePl.h - hold.h) * kLin, 0, Math.PI);
      }
      a.cmd.look!.copy(cp);
      if (t >= 1) break;
    }
  } finally {
    s.remove(); live.delete(s);
    delete a.cmd.arm[side]; a.cmd.lean = 0; a.cmd.lookW = 0; a.cmd.look = null;
  }
}

/** Swap the held drawn card into a slot and flick the slot's old card onto the pile. */
async function stageSwap(seat: number, slotId: string, outFace: CardFace | null, pileIdx: number): Promise<void> {
  if (!ctx) return;
  const L = ctx.layout; const a = actorFor(seat); const hold = L.hands[seat]; const sl = L.slots[slotId]; const ch = L.chars[seat];
  const pilePl = placeFor('pile:' + pileIdx) ?? placeFor('pile-next');
  if (!a || !hold || !sl || !ch || !pilePl) return;
  const h = holds.get(seat); holds.delete(seat);
  const slotP = new THREE.Vector3(...sl.p), pileP = new THREE.Vector3(...pilePl.p), holdP = new THREE.Vector3(...hold.p);
  const side: Side = h?.side ?? (Object.keys(a.arms) as Side[]).sort((x, y) => shoulderPos(a.arms[x]!).distanceTo(slotP) - shoulderPos(a.arms[y]!).distanceTo(slotP))[0]!;
  const arm = a.arms[side]!;
  const sIn = new Sprite3D(boxOf(hold), null, false); live.add(sIn);
  const sOut = new Sprite3D(boxOf(sl), outFace, false); live.add(sOut);
  const cmd = a.cmd.arm[side] ?? { target: handPos(arm), w: 1, curl: 1 };
  a.cmd.arm[side] = cmd; a.cmd.look = slotP.clone(); a.cmd.lookW = 0.85;
  const T = 580 * speedScale(); const t0 = performance.now();
  const hp = new THREE.Vector3(), cpIn = new THREE.Vector3(), cpOut = new THREE.Vector3();
  try {
    for (;;) {
      const now = await frame(); const t = Math.min(1, (now - t0) / T);
      a.cmd.lean = 0.25 * Math.sin(Math.PI * seg(t, 0, 0.9));
      const toSlot = easeInOut(seg(t, 0, 0.55));
      cmd.target.lerpVectors(holdP, slotP, toSlot);
      cmd.w = 1 - easeInOut(seg(t, 0.65, 1));
      cmd.curl = 1 - easeInOut(seg(t, 0.48, 0.65));
      handPos(arm, hp);
      cpIn.copy(holdP).lerp(slotP, toSlot); cpIn.lerp(hp, 0.6 * (1 - seg(t, 0.45, 0.6)));
      cpIn.y += Math.sin(Math.PI * toSlot) * 0.03;
      sIn.setPlace(cpIn, THREE.MathUtils.lerp(hold.yaw, sl.yaw, toSlot), (hold.tilt ?? 1.08) * (1 - toSlot), sl.w, sl.h);
      const toPile = easeInOut(seg(t, 0.28, 0.95));
      cpOut.lerpVectors(slotP, pileP, toPile); cpOut.y += Math.sin(Math.PI * toPile) * 0.05;
      sOut.setPlace(cpOut, THREE.MathUtils.lerp(sl.yaw, pilePl.yaw, toPile), 0, sl.w, sl.h, 0, Math.PI * easeInOut(seg(t, 0.35, 0.7)));
      a.cmd.look!.copy(t < 0.5 ? cpIn : cpOut);
      if (t >= 1) break;
    }
  } finally {
    sIn.remove(); sOut.remove(); live.delete(sIn); live.delete(sOut);
    delete a.cmd.arm[side]; a.cmd.lean = 0; a.cmd.lookW = 0; a.cmd.look = null;
  }
}

/** Throw a matched slot card onto the pile: the character reaches its slot, grabs the card, and flicks it onto the pile. */
async function stageMatchThrow(seat: number, slotId: string, face: CardFace, pileIdx: number): Promise<void> {
  if (!ctx) return;
  const L = ctx.layout; const a = actorFor(seat); const sl = L.slots[slotId]; const ch = L.chars[seat];
  const pilePl = placeFor('pile:' + pileIdx) ?? placeFor('pile-next');
  if (!a || !sl || !ch || !pilePl) return;
  const slotP = new THREE.Vector3(...sl.p), pileP = new THREE.Vector3(...pilePl.p);
  const side = (Object.keys(a.arms) as Side[]).sort((x, y) => shoulderPos(a.arms[x]!).distanceTo(slotP) - shoulderPos(a.arms[y]!).distanceTo(slotP))[0]!;
  const arm = a.arms[side]!;
  const c = new THREE.Vector3(...ch.p); const dir = pileP.clone().sub(c).setY(0).normalize();
  const relP = slotP.clone().addScaledVector(dir, 0.14); relP.y = 0.06;
  stagedHidden.add(slotId);
  const s = new Sprite3D(boxOf(sl), face, true); live.add(s);
  const start = handPos(arm); const cmd = { target: start.clone(), w: 0, curl: 0 };
  a.cmd.arm[side] = cmd; a.cmd.look = slotP.clone(); a.cmd.lookW = 0.85;
  const T = 380 * speedScale(); const t0 = performance.now();
  const cp = new THREE.Vector3();
  try {
    for (;;) {
      const now = await frame(); const t = Math.min(1, (now - t0) / T);
      a.cmd.lean = 0.24 * Math.sin(Math.PI * t);
      cmd.w = easeInOut(seg(t, 0, 0.25)) * (1 - easeInOut(seg(t, 0.65, 1)));
      if (t < 0.35) cmd.target.lerpVectors(start, slotP, easeInOut(t / 0.35));
      else cmd.target.lerpVectors(slotP, relP, easeInOut(seg(t, 0.35, 0.7)));
      cmd.curl = easeInOut(seg(t, 0.25, 0.38)) * (1 - easeInOut(seg(t, 0.55, 0.7)));
      const fly = easeInOut(seg(t, 0.32, 1));
      cp.lerpVectors(slotP, pileP, fly); cp.y += Math.sin(Math.PI * fly) * 0.055;
      s.setPlace(cp, THREE.MathUtils.lerp(sl.yaw, pilePl.yaw, fly), 0, sl.w, sl.h, 0, Math.PI);
      a.cmd.look!.copy(cp);
      if (t >= 1) break;
    }
  } finally {
    s.remove(); live.delete(s); stagedHidden.delete(slotId);
    delete a.cmd.arm[side]; a.cmd.lean = 0; a.cmd.lookW = 0; a.cmd.look = null;
  }
}

/** Queen peek: if the card is the owner's own slot, use stagePeek; if it's an opponent's slot, lean + reach toward it
 *  while the card slides slightly toward the peeking player, lifts for a look, and slides back. */
async function stageQueenPeek(owner: number, slotId: string): Promise<void> {
  if (!ctx) return;
  const sl = ctx.layout.slots[slotId]; if (!sl) return;
  if (sl.owner === owner) { await stagePeek(owner, slotId); return; }
  const a = actorFor(owner); const ch = ctx.layout.chars[owner]; if (!a || !ch) return;
  const slotP = new THREE.Vector3(...sl.p), c = new THREE.Vector3(...ch.p);
  const side = (Object.keys(a.arms) as Side[]).sort((x, y) => shoulderPos(a.arms[x]!).distanceTo(slotP) - shoulderPos(a.arms[y]!).distanceTo(slotP))[0]!;
  const arm = a.arms[side]!;
  const dir = slotP.clone().sub(c).setY(0).normalize();
  const reachP = c.clone().addScaledVector(dir, Math.max(c.length() - TABLE_R + 0.04, 0.25)); reachP.y = 0.06;
  const head = new THREE.Vector3(); (a.head ?? a.root).getWorldPosition(head);
  const lookSpot = reachP.clone().lerp(head, 0.35); lookSpot.y = 0.18;
  stagedHidden.add(slotId);
  const s = new Sprite3D(boxOf(sl), null, false); s.addClass('gold-trail'); live.add(s);
  const start = handPos(arm); const cmd = { target: start.clone(), w: 0, curl: 0 };
  a.cmd.arm[side] = cmd; a.cmd.look = slotP.clone(); a.cmd.lookW = 0.9;
  const T = 1150 * speedScale(); const t0 = performance.now();
  const cp = new THREE.Vector3();
  const yawOwner = ctx.layout.seats[owner]?.a ?? sl.yaw;
  try {
    for (;;) {
      const now = await frame(); const t = Math.min(1, (now - t0) / T);
      const io = easeInOut(seg(t, 0, 0.35)) * (1 - easeInOut(seg(t, 0.72, 1)));
      a.cmd.lean = 0.28 * io; a.cmd.focus = io;
      cmd.w = easeInOut(seg(t, 0.04, 0.25)) * (1 - easeInOut(seg(t, 0.82, 1)));
      cmd.target.lerpVectors(start, reachP, io);
      cmd.curl = 0.85 * io;
      cp.lerpVectors(slotP, lookSpot, io);
      const camYaw = yawOwner - Math.sin(yawOwner) * 0.42;
      s.setPlace(cp, THREE.MathUtils.lerp(sl.yaw, camYaw, io), 1.02 * io, sl.w, sl.h, (side === 'L' ? -0.14 : 0.14) * io);
      a.cmd.look!.copy(cp);
      if (t >= 1) break;
    }
  } finally {
    s.remove(); live.delete(s); stagedHidden.delete(slotId);
    delete a.cmd.arm[side]; a.cmd.lean = 0; a.cmd.focus = 0; a.cmd.lookW = 0; a.cmd.look = null;
  }
}

/** Jack swap: the owner reaches out with both hands (or its reaching hand) while the two cards slide low across the table. */
async function stageJackSwap(owner: number, slotA: string, slotB: string): Promise<void> {
  if (!ctx) return;
  const L = ctx.layout; const slA = L.slots[slotA], slB = L.slots[slotB]; if (!slA || !slB) return;
  const a = actorFor(owner); const ch = L.chars[owner];
  const pA = new THREE.Vector3(...slA.p), pB = new THREE.Vector3(...slB.p);
  stagedHidden.add(slotA); stagedHidden.add(slotB);
  const sA = new Sprite3D(boxOf(slA), null, false), sB = new Sprite3D(boxOf(slB), null, false);
  sA.addClass('gold-trail'); sB.addClass('gold-trail'); live.add(sA); live.add(sB);
  const c = ch ? new THREE.Vector3(...ch.p) : new THREE.Vector3();
  if (a && ch) {
    for (const [sd, targetP] of [['L', pA], ['R', pB]] as [Side, THREE.Vector3][]) {
      const arm = a.arms[sd]; if (!arm) continue;
      const d = targetP.clone().sub(c).setY(0).normalize();
      const rp = c.clone().addScaledVector(d, Math.max(c.length() - TABLE_R + 0.04, 0.24)); rp.y = 0.05;
      a.cmd.arm[sd] = { target: rp, w: 0, curl: 0.6 };
    }
    a.cmd.look = pA.clone().add(pB).multiplyScalar(0.5); a.cmd.lookW = 0.85;
  }
  const T = 820 * speedScale(); const t0 = performance.now();
  const cA = new THREE.Vector3(), cB = new THREE.Vector3();
  try {
    for (;;) {
      const now = await frame(); const t = Math.min(1, (now - t0) / T);
      const k = easeInOut(t), arch = Math.sin(Math.PI * t);
      if (a) {
        a.cmd.lean = 0.24 * arch;
        for (const cmd of Object.values(a.cmd.arm)) if (cmd) cmd.w = arch * 0.9;
      }
      cA.lerpVectors(pA, pB, k); cA.z += arch * 0.05; cA.y = CARD_T * 2 + arch * 0.035;
      cB.lerpVectors(pB, pA, k); cB.z -= arch * 0.05; cB.y = CARD_T * 2 + arch * 0.015;
      sA.setPlace(cA, THREE.MathUtils.lerp(slA.yaw, slB.yaw, k), 0, slB.w, slB.h);
      sB.setPlace(cB, THREE.MathUtils.lerp(slB.yaw, slA.yaw, k), 0, slA.w, slA.h);
      if (t >= 1) break;
    }
  } finally {
    sA.remove(); sB.remove(); live.delete(sA); live.delete(sB);
    stagedHidden.delete(slotA); stagedHidden.delete(slotB);
    if (a) { a.cmd.arm = {}; a.cmd.lean = 0; a.cmd.lookW = 0; a.cmd.look = null; }
  }
}

/** 10 give / receive penalty: the card slides from the deck to the target slot; the giver reaches to push it and the
 *  receiver reacts with a surprised lean-back and reaches to take it into the slot. */
async function stagePenaltyCard(giver: number | null, toSeat: number, slotId: string): Promise<void> {
  if (!ctx) return;
  const L = ctx.layout; const sl = L.slots[slotId]; const deckPl = placeFor('deck');
  if (!sl || !deckPl) return;
  const aG = giver != null ? actorFor(giver) : null;
  const aR = actorFor(toSeat);
  const deckP = new THREE.Vector3(...deckPl.p), slotP = new THREE.Vector3(...sl.p);
  const s = new Sprite3D(boxOf(deckPl), null, false); live.add(s);
  const sideG = aG ? (Object.keys(aG.arms) as Side[])[0] : undefined;
  const sideR = aR ? (Object.keys(aR.arms) as Side[]).sort((x, y) => shoulderPos(aR.arms[x]!).distanceTo(slotP) - shoulderPos(aR.arms[y]!).distanceTo(slotP))[0] : undefined;
  if (aG && sideG && L.chars[giver!]) {
    const cG = new THREE.Vector3(...L.chars[giver!]!.p);
    const dG = deckP.clone().sub(cG).setY(0).normalize();
    aG.cmd.arm[sideG] = { target: cG.clone().addScaledVector(dG, Math.max(cG.length() - TABLE_R + 0.04, 0.24)).setY(0.05), w: 0, curl: 0.5 };
    aG.cmd.look = slotP.clone(); aG.cmd.lookW = 0.8;
  }
  if (aR && sideR) {
    aR.cmd.arm[sideR] = { target: slotP.clone().setY(0.03), w: 0, curl: 0.5 };
    aR.cmd.look = deckP.clone(); aR.cmd.lookW = 0.9; aR.cmd.blinkUntil = performance.now() + 520;
  }
  const T = 420 * speedScale(); const t0 = performance.now();
  const cp = new THREE.Vector3();
  try {
    for (;;) {
      const now = await frame(); const t = Math.min(1, (now - t0) / T);
      const k = easeInOut(t);
      cp.lerpVectors(deckP, slotP, k); cp.y = CARD_T * 2 + Math.sin(Math.PI * t) * 0.025;
      s.setPlace(cp, THREE.MathUtils.lerp(deckPl.yaw, sl.yaw, k), 0, sl.w, sl.h);
      if (aG && sideG && aG.cmd.arm[sideG]) {
        const wG = Math.sin(Math.PI * seg(t, 0, 0.65));
        aG.cmd.lean = 0.2 * wG; aG.cmd.arm[sideG]!.w = wG;
      }
      if (aR && sideR && aR.cmd.arm[sideR]) {
        // surprise pull-back first, then reach to settle the penalty card
        aR.cmd.lean = t < 0.45 ? -0.14 * Math.sin(Math.PI * (t / 0.45)) : 0.16 * Math.sin(Math.PI * seg(t, 0.45, 1));
        aR.cmd.arm[sideR]!.w = Math.sin(Math.PI * seg(t, 0.35, 1)) * 0.85;
        aR.cmd.look!.copy(cp);
      }
      if (t >= 1) break;
    }
  } finally {
    s.remove(); live.delete(s);
    if (aG && sideG) { delete aG.cmd.arm[sideG]; aG.cmd.lean = 0; aG.cmd.lookW = 0; aG.cmd.look = null; }
    if (aR && sideR) { delete aR.cmd.arm[sideR]; aR.cmd.lean = 0; aR.cmd.lookW = 0; aR.cmd.look = null; }
  }
}

export const backend3d: FlyBackend = {
  rect: (key) => { const pl = placeFor(key); return pl ? boxOf(pl) : null; },
  all: () => {
    const m = new Map<string, Box>();
    if (!ctx) return m;
    const L = ctx.layout, view = ctx.view;
    for (const id of Object.keys(L.slots)) m.set('slot:' + id, boxOf(L.slots[id]!));
    m.set('deck', boxOf(placeFor('deck')!));
    const disc = view.round?.discard ?? [];
    for (let i = Math.max(0, disc.length - 14); i < disc.length; i++) m.set('pile:' + i, boxOf(placeFor('pile:' + i)!));
    for (const seat of Object.keys(L.seats)) {
      const s = Number(seat);
      if (s === view.you) { const b = boxOf(myHandPlace()); m.set('hand-me', b); m.set('handspot-me', b); }
      else { const b = boxOf(L.hands[s]!); m.set(`hand-${s}`, b); m.set(`handspot-${s}`, b); }
      m.set(`area-${s}`, boxOf(L.areas[s]!));
    }
    return m;
  },
  sprite: (from, face, up) => { const s = new Sprite3D(from, face, up); live.add(s); const rm = s.remove.bind(s); s.remove = () => { live.delete(s); rm(); }; return s; },
  clear: () => { for (const s of [...live]) s.remove(); },
  act: (kind, p) => {
    if (!ctx || getPrefs().reduced) return null;
    const has = (s: number | null | undefined) => { if (s == null) return false; const a = actorFor(s); return !!(a && Object.keys(a.arms).length); };
    if (kind === 'draw') return has(p.seat) ? stageDraw(p.seat, p.face) : null;
    if (kind === 'throw') return has(p.seat) ? stageThrow(p.seat, p.face, p.pileIdx) : null;
    if (kind === 'swap') return has(p.seat) ? stageSwap(p.seat, p.slot, p.out, p.pileIdx) : null;
    if (kind === 'matchThrow') return has(p.seat) ? stageMatchThrow(p.seat, p.slot, p.face, p.pileIdx) : null;
    if (kind === 'queenPeek') return has(p.owner) ? stageQueenPeek(p.owner, p.slot) : null;
    if (kind === 'jackSwap') return has(p.owner) ? stageJackSwap(p.owner, p.a, p.b) : null;
    if (kind === 'tenGive') return has(p.owner) || has(p.to) ? stagePenaltyCard(p.owner, p.to, p.slot) : null;
    if (kind === 'penalty') return has(p.seat) ? stagePenaltyCard(null, p.seat, p.slot) : null;
    return null;
  },
  release: (seat) => releaseSeat(seat),
  peek: (seat, slot) => { if (!ctx || getPrefs().reduced) return false; const a = actorFor(seat); if (!a || !Object.keys(a.arms).length || !ctx.layout.slots[slot]) return false; queueSeat(seat, () => stagePeek(seat, slot)); return true; },
};
