// Table geometry in "plane units" (the felt plane before scaling/tilt). Identical logical grid on every screen;
// devices only scale it (§7.2). You are always at the bottom of your own screen (§18.3).
import type { PlayerView, SlotView } from '@marlivo/engine';

export type SeatPos = 'bottom' | 'top' | 'left' | 'right' | 'topLeft' | 'topRight';
export interface Anchor { x: number; y: number; rot: number; maxW: number; maxH: number; cw: number; ch: number }
export interface Geom { W: number; H: number; portrait: boolean; tilt: number; anchors: Record<SeatPos, Anchor>; deck: { x: number; y: number }; pile: { x: number; y: number; r: number }; cw: number; ch: number }

export function makeGeom(portrait: boolean, large: boolean, seatView: boolean): Geom {
  const k = large ? 1.14 : 1;
  if (portrait) {
    const own = { cw: 104 * k, ch: 146 * k }, opp = { cw: 76 * k, ch: 106 * k };
    return {
      W: 760, H: 1120, portrait, tilt: seatView ? 30 : 0, cw: own.cw, ch: own.ch,
      anchors: {
        bottom: { x: 380, y: 905, rot: 0, maxW: 730, maxH: 340, ...own },
        top: { x: 380, y: 210, rot: 180, maxW: 500, maxH: 230, ...opp },
        left: { x: 140, y: 560, rot: 90, maxW: 380, maxH: 220, ...opp },
        right: { x: 620, y: 560, rot: -90, maxW: 380, maxH: 220, ...opp },
        topLeft: { x: 205, y: 250, rot: 180, maxW: 300, maxH: 220, ...opp },
        topRight: { x: 555, y: 250, rot: 180, maxW: 300, maxH: 220, ...opp },
      },
      deck: { x: 300, y: 560 }, pile: { x: 460, y: 560, r: 62 },
    };
  }
  const own = { cw: 92 * k, ch: 129 * k }, opp = { cw: 66 * k, ch: 92 * k };
  return {
    W: 1300, H: 900, portrait, tilt: seatView ? 38 : 0, cw: own.cw, ch: own.ch,
    anchors: {
      bottom: { x: 650, y: 720, rot: 0, maxW: 760, maxH: 290, ...own },
      top: { x: 650, y: 150, rot: 180, maxW: 520, maxH: 200, ...opp },
      left: { x: 215, y: 445, rot: 90, maxW: 360, maxH: 220, ...opp },
      right: { x: 1085, y: 445, rot: -90, maxW: 360, maxH: 220, ...opp },
      topLeft: { x: 400, y: 175, rot: 180, maxW: 380, maxH: 210, ...opp },
      topRight: { x: 900, y: 175, rot: 180, maxW: 380, maxH: 210, ...opp },
    },
    deck: { x: 555, y: 445 }, pile: { x: 745, y: 445, r: 80 },
  };
}

/** Seat → screen position. Clockwise order: the next player always sits to your left (§4.6). */
export function seatPositions(view: PlayerView): Record<number, SeatPos> {
  const seated = view.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  const seats = view.round?.participants ?? (view.players.length ? view.players : seated);
  const me = view.you ?? seats[0] ?? 0;
  const sorted = [...seats].sort((a, b) => a - b);
  const rot: number[] = [];
  const start = sorted.indexOf(me);
  for (let i = 1; i < sorted.length; i++) rot.push(sorted[(start + i) % sorted.length]!);
  const out: Record<number, SeatPos> = {};
  if (seats.includes(me)) out[me] = 'bottom';
  const others = seats.includes(me) ? rot : sorted;
  const layout: SeatPos[] = others.length === 1 ? ['top'] : others.length === 2 ? ['topLeft', 'topRight'] : ['left', 'top', 'right'];
  others.forEach((s, i) => (out[s] = layout[i]!));
  return out;
}

export interface SlotPlace { x: number; y: number }
/** Local positions for an area's slots (centred), plus the scale needed to fit its box. */
export function areaLayout(slots: SlotView[], a: Anchor): { places: Record<string, SlotPlace>; scale: number; w: number; h: number } {
  const gapX = a.cw * 0.14, gapY = a.ch * 0.1;
  const rows = slots.length ? Math.max(...slots.map((s) => s.row)) + 1 : 1;
  const cols = slots.length ? Math.max(...slots.map((s) => s.col)) + 1 : 1;
  const w = cols * a.cw + (cols - 1) * gapX, h = rows * a.ch + (rows - 1) * gapY;
  const places: Record<string, SlotPlace> = {};
  // Rows are centred individually so a 3+2 layout looks tidy; positions never shift when a card leaves.
  const rowCols: Record<number, number> = {};
  for (const s of slots) rowCols[s.row] = Math.max(rowCols[s.row] ?? 0, s.col + 1);
  for (const s of slots) {
    const rc = rowCols[s.row]!;
    const rw = rc * a.cw + (rc - 1) * gapX;
    places[s.id] = { x: -rw / 2 + a.cw / 2 + s.col * (a.cw + gapX), y: -h / 2 + a.ch / 2 + s.row * (a.ch + gapY) };
  }
  const scale = Math.min(1, a.maxW / w, a.maxH / h);
  return { places, scale, w, h };
}

/** Deterministic "random" landing spot inside the table's centre circle for the i-th pile card (§16.5). */
export function pileSpot(i: number, faceKey: string, pile: Geom['pile']) {
  let h = 2166136261;
  const s = faceKey + ':' + i;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  const u = ((h >>> 0) % 1000) / 1000, v = (((h >>> 10) >>> 0) % 1000) / 1000, w = (((h >>> 20) >>> 0) % 1000) / 1000;
  const ang = u * Math.PI * 2, rad = Math.sqrt(v) * pile.r;
  return { x: pile.x + Math.cos(ang) * rad, y: pile.y + Math.sin(ang) * rad * 0.8, rot: (w - 0.5) * 70 };
}
