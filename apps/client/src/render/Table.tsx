// The table renderer (Stage A "2D with depth", §14.4): a tilted first-person felt plane with the deck, a scattered
// pile, every seat's stable slot grid, upright character billboards and dice. Pure view + overrides from the
// animation director; it never decides game logic. A 3D renderer can replace this component later.
import { memo, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { CardFace, PlayerView, SlotView } from '@marlivo/engine';
import { cardFrontSvg, CARD_BACK_SVG } from './cardArt';
import { makeGeom, seatPositions, areaLayout, pileSpot, type Anchor, type Geom } from './geometry';
import { CharacterBust, SEAT_COLORS, ChocolateBowl, TeaGlass, type Mood } from './characters';
import { usePrefs } from '../prefs';
import { t } from '../i18n';

export interface Overrides {
  slot: Record<string, { show?: CardFace | 'back'; hide?: boolean; cls?: string }>;
  hideHand: Record<number, boolean>;
  pileHide: number;
  dice: null | { values?: Record<number, number>; rolling?: boolean; tied?: number[]; winner?: number };
  moods: Record<number, Mood>;
  badges: Record<number, string>;
  pulse: Record<number, string>;
}
export const emptyOverrides = (): Overrides => ({ slot: {}, hideHand: {}, pileHide: 0, dice: null, moods: {}, badges: {}, pulse: {} });

export interface TableProps {
  view: PlayerView;
  ov: Overrides;
  selectable: Set<string>;
  selected: Set<string>;
  seatSelectable: Set<number>;
  hover: Record<number, string | null>;
  bubbles: Record<number, { text: string; at: number }>;
  onSlot(id: string, owner: number): void;
  onSeat(seat: number): void;
  onDeck(): void;
  onPile(): void;
  onHoverSlot?(id: string | null): void;
  /** Long-press one of your own cards = Match (§5.2). */
  onLongPressMine?(): void;
}

const FaceHtml = memo(function FaceHtml({ face, four }: { face: CardFace | null; four: boolean }) {
  return <div className="face front" dangerouslySetInnerHTML={{ __html: face ? cardFrontSvg(face, four) : '' }} />;
});
const BackHtml = memo(function BackHtml() { return <div className="face back" dangerouslySetInnerHTML={{ __html: CARD_BACK_SVG }} />; });

export function CardEl({ face, up, four, style, className = '', ...rest }: { face: CardFace | null; up: boolean; four: boolean; style?: CSSProperties; className?: string } & Record<string, unknown>) {
  return (
    <div className={`card3d ${up ? 'up' : ''} ${className}`} style={style} {...rest}>
      <div className="card-inner"><FaceHtml face={face} four={four} /><BackHtml /></div>
    </div>
  );
}

function useFit(geom: Geom) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const cos = Math.cos((geom.tilt * Math.PI) / 180);
      const headroom = geom.tilt ? 1.16 : 1.04;
      setScale(Math.min(r.width / geom.W, r.height / (geom.H * cos * headroom)));
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, [geom]);
  return { ref, scale };
}

export function useGeom(): Geom {
  const prefs = usePrefs();
  const [portrait, setPortrait] = useState(() => innerHeight > innerWidth * 1.05);
  useLayoutEffect(() => { const f = () => setPortrait(innerHeight > innerWidth * 1.05); addEventListener('resize', f); return () => removeEventListener('resize', f); }, []);
  const [g, setG] = useState(() => makeGeom(portrait, prefs.largeCards, prefs.camera === 'seat'));
  useLayoutEffect(() => setG(makeGeom(portrait, prefs.largeCards, prefs.camera === 'seat')), [portrait, prefs.largeCards, prefs.camera]);
  return g;
}

