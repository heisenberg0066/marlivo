// Canvas-made textures for the 3D table: card faces (rasterised from the same SVG art as 2D), card back, soft
// glows, labels, flags (official proportions), the evening skyline, wood and felt. Everything is generated at
// runtime, so there are no image downloads and it all works offline.
import * as THREE from 'three';
import type { CardFace } from '@marlivo/engine';
import { cardFrontSvg, CARD_BACK_SVG } from '../render/cardArt';

const CW = 256, CH = 358;
const cache = new Map<string, THREE.Texture>();
let maxAniso = 4;
export function setMaxAnisotropy(n: number) { maxAniso = Math.max(1, Math.min(8, n)); }

function canvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')!] as const; }
function tex(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** A soft (blurred-looking) rounded rect without ctx.filter (which older iOS Safari lacks). */
function softRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, rgb: string, alpha: number, blur: number) {
  const steps = 8;
  for (let i = steps; i >= 0; i--) {
    const e = (blur * i) / steps;
    g.fillStyle = `rgba(${rgb},${(alpha / steps) * 1.6})`;
    roundRect(g, x - e, y - e, w + 2 * e, h + 2 * e, r + e); g.fill();
  }
}

/** Rasterises an SVG string into a card texture. Returns at once (with a plain card) and fills in when ready. */
function svgCard(key: string, svg: string, plain: string): THREE.Texture {
  const hit = cache.get(key); if (hit) return hit;
  const [c, g] = canvas(CW, CH);
  roundRect(g, 2, 2, CW - 4, CH - 4, 22); g.fillStyle = plain; g.fill();
  const t = tex(c);
  cache.set(key, t);
  const img = new Image();
  img.onload = () => { g.clearRect(0, 0, CW, CH); g.drawImage(img, 0, 0, CW, CH); t.needsUpdate = true; };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${CH}" `));
  return t;
}
export const faceTexture = (f: CardFace, four: boolean) => svgCard(`f:${f.r}${f.s}:${four ? 4 : 2}`, cardFrontSvg(f, four), '#fbf4e6');
export const backTexture = () => svgCard('back', CARD_BACK_SVG, '#7a3f22');

/** Soft rounded-rect glow (white; tinted by the material colour). */
export function glowTexture() {
  const k = 'glow'; const hit = cache.get(k); if (hit) return hit;
  const [c, g] = canvas(128, 160);
  softRect(g, 24, 24, 80, 112, 12, '255,255,255', 0.9, 18);
  const t = tex(c, false); cache.set(k, t); return t;
}
/** Blurred dark blob used as a fake (baked) contact shadow under cards and props. */
export function shadowTexture(round = false) {
  const k = 'shadow' + round; const hit = cache.get(k); if (hit) return hit;
  const [c, g] = canvas(128, 128);
  if (round) { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  else softRect(g, 24, 20, 80, 88, 8, '0,0,0', 0.5, 16);
  const t = tex(c, false); cache.set(k, t); return t;
}
/** Dashed outline of an empty slot. */
export function outlineTexture() {
  const k = 'outline'; const hit = cache.get(k); if (hit) return hit;
  const [c, g] = canvas(128, 178);
  g.setLineDash([12, 9]); g.lineWidth = 5; g.strokeStyle = 'rgba(246,235,217,.42)'; roundRect(g, 6, 6, 116, 166, 14); g.stroke();
  const t = tex(c, false); cache.set(k, t); return t;
}
/** A short text label (slot numbers, ghost ranks, ✕). */
export function labelTexture(text: string, color = '#f6ebd9', bg: string | null = null, w = 128, h = 128, font = 'bold 78px Fredoka, Nunito, system-ui, sans-serif') {
  const k = `lbl:${text}:${color}:${bg}:${w}x${h}:${font}`; const hit = cache.get(k); if (hit) return hit;
  const [c, g] = canvas(w, h);
  if (bg) { g.fillStyle = bg; g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) / 2 - 2, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = color; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4);
  const t = tex(c); cache.set(k, t); return t;
}

// ---------- flags, drawn to the official proportions (same as the 2D art) ----------
export function flagTexture(which: 'fr' | 'ps' | 'se') {
  const k = 'flag:' + which; const hit = cache.get(k); if (hit) return hit;
  let c: HTMLCanvasElement, g: CanvasRenderingContext2D;
  if (which === 'fr') { [c, g] = canvas(180, 120); g.fillStyle = '#0055A4'; g.fillRect(0, 0, 60, 120); g.fillStyle = '#FFFFFF'; g.fillRect(60, 0, 60, 120); g.fillStyle = '#EF4135'; g.fillRect(120, 0, 60, 120); }
  else if (which === 'ps') {
    // 1:2, black / white / green stripes, red triangle at the hoist reaching one third of the length
    [c, g] = canvas(240, 120); g.fillStyle = '#000000'; g.fillRect(0, 0, 240, 40); g.fillStyle = '#FFFFFF'; g.fillRect(0, 40, 240, 40); g.fillStyle = '#007A3D'; g.fillRect(0, 80, 240, 40);
    g.fillStyle = '#CE1126'; g.beginPath(); g.moveTo(0, 0); g.lineTo(80, 60); g.lineTo(0, 120); g.closePath(); g.fill();
  } else {
    // 16:10, cross arms 2/10 wide; vertical arm at 5–7 of 16, horizontal at 4–6 of 10
    [c, g] = canvas(192, 120); g.fillStyle = '#006AA7'; g.fillRect(0, 0, 192, 120); g.fillStyle = '#FECC02'; g.fillRect(60, 0, 24, 120); g.fillRect(0, 48, 192, 24);
  }
  const t = tex(c); cache.set(k, t); return t;
}
export const FLAG_ASPECT = { fr: 3 / 2, ps: 2, se: 16 / 10 } as const;

