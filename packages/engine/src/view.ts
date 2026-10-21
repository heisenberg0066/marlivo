// Per-player projection (§11.2): the only thing ever sent to a client or a bot.
// Face-down slots carry no card id and no value unless this seat is entitled to see it right now.
import type { CardFace, GameEvent, GameState, SeatId, SeatInfo, Settings, SeatStats, LogEntry, Power } from './types';
import { face } from './cards';
import { isPaused, pausedSeats, cardCount } from './engine';

export interface SlotView {
  id: string; num: number; row: number; col: number; empty: boolean;
  face?: CardFace;          // visible to you now
  why?: 'peek' | 'queen' | 'tentative' | 'reveal' | 'test';
  ghost?: CardFace;          // memory helper / bot memory: a card you legitimately saw earlier
}
export interface PlayerView {
  you: SeatId | null;
  phase: GameState['phase'];
  settings: Settings;
  host: SeatId | null;
  seats: (SeatInfo | null)[];
  players: SeatId[];
  scores: Record<number, number>;
  roundNo: number;
  paused: boolean;
  pausedSeats: SeatId[];
  matchWinner: SeatId | null;
  endedBy: GameState['endedBy'];
  stats: Record<number, SeatStats>;
  log: LogEntry[];
  roll: { rollers: SeatId[]; rolled: SeatId[]; history: Record<number, number>[] } | null;
  test: { reveal: boolean; preset?: string; forcedDeck?: number; forcedDice?: number[] } | null;
  round: null | {
    no: number; turns: number; windows: number; starter: SeatId; starterReason: string; participants: SeatId[]; current: SeatId;
    deckCount: number; discard: CardFace[];
    drawn: null | { by: SeatId; face?: CardFace };
    window: null | { target: number; turnPlayer: SeatId };
    queue: ({ k: 'power'; owner: SeatId; power: Power } | { k: 'claim'; seat: SeatId })[];
    active: null
      | { k: 'power'; owner: SeatId; power: Power; peekSlot?: string; peekFace?: CardFace }
      | { k: 'attempt'; seat: SeatId; target: number; flipped: string[]; tentative: string[]; wrong: string[]; sum: number; penaltyDue: number; finishTry: boolean; finisher?: SeatId }
      | { k: 'finish'; finisher: SeatId; turnPlayer: SeatId };
    areas: Record<number, SlotView[]>;
    counts: Record<number, number>;
    peek: Record<number, { count: number; done: boolean }>;
    commitment: string;
    nextReady: SeatId[];
    result: null | { winner: SeatId | null; reason: string; deckOrder: string[]; salt: string };
  };
}

export interface ViewOptions { helper?: 'off' | 'own' | 'full'; log?: boolean }