export const Table = memo(function Table(p: TableProps) {
  const prefs = usePrefs();
  const geom = useGeom();
  const { ref, scale } = useFit(geom);
  const v = p.view;
  const r = v.round;
  const pos = seatPositions(v);
  const me = v.you;
  const four = prefs.fourColor;
  const seatsShown = r ? r.participants : v.players.length ? v.players : v.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  const discard = r?.discard ?? [];
  const pileStart = Math.max(0, discard.length - 14);
  const active = r?.active;
  const tilt = geom.tilt;
  const bb = 1;

  const showDie = (seat: number) => !!(p.ov.dice && seat in (p.ov.dice.values ?? {})) || (v.phase === 'START_ROLL' && !!v.roll);
  const bustPx = geom.portrait ? 62 : 84;
  // Billboards (busts, name plates, dice) stand upright in screen space, anchored to points on the tilted table.
  const [bbPos, setBbPos] = useState<Record<string, { x: number; y: number }>>({});
  useLayoutEffect(() => {
    const st = ref.current; if (!st) return;
    const base = st.getBoundingClientRect();
    const next: Record<string, { x: number; y: number }> = {};
    st.querySelectorAll<HTMLElement>('.bb-anchor').forEach((el) => {
      const r = el.getBoundingClientRect();
      const k = el.dataset.bb !== undefined ? 'b' + el.dataset.bb : 'd' + el.dataset.die;
      next[k] = { x: Math.round(r.left + r.width / 2 - base.left), y: Math.round(r.top + r.height / 2 - base.top) };
    });
    const same = Object.keys(next).length === Object.keys(bbPos).length && Object.entries(next).every(([k, q]) => bbPos[k]?.x === q.x && bbPos[k]?.y === q.y);
    if (!same) setBbPos(next);
  });
  const moodOf = (seat: number): Mood => {
    if (p.ov.moods[seat]) return p.ov.moods[seat]!;
    const si = v.seats[seat];
    if (si && !si.isBot && !si.connected) return 'away';
    if (r?.result?.winner === seat) return 'happy';
    if (active?.k === 'attempt' && active.seat === seat) return 'think';
    if (r && r.current === seat && v.phase === 'PLAY') return 'think';
    return 'idle';
  };

  return (
    <div className="stage" ref={ref} style={{ ['--tilt' as string]: `${tilt}deg` }}>
      <div className="plane-wrap" style={{ width: geom.W, height: geom.H, transform: `translate(-50%, -50%) scale(${scale})` }}>
        <div className={`plane ${tilt ? 'tilted' : 'flat'}`} style={{ width: geom.W, height: geom.H, transform: `rotateX(${tilt}deg)` }}>
          <div className="table-rim" /><div className="felt" />
          <div className="felt-light" />
          {/* deck */}
          <div className="deck" style={{ left: geom.deck.x, top: geom.deck.y, width: geom.cw * 0.8, height: geom.ch * 0.8 }} onClick={p.onDeck}>
            {Array.from({ length: Math.min(8, Math.ceil((r?.deckCount ?? 52) / 6)) }, (_, i) => (
              <div key={i} className="deck-layer" style={{ transform: `translate(${-i * 0.6}px, ${-i * 1.6}px)` }} dangerouslySetInnerHTML={{ __html: CARD_BACK_SVG }} />
            ))}
            <div className="deck-top" data-anchor="deck" style={{ transform: `translate(${-Math.min(8, Math.ceil((r?.deckCount ?? 52) / 6)) * 0.6}px, ${-Math.min(8, Math.ceil((r?.deckCount ?? 52) / 6)) * 1.6}px)` }} />
            {r && <span className="deck-count">{r.deckCount}</span>}
          </div>
          {/* pile, scattered inside the table circle */}
          <div className="pile-zone" style={{ left: geom.pile.x, top: geom.pile.y, width: geom.pile.r * 2.4, height: geom.pile.r * 2 }} onClick={p.onPile} data-anchor="pile" />
          {discard.slice(pileStart).map((c, k) => {
            const i = pileStart + k;
            const spot = pileSpot(i, `${c.r}${c.s}`, geom.pile);
            const hidden = i >= discard.length - p.ov.pileHide;
            return <CardEl key={`${i}-${c.r}${c.s}`} face={c} up four={four} className={`pile-card ${hidden ? 'hidden' : ''}`} data-pile={i} data-rot={spot.rot}
              style={{ left: spot.x, top: spot.y, width: geom.cw * 0.8, height: geom.ch * 0.8, transform: `translate(-50%,-50%) rotate(${spot.rot}deg)` }} onClick={p.onPile} />;
          })}
          {/* invisible landing marker for the next pile card */}
          {(() => { const i = discard.length; const spot = pileSpot(i, 'next', geom.pile); return <div className="pile-next" data-pile-next={i} data-rot={spot.rot} style={{ left: geom.pile.x, top: geom.pile.y, width: geom.cw * 0.8, height: geom.ch * 0.8, transform: `translate(-50%,-50%) rotate(${spot.rot}deg)` }} />; })()}
          {r?.window && v.phase === 'PLAY' && (
            <div className="target-badge" style={{ left: geom.pile.x, top: geom.pile.y - geom.pile.r - 44 }}><span>{t('game.match', { n: r.window.target })}</span></div>
          )}
          {/* my little corner of the table: tea and chocolates (Liv's favourites) */}
          <div className="my-props" style={{ left: geom.W * (geom.portrait ? 0.1 : 0.2), top: geom.H * (geom.portrait ? 0.7 : 0.72) }}><TeaGlass w={geom.portrait ? 34 : 30} /></div>
          <div className="my-props" style={{ left: geom.W * (geom.portrait ? 0.88 : 0.8), top: geom.H * (geom.portrait ? 0.71 : 0.74) }}><ChocolateBowl w={geom.portrait ? 84 : 76} /></div>

          {seatsShown.map((seat) => {
            const sp = pos[seat];
            if (!sp) return null;
            const a = geom.anchors[sp];
            const slots = r?.areas[seat] ?? [];
            const L = areaLayout(slots, a);
            const isMe = seat === me;
            const far = sp === 'left' || sp === 'right' ? (L.w * L.scale) / 2 : (L.h * L.scale) / 2;
            const si = v.seats[seat];
            const plateTop = a.y - far - 14;
            return (
              <div key={seat}>
                <div className={`area ${isMe ? 'mine' : 'theirs'} ${p.seatSelectable.has(seat) ? 'seat-pick' : ''} ${r?.current === seat && v.phase === 'PLAY' ? 'turn' : ''}`} data-anchor={`area-${seat}`} data-rot={a.rot}
                  style={{ left: a.x, top: a.y, width: Math.max(L.w, a.cw), height: Math.max(L.h, a.ch), transform: `translate(-50%,-50%) translateZ(1px) rotate(${a.rot}deg) scale(${L.scale})` }}
                  onClick={() => p.seatSelectable.has(seat) && p.onSeat(seat)}>
                  <div className="area-glow" />
                  {slots.map((sv) => <SlotCard key={sv.id} sv={sv} a={a} place={L.places[sv.id]!} ov={p.ov.slot[sv.id]} four={four} rot={a.rot}
                    selectable={p.selectable.has(sv.id)} selected={p.selected.has(sv.id)} numbers={prefs.slotNumbers} hovered={Object.values(p.hover).includes(sv.id)}
                    tentative={active?.k === 'attempt' && active.tentative.includes(sv.id)} wrongMark={active?.k === 'attempt' && active.wrong.includes(sv.id)}
                    onTap={() => p.onSlot(sv.id, seat)} onHover={p.onHoverSlot} onLong={isMe ? p.onLongPressMine : undefined} />)}
                  {p.ov.badges[seat] && <div className="plus-badge" style={{ transform: `rotate(${-a.rot}deg)` }}>{p.ov.badges[seat]}</div>}
                </div>
                {!isMe && si && <div className="bb-anchor" data-bb={seat} style={{ left: a.x, top: plateTop }} />}
                {showDie(seat) && <div className="bb-anchor" data-die={seat} style={{ left: a.x, top: isMe ? a.y - 40 : a.y }} />}
              </div>
            );
          })}
        </div>
      </div>
      <div className="bb-layer">
        {seatsShown.map((seat) => {
          const si = v.seats[seat]; const sp = pos[seat];
          if (!si || !sp || seat === me) return null;
          const at = bbPos[`b${seat}`]; if (!at) return null;
          const a = geom.anchors[sp];
          const hc = { width: a.cw * 0.9 * scale * bb, height: a.ch * 0.9 * scale * bb };
          return (
            <div key={seat} className="billboard" style={{ left: at.x, top: at.y }}>
              {p.bubbles[seat] && Date.now() - p.bubbles[seat]!.at < 5000 && <div className="bubble">{p.bubbles[seat]!.text}</div>}
              <div className={`bust-wrap ${p.ov.pulse[seat] ?? ''} ${p.seatSelectable.has(seat) ? 'seat-pick' : ''}`} onClick={() => p.seatSelectable.has(seat) && p.onSeat(seat)}>
                <CharacterBust id={si.characterId} mood={moodOf(seat)} color={SEAT_COLORS[seat]} size={bustPx} />
                {r?.drawn?.by === seat && !p.ov.hideHand[seat] && (
                  <CardEl face={r.drawn.face ?? null} up={!!r.drawn.face} four={four} className="held" data-anchor={`hand-${seat}`} style={hc} />
                )}
                <div className="held-spot" data-anchor={`handspot-${seat}`} style={hc} />
              </div>
              <NamePlate view={v} seat={seat} />
            </div>
          );
        })}
        {seatsShown.map((seat) => {
          const at = bbPos[`d${seat}`]; if (!at || !showDie(seat)) return null;
          return <Die key={'d' + seat} seat={seat} view={v} ov={p.ov} style={{ left: at.x, top: at.y, transform: `translate(-50%,-50%) scale(${seat === me ? 1.25 : 1})` }} />;
        })}
      </div>
    </div>
  );
});