/** Evening city skyline for the big window: dusk gradient, a moon, two rows of buildings with lit windows. */
export function skylineTexture() {
  const k = 'sky'; const hit = cache.get(k); if (hit) return hit;
  const W = 1024, H = 640; const [c, g] = canvas(W, H);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#2b2350'); sky.addColorStop(0.45, '#7a4a7e'); sky.addColorStop(0.72, '#e88a5a'); sky.addColorStop(1, '#f6b36a');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,240,220,.9)'; g.beginPath(); g.arc(W * 0.78, H * 0.2, 26, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.5})`; g.fillRect(Math.random() * W, Math.random() * H * 0.35, 2, 2); }
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const row = (base: number, hmin: number, hmax: number, col: string, lit: number) => {
    let x = -10;
    while (x < W) {
      const w = 40 + rnd() * 70, h = hmin + rnd() * (hmax - hmin);
      g.fillStyle = col; g.fillRect(x, base - h, w, h + 400);
      if (rnd() < 0.25) { g.fillRect(x + w * 0.4, base - h - 30, 6, 30); }
      for (let wy = base - h + 12; wy < H - 10; wy += 16) for (let wx = x + 7; wx < x + w - 8; wx += 12) if (rnd() < lit) { g.fillStyle = rnd() < 0.7 ? '#ffd27a' : '#ffb35a'; g.fillRect(wx, wy, 5, 7); g.fillStyle = col; }
      x += w + 4 + rnd() * 10;
    }
  };
  row(H * 0.72, 120, 300, '#3a2f55', 0.18);
  row(H * 0.86, 80, 220, '#241c38', 0.32);
  const t = tex(c); cache.set(k, t); return t;
}

/** Warm wood grain (tiled). */
export function woodTexture(base = '#7a4526', dark = '#5a301a') {
  const k = 'wood:' + base; const hit = cache.get(k); if (hit) return hit;
  const [c, g] = canvas(256, 256);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(40,20,10,${0.05 + Math.random() * 0.12})`; g.lineWidth = 1 + Math.random() * 3; const y = Math.random() * 256; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(80, y + (Math.random() - 0.5) * 20, 170, y + (Math.random() - 0.5) * 20, 256, y); g.stroke(); }
  g.fillStyle = dark; g.globalAlpha = 0.15; g.fillRect(0, 0, 256, 256); g.globalAlpha = 1;
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; cache.set(k, t); return t;
}
/** Felt with a baked warm pool of lamp light in the middle. */
export function feltTexture() {
  const k = 'felt'; const hit = cache.get(k); if (hit) return hit;
  const [c, g] = canvas(512, 512);
  const gr = g.createRadialGradient(256, 236, 20, 256, 256, 256);
  gr.addColorStop(0, '#3f8a5c'); gr.addColorStop(0.6, '#2c6b45'); gr.addColorStop(1, '#1c4a2f');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`; g.fillRect(Math.random() * 512, Math.random() * 512, 1, 1); }
  g.strokeStyle = 'rgba(246,235,217,.12)'; g.lineWidth = 3; g.setLineDash([10, 8]); g.beginPath(); g.arc(256, 256, 70, 0, Math.PI * 2); g.stroke();
  const t = tex(c); cache.set(k, t); return t;
}
/** Wall: warm plaster with a soft vertical light falloff (baked). */
export function wallTexture() {
  const k = 'wall'; const hit = cache.get(k); if (hit) return hit;
  const [c, g] = canvas(256, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#3a2418'); gr.addColorStop(0.6, '#5e3a25'); gr.addColorStop(1, '#4a2c1b');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  const t = tex(c); cache.set(k, t); return t;
}
/** Dice face with pips. */
export function pipTexture(n: number) {
  const k = 'pip' + n; const hit = cache.get(k); if (hit) return hit;
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#fbf1de'; roundRect(g, 0, 0, 128, 128, 18); g.fill();
  const P: Record<number, [number, number][]> = { 1: [[64, 64]], 2: [[36, 36], [92, 92]], 3: [[36, 36], [64, 64], [92, 92]], 4: [[36, 36], [92, 36], [36, 92], [92, 92]], 5: [[36, 36], [92, 36], [64, 64], [36, 92], [92, 92]], 6: [[36, 32], [92, 32], [36, 64], [92, 64], [36, 96], [92, 96]] };
  g.fillStyle = n === 1 ? '#c0392b' : '#3b2116';
  for (const [x, y] of P[n]!) { g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.fill(); }
  const t = tex(c); cache.set(k, t); return t;
}
