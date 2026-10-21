// Original SVG card art as cached markup strings (used by React cards and by the flying-sprite layer).
// Cream paper faces with classic pip layouts, framed court cards, and a chocolate/pumpkin back.
import type { CardFace } from '@marlivo/engine';
import { RANK_LABEL } from '@marlivo/engine';

export const SUIT_PATH: Record<string, string> = {
  H: 'M50 88 C20 64 6 48 6 30 C6 16 17 6 30 6 C39 6 46 11 50 19 C54 11 61 6 70 6 C83 6 94 16 94 30 C94 48 80 64 50 88Z',
  D: 'M50 4 L88 50 L50 96 L12 50Z',
  S: 'M50 6 C62 26 92 40 92 60 C92 74 81 82 69 82 C61 82 55 78 53 73 C54 82 58 89 66 94 L34 94 C42 89 46 82 47 73 C45 78 39 82 31 82 C19 82 8 74 8 60 C8 40 38 26 50 6Z',
  C: 'M50 8 C61 8 70 17 70 28 C70 33 68 38 65 41 C68 40 71 39 74 39 C85 39 94 48 94 59 C94 70 85 79 74 79 C65 79 58 74 55 67 C56 78 60 87 67 94 L33 94 C40 87 44 78 45 67 C42 74 35 79 26 79 C15 79 6 70 6 59 C6 48 15 39 26 39 C29 39 32 40 35 41 C32 38 30 33 30 28 C30 17 39 8 50 8Z',
};
export const suitColor = (s: string, four: boolean) =>
  four ? ({ S: '#1d1a17', H: '#c0392b', D: '#2a6fb5', C: '#2e7d4f' } as Record<string, string>)[s]! : s === 'H' || s === 'D' ? '#b8322a' : '#1d1a17';

const L = 30, C = 50, R = 70;
const PIPS: Record<number, [number, number][]> = {
  2: [[C, 32], [C, 108]], 3: [[C, 32], [C, 70], [C, 108]],
  4: [[L, 32], [R, 32], [L, 108], [R, 108]], 5: [[L, 32], [R, 32], [C, 70], [L, 108], [R, 108]],
  6: [[L, 32], [R, 32], [L, 70], [R, 70], [L, 108], [R, 108]],
  7: [[L, 32], [R, 32], [C, 51], [L, 70], [R, 70], [L, 108], [R, 108]],
  8: [[L, 32], [R, 32], [C, 51], [L, 70], [R, 70], [C, 89], [L, 108], [R, 108]],
  9: [[L, 30], [R, 30], [L, 57], [R, 57], [C, 70], [L, 83], [R, 83], [L, 110], [R, 110]],
  10: [[L, 30], [R, 30], [C, 45], [L, 57], [R, 57], [L, 83], [R, 83], [C, 95], [L, 110], [R, 110]],
};
const pip = (x: number, y: number, s: string, size: number, color: string, flip = false) =>
  `<path d="${SUIT_PATH[s]}" fill="${color}" transform="translate(${x - size / 2} ${y - size / 2})${flip ? ` rotate(180 ${size / 2} ${size / 2})` : ''} scale(${size / 100})"/>`;
const HATS: Record<number, string> = {
  11: 'M32 50 Q50 30 68 50 L64 54 L36 54 Z M62 40 q8 -10 14 -6 q-6 2 -10 10',
  12: 'M32 52 L37 36 L44 46 L50 32 L56 46 L63 36 L68 52 Z',
  13: 'M30 52 L33 32 L42 44 L50 28 L58 44 L67 32 L70 52 Z',
};

const cache = new Map<string, string>();
export function cardFrontSvg(face: CardFace, four: boolean): string {
  const k = `${face.r}${face.s}${four ? 4 : 2}`;
  const hit = cache.get(k); if (hit) return hit;
  const color = suitColor(face.s, four);
  const label = RANK_LABEL[face.r]!;
  const fs = label === '10' ? 17 : 21;
  const corner = `<text x="12" y="23" font-size="${fs}" text-anchor="middle" fill="${color}" font-family="Fredoka, 'Baloo 2', system-ui, sans-serif" font-weight="700">${label}</text>${pip(12, 33, face.s, 12, color)}`;
  let body = '';
  if (face.r >= 11) {
    body = `<rect x="23" y="20" width="54" height="100" rx="6" fill="#fbf1dc" stroke="${color}" stroke-width="2"/>
      <rect x="27" y="24" width="46" height="92" rx="4" fill="none" stroke="#c9a15b" stroke-width="1" stroke-dasharray="3 2"/>
      <path d="${HATS[face.r]}" fill="${face.r === 11 ? '#e8892f' : '#e2b23c'}" stroke="#8a6420" stroke-width="1.2"/>
      <circle cx="50" cy="66" r="12" fill="#f3d6b3" stroke="#8a6420" stroke-width="1"/>
      <path d="M44 64 q2 -2 4 0 M52 64 q2 -2 4 0" stroke="#3b2a1e" stroke-width="1.4" fill="none"/>
      <path d="M45 71 q5 4 10 0" stroke="#a4533a" stroke-width="1.5" fill="none"/>
      <path d="M33 114 Q50 78 67 114 Z" fill="${color}" opacity=".88"/>${pip(50, 100, face.s, 14, '#fffaf0')}
      <text x="50" y="48" font-size="10" text-anchor="middle" fill="#5a3e2b" font-family="Fredoka, system-ui" font-weight="700">${label}</text>`;
  } else if (face.r === 1) body = pip(50, 70, face.s, 46, color);
  else body = PIPS[face.r]!.map(([x, y]) => pip(x, y, face.s, face.r >= 9 ? 19 : 21, color, y > 70)).join('');
  const svg = `<svg viewBox="0 0 100 140" class="cf-svg" aria-hidden="true"><rect x="1" y="1" width="98" height="138" rx="9" fill="#fbf4e6" stroke="#d8c7a6" stroke-width="1.5"/>${corner}<g transform="rotate(180 50 70)">${corner}</g>${body}</svg>`;
  cache.set(k, svg);
  return svg;
}

export const CARD_BACK_SVG = `<svg viewBox="0 0 100 140" class="cf-svg" aria-hidden="true">
<defs><pattern id="mlLattice" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
<rect width="12" height="12" fill="#5a2f1c"/><path d="M0 6 H12 M6 0 V12" stroke="#74402a" stroke-width="2"/><circle cx="6" cy="6" r="1.6" fill="#e8892f"/></pattern></defs>
<rect x="1" y="1" width="98" height="138" rx="9" fill="#f3e6cc"/>
<rect x="6" y="6" width="88" height="128" rx="6" fill="url(#mlLattice)" stroke="#c9a15b" stroke-width="2"/>
<ellipse cx="50" cy="70" rx="21" ry="25" fill="#3b2116" stroke="#c9a15b" stroke-width="2"/>
<g transform="translate(50 63)"><ellipse cx="-5" cy="2" rx="7" ry="6" fill="#e8892f"/><ellipse cx="5" cy="2" rx="7" ry="6" fill="#d9772a"/><ellipse cx="0" cy="2" rx="5" ry="6.5" fill="#f09a3e"/><path d="M0 -4 q1 -4 4 -5" stroke="#5b7f3a" stroke-width="1.8" fill="none"/></g>
<text x="50" y="88" text-anchor="middle" font-family="Fredoka, system-ui" font-weight="700" font-size="10" fill="#f6ebd9">ML</text></svg>`;
