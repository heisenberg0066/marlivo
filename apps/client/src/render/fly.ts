// Screen-space flying cards (draws, throws, deals, penalties, swaps). Imperative DOM + Web Animations API so dozens
// of sprites stay smooth on a phone. Rects come from the real (tilted) table elements.
import type { CardFace } from '@marlivo/engine';
import { cardFrontSvg, CARD_BACK_SVG } from './cardArt';
import { getPrefs, speedScale } from '../prefs';

let layer: HTMLDivElement | null = null;
export function setFlyLayer(el: HTMLDivElement | null) { layer = el; }

/** A screen box (px). A 3D renderer also attaches `w3`, the exact world placement it came from. */
export interface Box { x: number; y: number; w: number; h: number; rot?: number; w3?: World3 }
export interface World3 { p: [number, number, number]; yaw: number; w: number; h: number; tilt?: number; sx: number; sy: number }
export const rectOf = (el: Element | null | undefined): Box | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  const rot = Number((el as HTMLElement).dataset.rot ?? 0);
  // For rotated cards (side seats) the bounding box is swapped; keep the card's own aspect.
  const side = Math.abs(rot) % 180 === 90;
  return side ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.height, h: r.width, rot } : { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, rot };
};
export const q = (sel: string) => document.querySelector(sel);

export class Sprite {
  el: HTMLDivElement; inner: HTMLDivElement; private faceUp: boolean;
  constructor(public box: Box, front: CardFace | null, startUp: boolean) {
    this.el = document.createElement('div');
    this.el.className = 'fly-card';
    this.inner = document.createElement('div');
    this.inner.className = 'fly-inner' + (startUp ? ' up' : '');
    this.inner.innerHTML = `<div class="face front">${front ? cardFrontSvg(front, getPrefs().fourColor) : ''}</div><div class="face back">${CARD_BACK_SVG}</div>`;
    this.el.appendChild(this.inner);
    this.faceUp = startUp;
    this.place(box);
    layer?.appendChild(this.el);
  }
  private tf(b: Box, lift = 0, spin = 0, scale = 1) { return `translate(${b.x - b.w / 2}px, ${b.y - b.h / 2 - lift}px) rotate(${(b.rot ?? 0) + spin}deg) scale(${scale})`; }
  place(b: Box) { this.box = b; this.el.style.width = b.w + 'px'; this.el.style.height = b.h + 'px'; this.el.style.transform = this.tf(b); }
  setFace(f: CardFace) { (this.inner.querySelector('.front') as HTMLElement).innerHTML = cardFrontSvg(f, getPrefs().fourColor); }
  flip(up: boolean, ms = 260) {
    if (up === this.faceUp) return;
    this.faceUp = up;
    this.inner.style.transition = `transform ${ms * speedScale()}ms ease`;
    this.inner.classList.toggle('up', up);
  }
  /** Moves along an arc (lift = height of the arc in px), with optional spin. */
  async move(to: Box, opts: { ms?: number; lift?: number; spin?: number; flipAt?: { up: boolean; at: number }; easing?: string; bounce?: boolean } = {}) {
    const ms = Math.max(1, (opts.ms ?? 420) * speedScale());
    const from = this.box;
    const mid: Box = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, w: (from.w + to.w) / 2, h: (from.h + to.h) / 2, rot: ((from.rot ?? 0) + (to.rot ?? 0)) / 2 };
    const lift = getPrefs().reduced ? 0 : opts.lift ?? 40;
    const spin = getPrefs().reduced ? 0 : opts.spin ?? 0;
    const frames: Keyframe[] = [
      { transform: this.tf(from), width: from.w + 'px', height: from.h + 'px' },
      { transform: this.tf(mid, lift, spin / 2, 1.08), width: mid.w + 'px', height: mid.h + 'px', offset: 0.5 },
      ...(opts.bounce ? [{ transform: this.tf(to, -4, spin, 1.02), width: to.w + 'px', height: to.h + 'px', offset: 0.86 } as Keyframe] : []),
      { transform: this.tf(to, 0, spin), width: to.w + 'px', height: to.h + 'px' },
    ];
    if (opts.flipAt) setTimeout(() => this.flip(opts.flipAt!.up), ms * opts.flipAt.at);
    const anim = this.el.animate(frames, { duration: ms, easing: opts.easing ?? 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' });
    await anim.finished.catch(() => {});
    this.place({ ...to, rot: (to.rot ?? 0) + spin });
    anim.cancel();
  }
  remove() { this.el.remove(); }
  addClass(c: string) { this.el.classList.add(c); }
}

/** What the animation director needs from a renderer: where things are, and flying cards. 2D uses the DOM;
 *  the 3D table registers its own backend while it is mounted. */
export interface SpriteLike {
  move(to: Box, opts?: { ms?: number; lift?: number; spin?: number; flipAt?: { up: boolean; at: number }; easing?: string; bounce?: boolean }): Promise<void>;
  flip(up: boolean, ms?: number): void;
  setFace(f: CardFace): void;
  addClass(c: string): void;
  remove(): void;
}
export interface FlyBackend {
  /** Keys: `slot:<id>`, `deck`, `hand-me`, `handspot-me`, `hand-<seat>`, `handspot-<seat>`, `area-<seat>`, `pile:<i>`, `pile-next`. */
  rect(key: string): Box | null;
  /** Everything at once (taken before a view changes). */
  all(): Map<string, Box>;
  sprite(from: Box, face: CardFace | null, faceUp: boolean): SpriteLike;
  clear(): void;
  /** Optional: a renderer that can stage a whole action itself (3D: a character's hand carries the card).
   *  Returns null when it cannot (no rigged character there), and the caller falls back to plain flights. */
  act?(
    kind: 'draw' | 'throw' | 'swap' | 'matchThrow' | 'queenPeek' | 'jackSwap' | 'tenGive' | 'penalty',
    p: Record<string, any>,
  ): Promise<void> | null;
  /** The seat's character lets go of whatever it holds (its drawn card left its hand). */
  release?(seat: number): void;
  /** Optional: the seat's character peeks at its own card (does not block the caller). True when staged. */
  peek?(seat: number, slot: string): boolean;
}

const domKey = (key: string) => {
  if (key.startsWith('slot:')) return `[data-slot="${key.slice(5)}"]`;
  if (key.startsWith('pile:')) return `[data-pile="${key.slice(5)}"]`;
  if (key === 'pile-next') return '[data-pile-next]';
  return `[data-anchor="${key}"]`;
};
export const domBackend: FlyBackend = {
  rect: (key) => rectOf(q(domKey(key))),
  all: () => {
    const m = new Map<string, Box>();
    document.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => { const b = rectOf(el); if (b) m.set('slot:' + el.dataset.slot, b); });
    document.querySelectorAll<HTMLElement>('[data-anchor]').forEach((el) => { const b = rectOf(el); if (b) m.set(el.dataset.anchor!, b); });
    document.querySelectorAll<HTMLElement>('[data-pile]').forEach((el) => { const b = rectOf(el); if (b) m.set('pile:' + el.dataset.pile, b); });
    return m;
  },
  sprite: (from, face, up) => new Sprite(from, face, up),
  clear: () => { if (layer) layer.innerHTML = ''; },
};
let backend: FlyBackend = domBackend;
export function setFlyBackend(b: FlyBackend | null) { backend = b ?? domBackend; }
export const flyBackend = () => backend;

export function sprite(from: Box, face: CardFace | null = null, faceUp = false): SpriteLike { return backend.sprite(from, face, faceUp); }
export function clearFly() { backend.clear(); if (backend !== domBackend) domBackend.clear(); }
export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms * speedScale())));
