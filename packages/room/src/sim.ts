// Simulation helpers: bot-vs-bot games straight on the engine (soak / property tests) and a virtual-time scheduler.
import { createGame, reduce, projectView, SeededRng, allSlots, type GameState, type Intent, type Rng, type BotLevel } from '@marlivo/engine';
import { botDecide, createBrain, type BotBrain } from '@marlivo/bots';
import type { Scheduler } from './host';

export interface SimResult { state: GameState; steps: number; rounds: number; winners: (number | null)[]; rejects: number; penalties: number }

export function checkInvariants(s: GameState, prevSlotIds?: Map<number, string[]>) {
  const r = s.round;
  if (!r) return;
  const cards = [...r.deck, ...r.discard, ...allSlots(r).map((x) => x.card).filter(Boolean), ...(r.drawn ? [r.drawn] : [])] as { id: string; r: number; s: string }[];
  const participants = r.participants.length;
  const removedSeats = s.seats.filter((x) => !x).length; // removed players' cards are on the deck bottom
  void participants; void removedSeats;
  if (cards.length !== 52) throw new Error(`card count ${cards.length} != 52`);
  if (new Set(cards.map((c) => c.id)).size !== 52) throw new Error('duplicate card id');
  if (new Set(cards.map((c) => c.r + c.s)).size !== 52) throw new Error('duplicate card face');
  if (prevSlotIds) for (const [seat, ids] of prevSlotIds) {
    const now = (r.areas[seat] ?? []).map((x) => `${x.id}@${x.row},${x.col}`);
    if (r.areas[seat] && !ids.every((id) => now.includes(id))) throw new Error('slot ids/positions changed');
  }
}
export const slotSnapshot = (s: GameState) => new Map(Object.entries(s.round?.areas ?? {}).map(([k, v]) => [Number(k), v.map((x) => `${x.id}@${x.row},${x.col}`)]));

export function simulateMatch(seed: string | number, opts: { players?: number; levels?: BotLevel[]; target?: number; cards?: number; invariants?: boolean; maxSteps?: number; onStep?: (s: GameState) => void } = {}): SimResult {
  const rng: Rng = new SeededRng(seed);
  const botRng: Rng = new SeededRng(String(seed) + 'b');
  const n = opts.players ?? 2 + Math.floor(rng.next() * 3);
  let s = createGame({ targetPoints: opts.target ?? 1, cardsPerPlayer: opts.cards ?? 4 + Math.floor(rng.next() * 5) });
  const levels: BotLevel[] = opts.levels ?? (['easy', 'normal', 'hard'] as BotLevel[]);
  const brains: BotBrain[] = [];
  for (let i = 0; i < n; i++) {
    const r = reduce(s, 'sys', { t: 'SYS_JOIN', seat: i, name: 'B' + i, characterId: 'mint', lang: 'en' }, rng);
    if (!r.ok) throw new Error(r.reason);
    s = r.state;
    brains.push(createBrain(levels[i % levels.length]!));
  }
  for (let i = 1; i < n; i++) { const r = reduce(s, i, { t: 'SET_READY', ready: true }, rng); if (r.ok) s = r.state; }
  const st = reduce(s, 0, { t: 'START' }, rng); if (!st.ok) throw new Error(st.reason); s = st.state;
  let steps = 0, rejects = 0, rounds = 0, penalties = 0;
  const winners: (number | null)[] = [];
  const maxSteps = opts.maxSteps ?? 20000;
  let slots = slotSnapshot(s);
  let roundNo = s.roundNo;
  while (s.phase !== 'MATCH_END') {
    if (++steps > maxSteps) throw new Error(`no progress after ${maxSteps} steps (phase ${s.phase})`);
    if (s.phase === 'ROUND_END') {
      rounds++; winners.push(s.round!.result!.winner);
      for (let i = 0; i < n; i++) { const r = reduce(s, i, { t: 'NEXT_ROUND' }, rng); if (r.ok) s = r.state; }
      continue;
    }
    const intents: { seat: number; it: Intent }[] = [];
    for (let i = 0; i < n; i++) {
      if (!s.seats[i]) continue;
      const it = botDecide(projectView(s, i, { helper: 'full', log: false }), brains[i]!, botRng);
      if (it) intents.push({ seat: i, it });
    }
    if (!intents.length) throw new Error(`deadlock in ${s.phase}: no bot can act (active=${JSON.stringify(s.round?.active)} queue=${JSON.stringify(s.round?.queue)})`);
    // server arrival order: a random bot's intent arrives first
    const pick = intents[Math.floor(rng.next() * intents.length)]!;
    const r = reduce(s, pick.seat, pick.it, rng);
    if (!r.ok) { rejects++; continue; }
    for (const e of r.events) if (e.t === 'PENALTY_DEALT') penalties += (e.p.slots as unknown[]).length;
    s = r.state;
    opts.onStep?.(s);
    if (opts.invariants !== false && s.phase === 'PLAY') {
      if (s.roundNo !== roundNo) { roundNo = s.roundNo; slots = slotSnapshot(s); }
      checkInvariants(s, slots);
      slots = slotSnapshot(s);
    }
  }
  return { state: s, steps, rounds, winners, rejects, penalties };
}

/** Deterministic virtual-time scheduler for RoomHost tests. */
export class VirtualScheduler implements Scheduler {
  t = 0; private q: { at: number; fn: () => void; id: number }[] = []; private id = 0;
  set(ms: number, fn: () => void) { const id = ++this.id; this.q.push({ at: this.t + ms, fn, id }); return id; }
  clear(h: unknown) { this.q = this.q.filter((x) => x.id !== h); }
  now() { return this.t; }
  runAll(limit = 100000) {
    let n = 0;
    while (this.q.length) {
      if (++n > limit) throw new Error('scheduler did not settle');
      this.q.sort((a, b) => a.at - b.at || a.id - b.id);
      const x = this.q.shift()!; this.t = Math.max(this.t, x.at); x.fn();
    }
    return n;
  }
  get pending() { return this.q.length; }
}