const SlotCard = memo(function SlotCard(p: { sv: SlotView; a: Anchor; place: { x: number; y: number }; ov?: Overrides['slot'][string]; four: boolean; rot: number; selectable: boolean; selected: boolean; numbers: boolean; hovered: boolean; tentative: boolean; wrongMark: boolean; onTap(): void; onHover?(id: string | null): void; onLong?(): void }) {
  const { sv, a, place, ov } = p;
  const lp = useRef<{ t: ReturnType<typeof setTimeout> | null; fired: boolean }>({ t: null, fired: false });
  const down = () => { if (!p.onLong) return; lp.current.fired = false; lp.current.t = setTimeout(() => { lp.current.fired = true; p.onLong?.(); }, 500); };
  const up = () => { if (lp.current.t) clearTimeout(lp.current.t); lp.current.t = null; };
  const forced = ov?.show;
  const face = forced && forced !== 'back' ? forced : forced === 'back' ? null : sv.face ?? null;
  const shown = !ov?.hide && (!sv.empty || (forced && forced !== 'back'));
  const why = sv.why;
  const cls = [
    'slot', sv.empty && !shown ? 'empty' : '', p.selectable ? 'selectable' : '', p.selected ? 'selected' : '', p.tentative ? 'tentative' : '',
    why === 'peek' ? 'peek-lift' : '', why === 'queen' ? 'queen-lift' : '', why === 'test' ? 'test-reveal' : '', p.hovered ? 'hovered' : '', ov?.cls ?? '', ov?.hide ? 'hidden' : '',
  ].join(' ');
  return (
    <div className={cls} data-slot={sv.id} data-rot={p.rot} style={{ left: `calc(50% + ${place.x}px)`, top: `calc(50% + ${place.y}px)`, width: a.cw, height: a.ch }}
      onClick={(e) => { e.stopPropagation(); if (lp.current.fired) { lp.current.fired = false; return; } p.onTap(); }} onPointerDown={down} onPointerUp={up} onPointerCancel={up} onContextMenu={(e) => p.onLong && e.preventDefault()} onPointerEnter={() => p.onHover?.(sv.id)} onPointerLeave={() => { up(); p.onHover?.(null); }}
      role="button" aria-label={`slot ${sv.num}${face ? ` ${face.r}${face.s}` : ''}`}>
      <div className="slot-outline" />
      {shown && <CardEl face={face} up={!!face} four={p.four} className="slot-card" />}
      {p.numbers && <span className="slot-num" style={{ transform: `rotate(${-p.rot}deg)` }}>{sv.num}</span>}
      {sv.ghost && !face && <span className="ghost" style={{ transform: `rotate(${-p.rot}deg)` }}>{['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][sv.ghost.r]}</span>}
      {p.wrongMark && !face && <span className="wrong-x">✕</span>}
    </div>
  );
});

export function NamePlate({ view, seat }: { view: PlayerView; seat: number }) {
  const si = view.seats[seat];
  if (!si) return null;
  const r = view.round;
  const queuePos = r ? r.queue.filter((q) => q.k === 'claim').findIndex((q) => (q as { seat: number }).seat === seat) : -1;
  const disc = !si.isBot && !si.connected;
  return (
    <div className={`nameplate ${r?.current === seat && view.phase === 'PLAY' ? 'is-turn' : ''} ${disc ? 'disc' : ''}`} style={{ borderColor: SEAT_COLORS[seat] }}>
      <span className={`dot ${disc ? 'off' : 'on'}`} />
      <b>{si.name}</b>{si.isBot && <i className="bot-tag">{si.replacedByBot ? '🤖↺' : '🤖'}</i>}
      <span className="np-score">★ {view.scores[seat] ?? 0}</span>
      {r && <span className="np-count">🂠 {r.counts[seat] ?? 0}</span>}
      {queuePos >= 0 && <span className="np-queue">#{queuePos + 1}</span>}
      {disc && <span className="np-disc">{t('lobby.disconnected')} — …</span>}
    </div>
  );
}

const PIP_POS: Record<number, [number, number][]> = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[28, 28], [50, 50], [72, 72]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]], 6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]] };
function DieFace({ n }: { n: number }) {
  return <svg viewBox="0 0 100 100" className="die-face-svg">{(PIP_POS[n] ?? []).map(([x, y], i) => <circle key={i} cx={x} cy={y} r="9" fill="#3b2116" />)}</svg>;
}
function Die({ seat, view, ov, style }: { seat: number; view: PlayerView; ov: Overrides; style: CSSProperties }) {
  const roll = view.roll;
  const last = roll?.history.length ? roll.history[roll.history.length - 1] : undefined;
  const value = ov.dice?.values?.[seat] ?? (view.phase === 'START_ROLL' ? undefined : last?.[seat]);
  const rolled = roll?.rolled.includes(seat);
  const rolling = ov.dice?.rolling;
  const isRoller = roll?.rollers.includes(seat);
  const winner = ov.dice?.winner === seat;
  const tied = ov.dice?.tied?.includes(seat);
  const rotFor: Record<number, string> = { 1: 'rotateX(0deg) rotateY(0deg)', 2: 'rotateY(-90deg)', 3: 'rotateX(-90deg)', 4: 'rotateX(90deg)', 5: 'rotateY(90deg)', 6: 'rotateY(180deg)' };
  return (
    <div className={`die-wrap ${rolling ? 'rolling' : ''} ${winner ? 'winner' : ''} ${tied ? 'tied' : ''} ${rolled && !value ? 'cast' : ''} ${!isRoller && view.phase === 'START_ROLL' && !value ? 'out' : ''}`} style={style}>
      <div className="die" style={{ transform: value && !rolling ? rotFor[value] : undefined }}>
        {[1, 6, 2, 5, 3, 4].map((n) => <div key={n} className={`die-face f${n}`}><DieFace n={n} /></div>)}
      </div>
      {rolled && !value && <span className="die-tick">✓</span>}
    </div>
  );
}
