import { expect } from 'vitest';
import { createGame, reduce, SeededRng, testPutCard, allSlots, type GameState, type Intent, type Actor, type GameEvent, type Settings } from '../src';

export const rng = () => new SeededRng('test');
export interface Run { s: GameState; ev: GameEvent[]; rng: SeededRng }

export function act(run: Run, actor: Actor, intent: Intent): GameEvent[] {
  const r = reduce(run.s, actor, intent, run.rng);
  if (!r.ok) throw new Error(`rejected ${intent.t} by ${actor}: ${r.reason}`);
  run.s = r.state; run.ev.push(...r.events);
  return r.events;
}
export function rej(run: Run, actor: Actor, intent: Intent): string {
  const r = reduce(run.s, actor, intent, run.rng);
  expect(r.ok).toBe(false);
  return (r as { reason: string }).reason;
}

export function lobby(n: number, settings: Partial<Settings> = {}, seed = 'seed'): Run {
  const run: Run = { s: createGame(settings), ev: [], rng: new SeededRng(seed) };
  for (let i = 0; i < n; i++) act(run, 'sys', { t: 'SYS_JOIN', seat: i, name: `P${i + 1}`, characterId: 'biscuit', lang: 'en' });
  for (let i = 1; i < n; i++) act(run, i, { t: 'SET_READY', ready: true });
  return run;
}

/** Starts a match where seat 0 starts (via forced dice), arranges hands (seat index -> faces) and the deck top, finishes the peek. */
export function play(n: number, hands: string[][] = [], deckTop: string[] = [], settings: Partial<Settings> = {}): Run {
  const run = lobby(n, { ...settings, test: true });
  act(run, 0, { t: 'START' });
  run.s.test.forcedDice = [6, ...Array(n - 1).fill(1)];
  for (let i = 0; i < n; i++) act(run, i, { t: 'ROLL_DIE' });
  const r = run.s.round!;
  const fs = (d: { r: number; s: string }) => `${d.r === 1 ? 'A' : d.r === 11 ? 'J' : d.r === 12 ? 'Q' : d.r === 13 ? 'K' : d.r}${d.s}`;
  const reserved = new Set([...hands.flat(), ...deckTop]);
  for (const f of deckTop) {
    const sl = Object.values(r.areas).flat().find((x) => x.card && fs(x.card) === f);
    if (sl) { const j = r.deck.findIndex((d) => !reserved.has(fs(d))); const tmp = r.deck[j]!; r.deck[j] = sl.card!; sl.card = tmp; }
  }
  hands.forEach((cards, seat) => {
    const slots = r.areas[seat]!;
    for (const sl of slots.slice(cards.length)) { if (sl.card) r.deck.push(sl.card); sl.card = null; }
    cards.forEach((f, i) => testPutCard(r, slots[i]!.id, f));
  });
  for (const f of [...deckTop].reverse()) {
    const i = r.deck.findIndex((d) => `${d.r === 1 ? 'A' : d.r === 11 ? 'J' : d.r === 12 ? 'Q' : d.r === 13 ? 'K' : d.r}${d.s}` === f);
    if (i < 0) throw new Error('deck top card not in deck: ' + f);
    r.deck.unshift(r.deck.splice(i, 1)[0]!);
  }
  for (let i = 0; i < n; i++) {
    const own = r.areas[i]!.filter((x) => x.card).slice(0, 2);
    for (const sl of own) act(run, i, { t: 'PEEK_PICK', slot: sl.id });
    act(run, i, { t: 'PEEK_DONE' });
  }
  run.s.settings.test = false;
  run.ev = [];
  return run;
}
export const sid = (seat: number, num: number) => `S${seat + 1}-${String(num).padStart(2, '0')}`;
export const count = (run: Run, seat: number) => run.s.round!.areas[seat]!.filter((x) => x.card).length;
export const total = (run: Run) => {
  const r = run.s.round!;
  return r.deck.length + r.discard.length + allSlots(r).filter((x) => x.card).length + (r.drawn ? 1 : 0);
};
export const ofType = (run: Run, t: string) => run.ev.filter((e) => e.t === t);
