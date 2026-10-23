// Canvas-made textures for the garden scenes (linen, gingham, terracotta runner, planks, grass, flagstones, the
// court, skies, gold foil, glow dots). Generated at runtime from a seeded random, so: no downloads, tiny, offline,
// and identical every load (screenshots compare). Sizes stay at 256–1024 so Low/phone memory stays small.
import * as THREE from 'three';

const cache = new Map<string, THREE.Texture>();
function canvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')!] as const; }
function tex(c: HTMLCanvasElement, opts: { srgb?: boolean; repeat?: [number, number]; aniso?: number } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = opts.aniso ?? 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...opts.repeat); }
  return t;
}
function rng(seed: number) { let s = seed % 2147483647 || 1; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }
const memo = (k: string, f: () => THREE.Texture) => { let t = cache.get(k); if (!t) { t = f(); cache.set(k, t); } return t; };

/** Cream linen disc: fine weave, a hem ring with a little fringe, a soft warm pool of light baked in. */
export const linenTexture = () => memo('linen', () => {
  const N = 1024, [c, g] = canvas(N, N), r = rng(11);
  g.fillStyle = '#efe2c6'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < N; i += 3) { g.fillStyle = `rgba(120,95,60,${0.035 + r() * 0.04})`; g.fillRect(0, i, N, 1); g.fillRect(i, 0, 1, N); }
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,250,235' : '150,120,80'},${r() * 0.08})`; g.fillRect(r() * N, r() * N, 1 + r() * 3, 1); }
  // gentle folds (soft radial creases)
  for (let i = 0; i < 14; i++) { const a = r() * Math.PI * 2; g.strokeStyle = `rgba(140,110,70,${0.03 + r() * 0.03})`; g.lineWidth = 10 + r() * 20; g.beginPath(); g.moveTo(N / 2 + Math.cos(a) * N * 0.28, N / 2 + Math.sin(a) * N * 0.28); g.lineTo(N / 2 + Math.cos(a) * N * 0.5, N / 2 + Math.sin(a) * N * 0.5); g.stroke(); }
  const gr = g.createRadialGradient(N * 0.46, N * 0.44, N * 0.05, N / 2, N / 2, N / 2);
  gr.addColorStop(0, 'rgba(255,236,190,0.22)'); gr.addColorStop(0.75, 'rgba(255,236,190,0)'); gr.addColorStop(1, 'rgba(90,60,30,0.22)');
  g.fillStyle = gr; g.fillRect(0, 0, N, N);
  // hem + fringe at the rim
  g.strokeStyle = 'rgba(150,118,72,.45)'; g.lineWidth = 3; g.setLineDash([9, 7]); g.beginPath(); g.arc(N / 2, N / 2, N / 2 - 30, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  g.strokeStyle = 'rgba(160,128,80,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(N / 2, N / 2, N / 2 - 18, 0, Math.PI * 2); g.stroke();
  return tex(c, { aniso: 8 });
});

/** Blue-and-white gingham (tiled). */
export const ginghamTexture = (repeat = 7) => memo('gingham' + repeat, () => {
  const N = 256, [c, g] = canvas(N, N), r = rng(5);
  g.fillStyle = '#f7f6f0'; g.fillRect(0, 0, N, N);
  const h = N / 2;
  g.fillStyle = 'rgba(70,110,180,0.55)'; g.fillRect(0, 0, h, N); g.fillRect(0, 0, N, h);
  g.fillStyle = 'rgba(40,75,150,0.55)'; g.fillRect(0, 0, h, h);
  for (let i = 0; i < N; i += 2) { g.fillStyle = `rgba(30,40,70,${0.02 + r() * 0.03})`; g.fillRect(0, i, N, 1); g.fillRect(i, 0, 1, N); }
  return tex(c, { repeat: [repeat, repeat], aniso: 8 });
});

/** Terracotta woven runner: warm rust with fine stripes and a darker border along both long edges (u across). */
export const runnerTexture = () => memo('runner', () => {
  const W = 256, H = 1024, [c, g] = canvas(W, H), r = rng(23);
  g.fillStyle = '#b4532f'; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 2) { g.fillStyle = `rgba(${r() < 0.5 ? '90,30,15' : '220,120,80'},${0.05 + r() * 0.06})`; g.fillRect(0, y, W, 1); }
  for (let x = 0; x < W; x += 3) { g.fillStyle = `rgba(60,20,10,${0.04 + r() * 0.04})`; g.fillRect(x, 0, 1, H); }
  for (const x of [10, W - 22]) { g.fillStyle = '#7e3219'; g.fillRect(x, 0, 12, H); g.fillStyle = '#d98a52'; g.fillRect(x + 16 * (x < W / 2 ? 1 : -1) + (x < W / 2 ? 0 : 8), 0, 3, H); }
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(0,0,0,.18)'); gr.addColorStop(0.5, 'rgba(255,200,140,.10)'); gr.addColorStop(1, 'rgba(0,0,0,.18)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  return tex(c, { aniso: 8 });
});

