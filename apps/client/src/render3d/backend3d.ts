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

export interface Ctx3 { camera: THREE.Camera; el: HTMLElement; group: THREE.Group; layout: Layout3; view: PlayerView; four: boolean }
let ctx: Ctx3 | null = null;
export function setCtx3(c: Ctx3 | null) { ctx = c; }
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
  private cur: Place3 & { flip: number; spin: number };
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
    this.inner.rotation.set(c.tilt ?? 0, 0, c.flip);
    this.inner.scale.set(c.w, 1, c.h);
  }
  private step() {
    const f = this.flipAnim;
    if (f) { const t = Math.min(1, (performance.now() - f.t0) / f.ms); this.cur.flip = lerp(f.from, f.to, ease(t)); if (t >= 1) this.flipAnim = null; if (!this.moving) this.apply(); }
  }
  private moving = false;
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
};