export function projectView(s: GameState, you: SeatId | null, opts: ViewOptions = {}): PlayerView {
  const r = s.round;
  const helper = opts.helper ?? s.settings.memoryHelper;
  const testReveal = s.settings.test && you !== null && s.test.reveal.includes(you);
  let round: PlayerView['round'] = null;
  if (r) {
    const ended = s.phase === 'ROUND_END' || (s.phase === 'MATCH_END' && !!r.result);
    const a = r.active;
    const tentative = new Set(a?.k === 'attempt' ? a.tentative : []);
    const areas: Record<number, SlotView[]> = {};
    for (const [k, slots] of Object.entries(r.areas)) {
      const owner = Number(k);
      areas[owner] = slots.map((sl) => {
        const v: SlotView = { id: sl.id, num: sl.num, row: sl.row, col: sl.col, empty: !sl.card };
        if (!sl.card) return v;
        if (ended) { v.face = face(sl.card); v.why = 'reveal'; }
        else if (tentative.has(sl.id)) { v.face = face(sl.card); v.why = 'tentative'; }
        else if (s.phase === 'PEEK' && you === owner && r.peek[owner] && !r.peek[owner]!.done && r.peek[owner]!.picked.includes(sl.id)) { v.face = face(sl.card); v.why = 'peek'; }
        else if (a?.k === 'power' && a.power === 'Q' && a.owner === you && a.peekSlot === sl.id) { v.face = face(sl.card); v.why = 'queen'; }
        else if (testReveal) { v.face = face(sl.card); v.why = 'test'; }
        if (!v.face && you !== null && helper !== 'off' && (helper === 'full' || owner === you) && r.knowledge[sl.card.id]?.includes(you)) v.ghost = face(sl.card);
        return v;
      });
    }
    let active: NonNullable<PlayerView['round']>['active'] = null;
    if (a?.k === 'attempt') {
      const sum = a.tentative.reduce((acc, id) => acc + (Object.values(r.areas).flat().find((x) => x.id === id)?.card?.r ?? 0), 0);
      active = { k: 'attempt', seat: a.seat, target: a.target, flipped: [...a.flipped], tentative: [...a.tentative], wrong: [...a.wrong], sum, penaltyDue: a.wrong.length * 2, finishTry: !!a.finishTry, finisher: a.finishTry?.finisher };
    } else if (a?.k === 'power') {
      active = { k: 'power', owner: a.owner, power: a.power, peekSlot: a.peekSlot };
      if (a.power === 'Q' && a.peekSlot && a.owner === you) { const f = Object.values(r.areas).flat().find((x) => x.id === a.peekSlot)?.card; if (f) active.peekFace = face(f); }
    } else if (a?.k === 'finish') active = { k: 'finish', finisher: a.finisher, turnPlayer: a.turnPlayer };
    const counts: Record<number, number> = {};
    for (const p of r.participants) counts[p] = cardCount(r, p);
    round = {
      no: r.no, turns: r.turns, windows: r.windows, starter: r.starter, starterReason: r.starterReason, participants: [...r.participants], current: r.current,
      deckCount: r.deck.length, discard: r.discard.map(face),
      drawn: r.drawn ? { by: r.current, ...(r.current === you || testReveal ? { face: face(r.drawn) } : {}) } : null,
      window: r.window ? { target: r.window.target, turnPlayer: r.window.turnPlayer } : null,
      queue: r.queue.map((q) => (q.k === 'power' ? { k: 'power' as const, owner: q.owner, power: q.power } : { k: 'claim' as const, seat: q.seat })),
      active, areas, counts,
      peek: Object.fromEntries(Object.entries(r.peek).map(([k, v]) => [k, { count: v.picked.length, done: v.done }])),
      commitment: r.commitment, nextReady: [...r.nextReady],
      result: r.result ? { ...r.result, deckOrder: [...r.result.deckOrder] } : null,
    };
  }
  return {
    you, phase: s.phase, settings: { ...s.settings }, host: s.host,
    seats: s.seats.map((x) => (x ? { ...x } : null)), players: [...s.players], scores: { ...s.scores }, roundNo: s.roundNo,
    paused: isPaused(s), pausedSeats: pausedSeats(s), matchWinner: s.matchWinner, endedBy: s.endedBy,
    stats: Object.fromEntries(Object.entries(s.stats).map(([k, v]) => [k, { ...v }])),
    log: opts.log === false ? [] : s.log.slice(),
    roll: s.roll ? { rollers: [...s.roll.rollers], rolled: Object.keys(s.roll.pending).map(Number), history: s.roll.history.map((h) => ({ ...h })) } : null,
    test: s.settings.test ? { reveal: testReveal, preset: s.test.preset, forcedDeck: s.test.forcedDeck?.length, forcedDice: s.test.forcedDice ? [...s.test.forcedDice] : undefined } : null,
    round,
  };
}

/** The copy of an event that one seat receives: public part, plus the private part only for its owner. */
export function projectEvent(e: GameEvent, you: SeatId | null): { t: string; p: Record<string, unknown>; priv?: Record<string, unknown> } {
  return e.x && e.x.to === you ? { t: e.t, p: e.p, priv: e.x.d } : { t: e.t, p: e.p };
}