/** Wooden planks (u = across the planks). */
export const planksTexture = (key: string, base: string, dark: string, planks = 5, repeat: [number, number] = [1, 1]) => memo('pl:' + key, () => {
  const N = 512, [c, g] = canvas(N, N), r = rng(key.length * 97 + 3);
  g.fillStyle = base; g.fillRect(0, 0, N, N);
  const pw = N / planks;
  for (let p = 0; p < planks; p++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '255,220,170' : '40,20,8'},${r() * 0.12})`; g.fillRect(p * pw, 0, pw, N);
    for (let i = 0; i < 26; i++) { g.strokeStyle = `rgba(40,20,8,${0.06 + r() * 0.14})`; g.lineWidth = 0.6 + r() * 2.2; const x = p * pw + r() * pw; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (r() - 0.5) * 14, N * 0.33, x + (r() - 0.5) * 14, N * 0.66, x + (r() - 0.5) * 8, N); g.stroke(); }
    if (r() < 0.6) { const kx = p * pw + pw * (0.3 + r() * 0.4), ky = r() * N; g.fillStyle = 'rgba(45,22,10,.45)'; g.beginPath(); g.ellipse(kx, ky, 4 + r() * 4, 9 + r() * 8, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = dark; g.fillRect(p * pw, 0, 3, N);
    g.fillStyle = 'rgba(255,230,190,.12)'; g.fillRect(p * pw + 3, 0, 2, N);
  }
  return tex(c, { repeat, aniso: 8 });
});

/** Lawn: mottled greens with blade flecks (tiled). */
export const grassTexture = (key: 'golden' | 'picnic' | 'dusk') => memo('grass:' + key, () => {
  const N = 512, [c, g] = canvas(N, N), r = rng(41);
  const base = { golden: '#8ca046', picnic: '#78b848', dusk: '#466844' }[key];
  g.fillStyle = base; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '30,60,20' : '170,200,90'},${r() * 0.12})`; g.beginPath(); g.arc(r() * N, r() * N, 8 + r() * 40, 0, Math.PI * 2); g.fill(); }
  for (let i = 0; i < 12000; i++) { const x = r() * N, y = r() * N; g.strokeStyle = `rgba(${r() < 0.55 ? '25,55,15' : '190,220,110'},${0.15 + r() * 0.25})`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 5); g.stroke(); }
  return tex(c, { repeat: [14, 14] });
});

/** Irregular flagstone terrace (tiled). */
export const paversTexture = (key: 'golden' | 'dusk') => memo('pav:' + key, () => {
  const N = 512, [c, g] = canvas(N, N), r = rng(77);
  g.fillStyle = key === 'dusk' ? '#4a4238' : '#7d7060'; g.fillRect(0, 0, N, N);
  const cols = key === 'dusk' ? ['#6b6052', '#5e5548', '#766a5a', '#625a4d'] : ['#bfae92', '#a99a80', '#c9b99c', '#b3a184', '#9f927a'];
  const step = N / 5;
  for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 5; gx++) {
    const ox = gx * step + (gy % 2) * step * 0.5, oy = gy * step;
    const pts: [number, number][] = [];
    for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2 + r() * 0.4; const rr = step * (0.42 + r() * 0.1); pts.push([ox + step / 2 + Math.cos(a) * rr, oy + step / 2 + Math.sin(a) * rr]); }
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {
      g.fillStyle = cols[Math.floor(r() * cols.length)]!; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x + dx, y + dy) : g.moveTo(x + dx, y + dy))); g.closePath(); g.fill();
    }
  }
  for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,240'},${r() * 0.07})`; g.fillRect(r() * N, r() * N, 2, 2); }
  return tex(c, { repeat: [3, 3] });
});

/** Badminton court: lawn with mowing stripes and white lines (13.4 × 6.1 m proportions), one texture. */
export const courtTexture = (key: 'golden' | 'picnic' | 'dusk') => memo('court:' + key, () => {
  const W = 1024, H = 512, [c, g] = canvas(W, H), r = rng(9);
  const a = { golden: ['#7a9a44', '#6e8e3e'], picnic: ['#6fb046', '#62a03c'], dusk: ['#3f6a3a', '#386033'] }[key];
  for (let i = 0; i < 12; i++) { g.fillStyle = a[i % 2]!; g.fillRect((i * W) / 12, 0, W / 12 + 1, H); }
  for (let i = 0; i < 8000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '20,50,10' : '200,230,120'},${r() * 0.12})`; g.fillRect(r() * W, r() * H, 1, 2 + r() * 3); }
  const m = 24, L = W - 2 * m, S = H - 2 * m, sx = L / 13.4, sy = S / 6.1;
  g.strokeStyle = 'rgba(250,250,240,.92)'; g.lineWidth = 6;
  g.strokeRect(m, m, L, S);
  const hline = (y: number) => { g.beginPath(); g.moveTo(m, m + y * sy); g.lineTo(m + L, m + y * sy); g.stroke(); };
  const vline = (x: number) => { g.beginPath(); g.moveTo(m + x * sx, m); g.lineTo(m + x * sx, m + S); g.stroke(); };
  hline(0.46); hline(6.1 - 0.46); vline(6.7 - 1.98); vline(6.7 + 1.98); vline(0.76); vline(13.4 - 0.76);
  g.beginPath(); g.moveTo(m, m + S / 2); g.lineTo(m + (6.7 - 1.98) * sx, m + S / 2); g.moveTo(m + (6.7 + 1.98) * sx, m + S / 2); g.lineTo(m + L, m + S / 2); g.stroke();
  return tex(c, { aniso: 8 });
});

/** Sky dome gradient (+ clouds for the picnic, stars for dusk). v = 0 at the horizon. */
export const skyTexture = (key: 'golden' | 'picnic' | 'dusk') => memo('sky:' + key, () => {
  const W = 512, H = 256, [c, g] = canvas(W, H), r = rng(3);
  const stops = { golden: ['#f7d69c', '#f4be7e', '#d8a68a', '#889bb8'], picnic: ['#e4f2fc', '#9ed0f6', '#64b0ec', '#3c8cdc'], dusk: ['#c87862', '#6a4c84', '#2e2d68', '#141838'] }[key];
  const gr = g.createLinearGradient(0, H, 0, 0); stops.forEach((s, i) => gr.addColorStop(i / (stops.length - 1), s)); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  if (key === 'picnic') for (let i = 0; i < 26; i++) { const x = r() * W, y = H * (0.12 + r() * 0.75); for (let k = 0; k < 7; k++) { g.fillStyle = 'rgba(255,255,255,.82)'; g.beginPath(); g.ellipse(x + (r() - 0.5) * 48, y + (r() - 0.5) * 7, 14 + r() * 18, 7 + r() * 7, 0, 0, Math.PI * 2); g.fill(); } }
  if (key === 'dusk') for (let i = 0; i < 340; i++) { const y = r() * H * 0.88; g.fillStyle = `rgba(255,250,235,${0.45 + r() * 0.55})`; g.fillRect(r() * W, y, r() < 0.18 ? 2 : 1, r() < 0.18 ? 2 : 1); }
  if (key === 'golden') { const sg = g.createRadialGradient(W * 0.48, H * 0.55, 4, W * 0.48, H * 0.55, 160); sg.addColorStop(0, 'rgba(255,244,205,.85)'); sg.addColorStop(1, 'rgba(255,220,160,0)'); g.fillStyle = sg; g.fillRect(0, 0, W, H); }
  const t = tex(c); t.wrapS = THREE.RepeatWrapping; return t;
});

/** Crinkled gold foil: random facets in gold shades. */
export const foilTexture = () => memo('foil', () => {
  const N = 256, [c, g] = canvas(N, N), r = rng(19);
  g.fillStyle = '#c9952e'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 420; i++) {
    const x = r() * N, y = r() * N, s = 6 + r() * 22; const l = 0.55 + r() * 0.6;
    g.fillStyle = `rgb(${Math.min(255, 230 * l) | 0},${Math.min(255, 170 * l) | 0},${Math.min(255, 60 * l) | 0})`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + s * (r() - 0.2), y + s * (r() - 0.5)); g.lineTo(x + s * (r() - 0.5), y + s * (r() + 0.1)); g.closePath(); g.fill();
  }
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(255,245,200,${0.3 + r() * 0.4})`; g.lineWidth = 1; g.beginPath(); const x = r() * N, y = r() * N; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 40); g.stroke(); }
  return tex(c);
});

/** Soft round glow dot (white, tint by material colour): fairy lights, lantern halos, candle flames. */
export const glowDot = () => memo('dot', () => {
  const N = 64, [c, g] = canvas(N, N);
  const gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,.9)'); gr.addColorStop(0.4, 'rgba(255,255,255,.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, N, N);
  return tex(c, { srgb: false });
});

/** Leafy speckle for hedges and bushes (tiled, multiplies the instance colour). */
export const leafTexture = () => memo('leaf', () => {
  const N = 256, [c, g] = canvas(N, N), r = rng(31);
  g.fillStyle = '#dce8cc'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 1800; i++) { const x = r() * N, y = r() * N, a = r() * Math.PI; const l = 0.78 + r() * 0.35; g.fillStyle = `rgb(${Math.min(255, (215 * l) | 0)},${Math.min(255, (240 * l) | 0)},${Math.min(255, (190 * l) | 0)})`; g.beginPath(); g.ellipse(x, y, 3 + r() * 4, 1.5 + r() * 2, a, 0, Math.PI * 2); g.fill(); }
  return tex(c, { repeat: [2, 2] });
});

/** Soft dark round blob: fake contact shadow (baked). */
export const blobShadow = () => memo('blob', () => {
  const N = 128, [c, g] = canvas(N, N);
  const gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  gr.addColorStop(0, 'rgba(30,18,8,.55)'); gr.addColorStop(0.55, 'rgba(30,18,8,.3)'); gr.addColorStop(1, 'rgba(30,18,8,0)');
  g.fillStyle = gr; g.fillRect(0, 0, N, N);
  return tex(c, { srgb: false });
});
