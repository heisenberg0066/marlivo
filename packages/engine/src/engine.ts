// MarLivo rules engine (spec §3–§7, §20). Pure and deterministic: (state, actor, intent, rng) -> (state, events).
// No timers, no network, no randomness except the injected RNG.
import type {
  Active, Actor, BotLevel, Card, GameEvent, GameState, Intent, LogEntry, Power, QueueItem, ReduceResult, Rng,
  RoundState, SeatId, SeatInfo, SeatStats, Settings, Slot, Suit,
} from './types';
import { SUITS, face, faceStr, parseFace, powerOf } from './cards';
import { randHex, randInt, shuffle } from './rng';
import { initialGrid, placeCard, slotId, readingOrder } from './layout';
import { sha256Hex } from './sha256';
import { PRESETS } from './presets';

export const DEFAULT_SETTINGS: Settings = {
  maxPlayers: 4, cardsPerPlayer: 6, targetPoints: 5, memoryHelper: 'off', freeText: true, voiceNotes: true,
  botSpeed: 'normal', locked: false, test: false,
};
export const BOT_NAMES = ['Lina', 'Max', 'Chloé', 'Noah', 'Inès', 'Sami'];
export const CHARACTERS = ['biscuit', 'mint', 'pepper', 'tango'];
export const PENALTY_PER_WRONG = 2;

class Reject extends Error { constructor(public reason: string) { super(reason); } }
const fail = (reason: string): never => { throw new Reject(reason); };
const check = (cond: unknown, reason: string) => { if (!cond) fail(reason); };

interface Ctx { s: GameState; ev: GameEvent[]; rng: Rng }

export function createGame(settings: Partial<Settings> = {}): GameState {
  return {
    v: 1, settings: { ...DEFAULT_SETTINGS, ...settings }, seats: [null, null, null, null], host: null, phase: 'LOBBY',
    players: [], scores: {}, roundNo: 0, lastWinner: null, lastStarter: null, roll: null, round: null, matchWinner: null,
    endedBy: null, stats: {}, log: [], test: { reveal: [] },
  };
}

const emptyStats = (): SeatStats => ({ roundsWon: 0, matches: 0, longestCombo: 0, penalties: 0, jackSwaps: 0, wrongFlips: 0, worstAttempt: 0 });

function emit(c: Ctx, t: string, p: Record<string, unknown> = {}, x?: { to: SeatId; d: Record<string, unknown> }) {
  const e: GameEvent = x ? { t, p, x } : { t, p };
  c.ev.push(e);
  if (!t.startsWith('_')) {
    c.s.log.push({ t, p } as LogEntry);
    if (c.s.log.length > 200) c.s.log.splice(0, c.s.log.length - 200);
  }
}

// ---------- helpers ----------
export const seatedIds = (s: GameState) => s.seats.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
const seat = (s: GameState, id: SeatId): SeatInfo => s.seats[id] ?? fail('NO_SEAT');
const isHuman = (si: SeatInfo | null) => !!si && !si.isBot;

/** Seats whose disconnection pauses the game (§10.4): human participants of a running round/roll/peek. */
export function pausedSeats(s: GameState): SeatId[] {
  if (s.phase !== 'START_ROLL' && s.phase !== 'PEEK' && s.phase !== 'PLAY') return [];
  const ids = s.phase === 'START_ROLL' ? s.players : s.round?.participants ?? [];
  return ids.filter((id) => { const si = s.seats[id]; return isHuman(si) && !si!.connected; });
}
export const isPaused = (s: GameState) => pausedSeats(s).length > 0;

export function nextInOrder(order: SeatId[], from: SeatId): SeatId {
  // clockwise = increasing seat index, cyclic, among `order`
  const sorted = [...order].sort((a, b) => a - b);
  for (const id of sorted) if (id > from) return id;
  return sorted[0]!;
}

export function allSlots(r: RoundState): Slot[] { return Object.values(r.areas).flat(); }
export function findSlot(r: RoundState, id: string): { slot: Slot; owner: SeatId } | null {
  for (const [owner, slots] of Object.entries(r.areas)) { const slot = slots.find((x) => x.id === id); if (slot) return { slot, owner: Number(owner) }; }
  return null;
}
export const cardCount = (r: RoundState, seatId: SeatId) => (r.areas[seatId] ?? []).filter((x) => x.card).length;
const know = (r: RoundState, card: Card, seats: SeatId[]) => {
  const k = (r.knowledge[card.id] ??= []);
  for (const id of seats) if (!k.includes(id)) k.push(id);
};
const seePublic = (r: RoundState, card: Card) => { if (!r.publicSeen.includes(card.id)) r.publicSeen.push(card.id); know(r, card, r.participants); };
const st = (c: Ctx, id: SeatId) => (c.s.stats[id] ??= emptyStats());

// ---------- deck ----------
function newDeck(c: Ctx): Card[] {
  const deck: Card[] = [];
  const used = new Set<string>();
  for (const s of SUITS) for (let r = 1; r <= 13; r++) {
    let id: string; do { id = 'c' + randHex(c.rng, 4); } while (used.has(id));
    used.add(id); deck.push({ id, r, s });
  }
  shuffle(c.rng, deck);
  const forced = c.s.test.forcedDeck;
  if (c.s.settings.test && forced?.length) {
    const top: Card[] = [];
    for (const f of forced) {
      const pf = parseFace(f); if (!pf) continue;
      const i = deck.findIndex((d) => d.r === pf.r && (!pf.s || d.s === pf.s));
      if (i >= 0) top.push(deck.splice(i, 1)[0]!);
    }
    deck.unshift(...top);
    c.s.test.forcedDeck = undefined;
  }
  return deck;
}

/**
 * Takes the top card for a draw, a penalty or a 10-power (R27, §7.3). Reshuffles only when the deck is completely
 * empty, keeping the current target and open-match cards on the pile. Last resort: the kept cards too.
 * Returns null when truly no card exists outside the players' areas.
 */
function takeCard(c: Ctx): Card | null {
  const r = c.s.round!;
  if (!r.deck.length) {
    const keep = new Set(r.window ? r.window.openIds : r.discard.length ? [r.discard[r.discard.length - 1]!.id] : []);
    let pool = r.discard.filter((x) => !keep.has(x.id));
    let lastResort = false;
    if (!pool.length && r.discard.length) { pool = [...r.discard]; lastResort = true; }
    if (!pool.length) return null;
    const poolIds = new Set(pool.map((x) => x.id));
    r.discard = r.discard.filter((x) => !poolIds.has(x.id));
    r.deck = shuffle(c.rng, pool);
    r.reshuffles++;
    emit(c, 'RESHUFFLED', { deckCount: r.deck.length, lastResort, kept: r.discard.length });
  }
  return r.deck.shift()!;
}

// ---------- round lifecycle ----------
function startRound(c: Ctx, starter: SeatId, reason: RoundState['starterReason']) {
  const s = c.s;
  const participants = [...s.players].sort((a, b) => a - b);
  s.roundNo++;
  s.lastStarter = starter;
  const deck = newDeck(c);
  const order = deck.map(faceStr);
  const salt = randHex(c.rng, 16);
  const r: RoundState = {
    no: s.roundNo, participants, starter, starterReason: reason, deck, discard: [], areas: {}, nextNum: {}, current: starter,
    drawn: null, window: null, queue: [], active: null, peek: {}, knowledge: {}, publicSeen: [],
    commitment: sha256Hex(order.join(',') + '|' + salt), salt, order, nextReady: [], result: null, reshuffles: 0, turns: 0, windows: 0,
  };
  s.round = r;
  s.log = [];
  const n = s.settings.cardsPerPlayer;
  const grid = initialGrid(n);
  for (const p of participants) {
    r.areas[p] = grid.map((g, i) => ({ id: slotId(p, i + 1), num: i + 1, row: g.row, col: g.col, card: null }));
    r.nextNum[p] = n + 1;
    r.peek[p] = { picked: [], done: false };
  }
  // Deal one at a time in seat order from the starter (§4.2 DEALING).
  const dealOrder: SeatId[] = [];
  let p = starter;
  for (let i = 0; i < participants.length; i++) { dealOrder.push(p); p = nextInOrder(participants, p); }
  const dealt: string[] = [];
  for (let k = 0; k < n; k++) for (const q of dealOrder) { const slot = r.areas[q]![k]!; slot.card = r.deck.shift()!; dealt.push(slot.id); }
  if (s.settings.test && s.test.preset) { applyPreset(c, s.test.preset); s.test.preset = undefined; }
  s.phase = 'PEEK';
  emit(c, 'ROUND_START', { roundNo: r.no, starter, reason, commitment: r.commitment, participants });
  emit(c, 'DEALT', { order: dealt, deckCount: r.deck.length });
}

function startMatch(c: Ctx) {
  const s = c.s;
  s.players = seatedIds(s);
  s.scores = {}; s.stats = {};
  for (const id of s.players) { s.scores[id] = 0; s.stats[id] = emptyStats(); }
  s.roundNo = 0; s.lastWinner = null; s.lastStarter = null; s.matchWinner = null; s.endedBy = null; s.round = null;
  s.phase = 'START_ROLL';
  s.roll = { rollers: [...s.players], pending: {}, history: [] };
  s.log = [];
  emit(c, 'MATCH_START', { players: s.players });
}

function endRound(c: Ctx, winner: SeatId | null, reason: NonNullable<RoundState['result']>['reason']) {
  const s = c.s, r = s.round!;
  r.result = { winner, reason, deckOrder: r.order, salt: r.salt };
  r.queue = []; r.active = null;
  if (winner !== null) {
    s.scores[winner] = (s.scores[winner] ?? 0) + 1;
    s.lastWinner = winner;
    st(c, winner).roundsWon++;
  }
  s.phase = 'ROUND_END';
  r.nextReady = [];
  const reveal: Record<string, { r: number; s: Suit }> = {};
  for (const sl of allSlots(r)) if (sl.card) reveal[sl.id] = face(sl.card);
  emit(c, 'ROUND_END', { winner, reason, reveal, scores: { ...s.scores }, deckOrder: r.order, salt: r.salt, matchOver: matchOver(s) });
}
const matchOver = (s: GameState) => Object.values(s.scores).some((v) => v >= s.settings.targetPoints);

function maybeFinishRoundEndReady(c: Ctx) {
  const s = c.s, r = s.round!;
  const waiting = r.participants.filter((id) => { const si = s.seats[id]; return isHuman(si) && si!.connected && !r.nextReady.includes(id); });
  if (waiting.length) return;
  if (matchOver(s)) {
    s.phase = 'MATCH_END';
    const top = Math.max(...s.players.map((id) => s.scores[id] ?? 0));
    s.matchWinner = s.players.find((id) => (s.scores[id] ?? 0) === top) ?? null;
    emit(c, 'MATCH_END', { winner: s.matchWinner, scores: { ...s.scores }, endedBy: null });
    return;
  }
  // Later rounds: previous winner starts; if he left, the next active seat clockwise (§4.5, E32).
  // A no-winner round: the previous round's starter starts again (§7.3).
  let starter: SeatId; let reason: RoundState['starterReason'];
  const base = r.result?.winner ?? null;
  if (base !== null) { starter = s.players.includes(base) ? base : nextInOrder(s.players, base); reason = 'lastWinner'; }
  else { const ls = s.lastStarter ?? s.players[0]!; starter = s.players.includes(ls) ? ls : nextInOrder(s.players, ls); reason = 'repeat'; }
  startRound(c, starter, reason);
}

// ---------- the resolve queue (§4.3, §5.6) ----------
function queuePower(r: RoundState, item: QueueItem) {
  // A power goes after any waiting powers but before every queued match claim.
  let i = 0;
  while (i < r.queue.length && r.queue[i]!.k === 'power') i++;
  r.queue.splice(i, 0, item);
}

function land(c: Ctx, card: Card, by: SeatId, src: 'throw' | 'swap' | 'match') {
  const r = c.s.round!;
  r.discard.push(card);
  seePublic(r, card);
  if (src === 'match' && r.window) r.window.openIds.push(card.id);
  emit(c, 'LANDED', { card: face(card), by, src });
  const pw = powerOf(card.r);
  if (pw) queuePower(r, { k: 'power', owner: by, power: pw, cardId: card.id });
}

function advance(c: Ctx) {
  const s = c.s;
  for (;;) {
    if (s.phase !== 'PLAY') return;
    const r = s.round!;
    if (r.active || !r.queue.length) return;
    const item = r.queue.shift()!;
    if (item.k === 'power') {
      if (!r.participants.includes(item.owner)) continue; // power lost (player removed)
      if (item.power === '10' && r.participants.length === 2) {
        const to = r.participants.find((x) => x !== item.owner)!;
        emit(c, 'POWER_START', { owner: item.owner, power: '10', auto: true });
        giveTen(c, item.owner, to);
        continue;
      }
      r.active = { k: 'power', owner: item.owner, power: item.power };
      emit(c, 'POWER_START', { owner: item.owner, power: item.power });
      return;
    }
    if (!r.window) { emit(c, 'CLAIM_DROPPED', { seat: item.seat }); continue; }
    r.active = { k: 'attempt', seat: item.seat, target: r.window.target, flipped: [], tentative: [], wrong: [] };
    emit(c, 'ATTEMPT_START', { seat: item.seat, target: r.window.target });
    return;
  }
}

function giveTen(c: Ctx, owner: SeatId, to: SeatId) {
  const r = c.s.round!;
  const card = takeCard(c);
  if (!card) { emit(c, 'NO_CARDS', {}); endRound(c, null, 'noCards'); return; }
  const slot = placeCard(r, to, card, c.rng);
  r.knowledge[card.id] = [];
  emit(c, 'TEN_GIVEN', { owner, to, slot: slot.id, row: slot.row, col: slot.col, num: slot.num });
}

function dealPenalty(c: Ctx, to: SeatId, n: number): boolean {
  const r = c.s.round!;
  const slots: { id: string; row: number; col: number; num: number }[] = [];
  for (let i = 0; i < n; i++) {
    const card = takeCard(c);
    if (!card) { if (slots.length) emit(c, 'PENALTY_DEALT', { seat: to, slots }); emit(c, 'NO_CARDS', {}); endRound(c, null, 'noCards'); return false; }
    const slot = placeCard(r, to, card, c.rng);
    r.knowledge[card.id] = [];
    slots.push({ id: slot.id, row: slot.row, col: slot.col, num: slot.num });
  }
  if (n) { emit(c, 'PENALTY_DEALT', { seat: to, slots }); st(c, to).penalties += n; st(c, to).worstAttempt = Math.max(st(c, to).worstAttempt, n); }
  return true;
}

const attemptSum = (r: RoundState, a: Extract<Active, { k: 'attempt' }>) =>
  a.tentative.reduce((sum, id) => sum + findSlot(r, id)!.slot.card!.r, 0);

function unflippedLeft(r: RoundState, a: Extract<Active, { k: 'attempt' }>) {
  return r.areas[a.seat]!.some((sl) => sl.card && !a.flipped.includes(sl.id));
}

function completeAttempt(c: Ctx, a: Extract<Active, { k: 'attempt' }>) {
  const s = c.s, r = s.round!;
  const played: Card[] = [];
  for (const id of a.tentative) { const sl = findSlot(r, id)!.slot; played.push(sl.card!); sl.card = null; }
  const wrong = a.flipped.filter((id) => !a.tentative.includes(id));
  r.active = null;
  st(c, a.seat).matches++;
  st(c, a.seat).longestCombo = Math.max(st(c, a.seat).longestCombo, played.length);
  st(c, a.seat).wrongFlips += wrong.length;
  const penalty = a.finishTry ? 0 : wrong.length * PENALTY_PER_WRONG;
  emit(c, 'ATTEMPT_END', { seat: a.seat, result: 'complete', played: played.map(face), playedSlots: a.tentative, wrong, penalty, target: a.target });
  for (const card of played) land(c, card, a.seat, 'match');
  if (a.finishTry) {
    // §5.3 step 4: C wins only if he emptied his area; otherwise X wins. No penalties: the round is over either way.
    if (cardCount(r, a.seat) === 0) endRound(c, a.seat, 'finishRule');
    else endRound(c, a.finishTry.finisher, 'finishRule');
    return;
  }
  if (!dealPenalty(c, a.seat, penalty)) return;
  if (cardCount(r, a.seat) === 0) {
    const turnPlayer = r.window?.turnPlayer ?? r.current;
    if (a.seat === turnPlayer || !r.participants.includes(turnPlayer)) { endRound(c, a.seat, 'empty'); return; }
    // R24 / §5.3: another player emptied his area; the turn player may try to finish first.
    r.queue = [];
    r.active = { k: 'finish', finisher: a.seat, turnPlayer };
    emit(c, 'FINISH_PENDING', { finisher: a.seat, turnPlayer });
    return;
  }
  advance(c);
}

function failAttempt(c: Ctx, a: Extract<Active, { k: 'attempt' }>, why: 'giveUp' | 'noCards') {
  const s = c.s, r = s.round!;
  const wrong = [...a.flipped];
  r.active = null;
  st(c, a.seat).wrongFlips += wrong.length;
  const penalty = a.finishTry ? 0 : wrong.length * PENALTY_PER_WRONG;
  emit(c, 'ATTEMPT_END', { seat: a.seat, result: why, played: [], wrong, penalty, target: a.target });
  if (a.finishTry) { endRound(c, a.finishTry.finisher, 'finishRule'); return; }
  if (!dealPenalty(c, a.seat, penalty)) return;
  advance(c);
}

function cancelAttemptNoPenalty(c: Ctx, a: Extract<Active, { k: 'attempt' }>, why: string) {
  const r = c.s.round!;
  r.active = null;
  emit(c, 'ATTEMPT_CANCELLED', { seat: a.seat, why, returned: [...a.flipped] });
  if (a.finishTry) { endRound(c, a.finishTry.finisher, 'letWin'); return; }
  advance(c);
}

// ---------- removing a player (§10.4) ----------
function removeFromMatch(c: Ctx, id: SeatId) {
  const s = c.s;
  const r = s.round;
  s.players = s.players.filter((x) => x !== id);
  delete s.scores[id];
  if (s.phase === 'START_ROLL' && s.roll) {
    s.roll.rollers = s.roll.rollers.filter((x) => x !== id);
    delete s.roll.pending[id];
  }
  if (r && (s.phase === 'PEEK' || s.phase === 'PLAY' || s.phase === 'ROUND_END')) {
    // Their cards go to the bottom of the deck.
    for (const sl of r.areas[id] ?? []) if (sl.card) { r.deck.push(sl.card); sl.card = null; }
    const a = r.active;
    if (a?.k === 'attempt' && a.seat === id) { r.active = null; emit(c, 'ATTEMPT_CANCELLED', { seat: id, why: 'removed', returned: [...a.flipped] }); }
    if (a?.k === 'power' && a.owner === id) { r.active = null; emit(c, 'POWER_LOST', { owner: id }); }
    r.queue = r.queue.filter((q) => (q.k === 'claim' ? q.seat !== id : q.owner !== id));
    if (r.drawn && r.current === id) { r.deck.push(r.drawn); r.drawn = null; }
    const wasCurrent = r.current === id;
    const remaining = r.participants.filter((x) => x !== id);
    if (wasCurrent && remaining.length) r.current = nextInOrder(remaining, id);
    if (r.window && r.window.turnPlayer === id && remaining.length) r.window.turnPlayer = r.current;
    r.participants = remaining;
    delete r.areas[id];
    delete r.peek[id];
    r.nextReady = r.nextReady.filter((x) => x !== id);
    if (a?.k === 'finish') {
      r.active = null;
      if (a.turnPlayer === id) { endRound(c, a.finisher, 'letWin'); }        // a pending finish choice counts as "Let X win"
      else if (a.finisher === id) { endRound(c, null, 'removed'); }
    }
  }
  s.seats[id] = null;
  emit(c, 'PLAYER_REMOVED', { seat: id });
  if (s.players.length < 2 && s.phase !== 'LOBBY' && s.phase !== 'MATCH_END') {
    s.phase = 'MATCH_END'; s.endedBy = 'players'; s.matchWinner = null;
    emit(c, 'MATCH_END', { winner: null, scores: { ...s.scores }, endedBy: 'players' });
    return;
  }
  if (s.phase === 'START_ROLL') checkRollDone(c);
  else if (s.phase === 'PEEK') checkPeekDone(c);
  else if (s.phase === 'PLAY') advance(c);
  else if (s.phase === 'ROUND_END') maybeFinishRoundEndReady(c);
}

function checkRollDone(c: Ctx) {
  const s = c.s, roll = s.roll!;
  if (!roll.rollers.every((id) => roll.pending[id] !== undefined)) return;
  const rolls = { ...roll.pending };
  roll.history.push(rolls);
  const max = Math.max(...roll.rollers.map((id) => rolls[id]!));
  const tied = roll.rollers.filter((id) => rolls[id] === max);
  if (tied.length > 1) {
    roll.rollers = tied; roll.pending = {};
    emit(c, 'DICE_ROLLED', { rolls, tied });
    return;
  }
  emit(c, 'DICE_ROLLED', { rolls, starter: tied[0] });
  s.roll = { ...roll, rollers: [], pending: {} };
  startRound(c, tied[0]!, 'dice');
}

function checkPeekDone(c: Ctx) {
  const s = c.s, r = s.round!;
  if (!r.participants.every((id) => r.peek[id]!.done)) return;
  s.phase = 'PLAY';
  r.current = r.participants.includes(r.current) ? r.current : nextInOrder(r.participants, r.current);
  emit(c, 'PLAY_START', { current: r.current });
}

// ---------- test-room helpers (§17.3) ----------
/** Moves the card with this face (from wherever it is) into the given slot by swapping, so the 52-card invariant holds. */
export function testPutCard(r: RoundState, slotIdStr: string, faceStr0: string) {
  const pf = parseFace(faceStr0) ?? fail('BAD_CARD');
  const target = findSlot(r, slotIdStr) ?? fail('BAD_SLOT');
  const match = (cd: Card | null) => !!cd && cd.r === pf.r && (!pf.s || cd.s === pf.s);
  if (match(target.slot.card)) return;
  for (const sl of allSlots(r)) if (sl !== target.slot && match(sl.card) && !(pf.s === null && sl.card === target.slot.card)) {
    [sl.card, target.slot.card] = [target.slot.card, sl.card]; return;
  }
  for (const list of [r.deck, r.discard]) {
    const i = list.findIndex(match);
    if (i >= 0) { const old = target.slot.card; target.slot.card = list[i]!; if (old) list[i] = old; else list.splice(i, 1); return; }
  }
  fail('CARD_NOT_AVAILABLE');
}
function testDeckTop(r: RoundState, cards: string[]) {
  const top: Card[] = [];
  for (const f of cards) {
    const pf = parseFace(f) ?? fail('BAD_CARD');
    const i = r.deck.findIndex((d) => d.r === pf.r && (!pf.s || d.s === pf.s));
    if (i < 0) fail('CARD_NOT_IN_DECK');
    top.push(r.deck.splice(i, 1)[0]!);
  }
  r.deck.unshift(...top);
}
function applyPreset(c: Ctx, id: string) {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return;
  const r = c.s.round!;
  const order = [r.starter, ...r.participants.filter((x) => x !== r.starter)];
  // Hands first, then the deck top (so deck cards can't be stolen by later hand edits).
  p.hands?.forEach((cards, rel) => {
    const seatId = order[rel]; if (seatId === undefined) return;
    if (cards.length < r.areas[seatId]!.length) {
      // trim extra slots (test convenience): move surplus cards to the deck bottom and leave gaps
      for (const sl of r.areas[seatId]!.slice(cards.length)) { if (sl.card) r.deck.push(sl.card); sl.card = null; }
    }
    cards.forEach((f, i) => { const sl = r.areas[seatId]![i]; if (sl) testPutCard(r, sl.id, f); });
  });
  if (p.deckTop) testDeckTop(r, p.deckTop);
  if (p.deckCount !== undefined) { const moved = r.deck.splice(p.deckCount); for (const cd of moved) { r.discard.push(cd); seePublic(r, cd); } }
  emit(c, 'TEST_PRESET_APPLIED', { id });
}

// ---------- the reducer ----------
const GAME_INTENTS = new Set(['ROLL_DIE', 'PEEK_PICK', 'PEEK_DONE', 'DRAW', 'THROW', 'SWAP', 'CLAIM_MATCH', 'CANCEL_CLAIM', 'FLIP', 'REMOVE_TENTATIVE',
  'GIVE_UP', 'FINISH_TRY', 'FINISH_LET_WIN', 'JACK_SWAP', 'JACK_SKIP', 'QUEEN_PEEK', 'QUEEN_DONE', 'QUEEN_SKIP', 'TEN_GIVE']);

export function reduce(state: GameState, actor: Actor, intent: Intent, rng: Rng): ReduceResult {
  const c: Ctx = { s: JSON.parse(JSON.stringify(state)) as GameState, ev: [], rng };
  try {
    apply(c, actor, intent);
    return { ok: true, state: c.s, events: c.ev };
  } catch (e) {
    if (e instanceof Reject) return { ok: false, reason: e.reason };
    throw e;
  }
}

function apply(c: Ctx, actor: Actor, it: Intent) {
  const s = c.s;
  if (actor === 'sys') return applySys(c, it);
  const me = actor;
  const si = seat(s, me);
  if (GAME_INTENTS.has(it.t) && isPaused(s)) fail('PAUSED');
  const isHost = s.host === me;
  const r = s.round;
  switch (it.t) {
    // ----- lobby -----
    case 'PICK_CHARACTER': check(typeof it.id === 'string' && it.id.length <= 40, 'BAD_CHARACTER'); si.characterId = it.id; emit(c, '_SEAT', { seat: me }); return;
    case 'SET_NAME': check(s.phase === 'LOBBY', 'NOT_LOBBY'); si.name = cleanName(it.name); emit(c, '_SEAT', { seat: me }); return;
    case 'SET_READY': check(s.phase === 'LOBBY', 'NOT_LOBBY'); si.ready = !!it.ready; emit(c, '_SEAT', { seat: me }); return;
    case 'HOST_UPDATE_SETTINGS': {
      check(isHost, 'NOT_HOST'); check(s.phase === 'LOBBY' || s.phase === 'MATCH_END', 'MATCH_RUNNING');
      const p = it.patch ?? {};
      const ns = { ...s.settings };
      if (p.maxPlayers !== undefined) { check(Number.isInteger(p.maxPlayers) && p.maxPlayers >= 2 && p.maxPlayers <= 4 && p.maxPlayers >= seatedIds(s).length, 'BAD_MAX_PLAYERS'); ns.maxPlayers = p.maxPlayers; }
      if (p.cardsPerPlayer !== undefined) { check(Number.isInteger(p.cardsPerPlayer) && p.cardsPerPlayer >= 4 && p.cardsPerPlayer <= 8, 'BAD_CARDS'); ns.cardsPerPlayer = p.cardsPerPlayer; }
      if (p.targetPoints !== undefined) { check(Number.isInteger(p.targetPoints) && p.targetPoints >= 1 && p.targetPoints <= 21, 'BAD_TARGET'); ns.targetPoints = p.targetPoints; }
      if (p.memoryHelper !== undefined) { check(['off', 'own', 'full'].includes(p.memoryHelper), 'BAD_HELPER'); ns.memoryHelper = p.memoryHelper; }
      if (p.botSpeed !== undefined) { check(['slow', 'normal', 'fast', 'instant'].includes(p.botSpeed), 'BAD_SPEED'); ns.botSpeed = p.botSpeed; }
      if (p.freeText !== undefined) ns.freeText = !!p.freeText;
      if (p.voiceNotes !== undefined) ns.voiceNotes = !!p.voiceNotes;
      if (p.locked !== undefined) ns.locked = !!p.locked;
      check(p.test === undefined || p.test === s.settings.test, 'TEST_FLAG_FIXED');
      s.settings = ns;
      emit(c, '_SETTINGS', {});
      return;
    }
    case 'HOST_LOCK': check(isHost, 'NOT_HOST'); s.settings.locked = !!it.locked; emit(c, '_SETTINGS', {}); return;
    case 'HOST_SEAT_MOVE': {
      check(isHost, 'NOT_HOST'); check(s.phase === 'LOBBY', 'NOT_LOBBY');
      check(validSeat(it.from) && validSeat(it.to) && s.seats[it.from], 'BAD_SEAT');
      [s.seats[it.from], s.seats[it.to]] = [s.seats[it.to]!, s.seats[it.from]!];
      if (s.host === it.from) s.host = it.to; else if (s.host === it.to) s.host = it.from;
      emit(c, 'SEATS_MOVED', { from: it.from, to: it.to });
      return;
    }
    case 'HOST_SHUFFLE_SEATS': {
      check(isHost, 'NOT_HOST'); check(s.phase === 'LOBBY', 'NOT_LOBBY');
      const perm = shuffle(c.rng, [0, 1, 2, 3]);
      const old = [...s.seats];
      const map: Record<number, number> = {};
      perm.forEach((from, to) => { s.seats[to] = old[from]!; map[from] = to; });
      if (s.host !== null) s.host = map[s.host]!;
      emit(c, 'SEATS_SHUFFLED', { map });
      return;
    }
    case 'HOST_KICK': {
      check(isHost, 'NOT_HOST'); check(it.seat !== me && s.seats[it.seat], 'BAD_SEAT');
      if (s.phase === 'LOBBY' || s.phase === 'MATCH_END') { s.seats[it.seat] = null; emit(c, 'KICKED', { seat: it.seat }); return; }
      fail('USE_REMOVE_PLAYER');
      return;
    }
    case 'HOST_ADD_BOT': {
      check(isHost, 'NOT_HOST'); check(s.phase === 'LOBBY', 'NOT_LOBBY');
      check(['easy', 'normal', 'hard'].includes(it.level), 'BAD_LEVEL');
      const free = [0, 1, 2, 3].find((i) => !s.seats[i]);
      check(free !== undefined && seatedIds(s).length < s.settings.maxPlayers, 'ROOM_FULL');
      const used = new Set(s.seats.filter(Boolean).map((x) => x!.name));
      const name = it.name ? cleanName(it.name) : BOT_NAMES.find((n) => !used.has(n)) ?? 'Bot';
      s.seats[free!] = { name, characterId: it.characterId ?? CHARACTERS[(free! + 1) % CHARACTERS.length]!, lang: 'en', isBot: true, botLevel: it.level as BotLevel, ready: true, connected: true };
      emit(c, 'BOT_ADDED', { seat: free, level: it.level });
      return;
    }
    case 'HOST_REMOVE_BOT': {
      check(isHost, 'NOT_HOST'); check(s.phase === 'LOBBY' || s.phase === 'MATCH_END', 'NOT_LOBBY');
      check(s.seats[it.seat]?.isBot, 'NOT_A_BOT');
      s.seats[it.seat] = null; emit(c, 'BOT_REMOVED', { seat: it.seat });
      return;
    }
    case 'HOST_HANDOVER': check(isHost, 'NOT_HOST'); check(isHuman(s.seats[it.seat] ?? null), 'BAD_SEAT'); s.host = it.seat; emit(c, 'HOST_CHANGED', { host: it.seat }); return;
    case 'TAKE_OVER_HOST': {
      const h = s.host === null ? null : s.seats[s.host];
      check(!h || !h.connected || h.left, 'HOST_PRESENT'); check(si.connected && !si.isBot, 'BAD_SEAT');
      s.host = me; emit(c, 'HOST_CHANGED', { host: me });
      return;
    }
    case 'START': {
      check(isHost, 'NOT_HOST'); check(s.phase === 'LOBBY', 'NOT_LOBBY');
      const ids = seatedIds(s);
      check(ids.length >= 2, 'NEED_2_PLAYERS');
      check(ids.every((id) => id === me || s.seats[id]!.ready), 'NOT_READY');
      startMatch(c);
      return;
    }
    case 'LEAVE_GAME': {
      if (s.phase === 'LOBBY' || s.phase === 'MATCH_END') {
        s.seats[me] = null;
        emit(c, 'LEFT', { seat: me });
        if (s.host === me) { const h = seatedIds(s).find((id) => isHuman(s.seats[id]!)); s.host = h ?? null; emit(c, 'HOST_CHANGED', { host: s.host }); }
        return;
      }
      si.left = true; si.connected = false;
      emit(c, 'LEFT', { seat: me });
      if (s.players.every((id) => !isHuman(s.seats[id] ?? null) || s.seats[id]!.left)) {
        s.phase = 'MATCH_END'; s.endedBy = 'players'; s.matchWinner = null;
        emit(c, 'MATCH_END', { winner: null, scores: { ...s.scores }, endedBy: 'players' });
      }
      return;
    }
    // ----- host buttons (§10.4) -----
    case 'HOST_REPLACE_WITH_BOT': {
      check(isHost, 'NOT_HOST'); const t = s.seats[it.seat]; check(t && !t.isBot && it.seat !== me, 'BAD_SEAT'); check(!t!.connected, 'SEAT_CONNECTED');
      check(s.players.includes(it.seat), 'NOT_PLAYING');
      t!.isBot = true; t!.replacedByBot = true; t!.botLevel = 'normal';
      emit(c, 'REPLACED_WITH_BOT', { seat: it.seat });
      if (r) {
        const a = r.active;
        if (a?.k === 'attempt' && a.seat === it.seat) { cancelAttemptNoPenalty(c, a, 'replaced'); return; }
        r.queue = r.queue.filter((q) => !(q.k === 'claim' && q.seat === it.seat));
      }
      if (s.phase === 'ROUND_END') maybeFinishRoundEndReady(c);
      return;
    }
    case 'HOST_HAND_BACK': {
      check(isHost, 'NOT_HOST'); const t = s.seats[it.seat]; check(t?.replacedByBot, 'BAD_SEAT'); check(t!.connected, 'SEAT_DISCONNECTED');
      t!.isBot = false; t!.replacedByBot = false; t!.left = false; delete t!.botLevel;
      emit(c, 'HANDED_BACK', { seat: it.seat });
      return;
    }
    case 'HOST_REMOVE_PLAYER': {
      check(isHost, 'NOT_HOST'); const t = s.seats[it.seat]; check(t && it.seat !== me, 'BAD_SEAT');
      check(t!.isBot || !t!.connected, 'SEAT_CONNECTED');
      if (s.phase === 'LOBBY') { s.seats[it.seat] = null; emit(c, 'PLAYER_REMOVED', { seat: it.seat }); return; }
      removeFromMatch(c, it.seat);
      return;
    }
    case 'HOST_END_GAME': {
      check(isHost, 'NOT_HOST'); check(s.phase !== 'LOBBY' && s.phase !== 'MATCH_END', 'NO_MATCH');
      if (r) { r.queue = []; r.active = null; }
      s.phase = 'MATCH_END'; s.endedBy = 'host'; s.matchWinner = null;
      emit(c, 'MATCH_END', { winner: null, scores: { ...s.scores }, endedBy: 'host' });
      return;
    }
    // ----- dice (§4.5) -----
    case 'ROLL_DIE': {
      check(s.phase === 'START_ROLL', 'NOT_ROLLING'); const roll = s.roll!;
      check(roll.rollers.includes(me), 'NOT_ROLLER'); check(roll.pending[me] === undefined, 'ALREADY_ROLLED');
      const forced = s.settings.test ? s.test.forcedDice : undefined;
      const v = forced?.length ? forced.shift()! : 1 + randInt(c.rng, 6);
      roll.pending[me] = v;
      emit(c, 'DIE_CAST', { seat: me });
      checkRollDone(c);
      return;
    }
    // ----- peek (R5, Q18) -----
    case 'PEEK_PICK': {
      check(s.phase === 'PEEK', 'NOT_PEEK'); const pk = r!.peek[me] ?? fail('NOT_PLAYING');
      check(!pk.done, 'PEEK_DONE'); check(pk.picked.length < 2, 'PEEK_LIMIT');
      const sl = r!.areas[me]!.find((x) => x.id === it.slot) ?? fail('NOT_YOUR_SLOT');
      check(sl.card, 'EMPTY_SLOT'); check(!pk.picked.includes(sl.id), 'ALREADY_PICKED');
      pk.picked.push(sl.id); know(r!, sl.card!, [me]);
      emit(c, 'PEEK_PICKED', { seat: me, slot: sl.id }, { to: me, d: { card: face(sl.card!) } });
      return;
    }
    case 'PEEK_DONE': {
      check(s.phase === 'PEEK', 'NOT_PEEK'); const pk = r!.peek[me] ?? fail('NOT_PLAYING');
      check(!pk.done, 'PEEK_DONE'); check(pk.picked.length === Math.min(2, cardCount(r!, me)), 'PICK_2');
      pk.done = true; emit(c, 'PEEK_READY', { seat: me });
      checkPeekDone(c);
      return;
    }
    case 'NEXT_ROUND': {
      check(s.phase === 'ROUND_END', 'NOT_ROUND_END'); check(r!.participants.includes(me), 'NOT_PLAYING');
      if (!r!.nextReady.includes(me)) r!.nextReady.push(me);
      emit(c, '_NEXT_READY', { seat: me });
      maybeFinishRoundEndReady(c);
      return;
    }
    case 'REMATCH': check(isHost, 'NOT_HOST'); check(s.phase === 'MATCH_END', 'NOT_MATCH_END'); check(seatedIds(s).length >= 2, 'NEED_2_PLAYERS'); startMatch(c); return;
    case 'BACK_TO_LOBBY': {
      check(isHost, 'NOT_HOST'); check(s.phase === 'MATCH_END', 'NOT_MATCH_END');
      s.phase = 'LOBBY'; s.round = null; s.roll = null; s.log = [];
      for (const x of s.seats) if (x && !x.isBot) x.ready = false;
      for (let i = 0; i < 4; i++) if (s.seats[i]?.replacedByBot && !s.seats[i]!.connected) s.seats[i] = null;
      emit(c, 'LOBBY', {});
      return;
    }
  }
  if (it.t.startsWith('TEST_')) return applyTest(c, me, it);
  // ----- play -----
  check(s.phase === 'PLAY' && r, 'NOT_PLAYING');
  const R = r!;
  check(R.participants.includes(me), 'NOT_PLAYING');
  const a = R.active;
  switch (it.t) {
    case 'DRAW': {
      check(R.current === me, 'NOT_YOUR_TURN'); check(!R.drawn, 'ALREADY_DREW');
      check(!a && !R.queue.length, a?.k === 'attempt' || R.queue.some((q) => q.k === 'claim') ? 'SOMEONE_MATCHING' : 'PENDING');
      if (R.window) { R.window = null; emit(c, 'WINDOW_CLOSED', {}); }
      const card = takeCard(c);
      if (!card) { emit(c, 'NO_CARDS', {}); endRound(c, null, 'noCards'); return; }
      R.drawn = card; know(R, card, [me]); R.turns++;
      emit(c, 'DREW', { seat: me, deckCount: R.deck.length }, { to: me, d: { card: face(card) } });
      return;
    }
    case 'THROW':
    case 'SWAP': {
      check(R.current === me && R.drawn, 'NOT_DECIDING');
      const drawn = R.drawn!;
      let out: Card;
      if (it.t === 'SWAP') {
        const sl = R.areas[me]!.find((x) => x.id === it.slot) ?? fail('NOT_YOUR_SLOT');
        check(sl.card, 'EMPTY_SLOT'); // E27
        out = sl.card!; sl.card = drawn;
        emit(c, 'SWAPPED', { seat: me, slot: sl.id, out: face(out) });
      } else {
        out = drawn;
        emit(c, 'THROWN', { seat: me, card: face(out) });
      }
      R.drawn = null;
      R.window = { target: out.r, triggerId: out.id, openIds: [out.id], turnPlayer: me }; R.windows++;
      R.current = nextInOrder(R.participants, me);
      land(c, out, me, it.t === 'SWAP' ? 'swap' : 'throw');
      emit(c, 'WINDOW_OPEN', { target: out.r, turnPlayer: me, next: R.current });
      advance(c);
      return;
    }
    case 'CLAIM_MATCH': {
      check(R.window, R.drawn ? 'TOO_LATE' : 'NO_TARGET');
      check(!(a?.k === 'finish'), 'FINISH_PENDING');
      check(!(a?.k === 'attempt' && a.seat === me), 'ALREADY_MATCHING');
      check(!R.queue.some((q) => q.k === 'claim' && q.seat === me), 'ALREADY_QUEUED');
      R.queue.push({ k: 'claim', seat: me });
      emit(c, 'CLAIM_QUEUED', { seat: me, order: R.queue.filter((q) => q.k === 'claim').map((q) => (q as { seat: number }).seat) });
      advance(c);
      return;
    }
    case 'CANCEL_CLAIM': {
      const qi = R.queue.findIndex((q) => q.k === 'claim' && q.seat === me);
      if (qi >= 0) { R.queue.splice(qi, 1); emit(c, 'CLAIM_CANCELLED', { seat: me }); return; }
      check(a?.k === 'attempt' && a.seat === me, 'NO_CLAIM');
      const at = a as Extract<Active, { k: 'attempt' }>;
      check(at.flipped.length === 0, 'ALREADY_FLIPPED'); // E15: after the first flip only Remove or Give up
      cancelAttemptNoPenalty(c, at, 'cancel');
      return;
    }
    case 'FLIP': {
      check(a?.k === 'attempt' && a.seat === me, 'NOT_MATCHING');
      const at = a as Extract<Active, { k: 'attempt' }>;
      const sl = R.areas[me]!.find((x) => x.id === it.slot) ?? fail('NOT_YOUR_SLOT');
      check(sl.card, 'EMPTY_SLOT'); check(!at.flipped.includes(sl.id), 'ALREADY_FLIPPED'); // E16
      at.flipped.push(sl.id);
      seePublic(R, sl.card!);
      const S = attemptSum(R, at), v = sl.card!.r;
      let verdict: 'tentative' | 'wrong' | 'complete';
      if (S + v === at.target) { at.tentative.push(sl.id); verdict = 'complete'; }
      else if (S + v < at.target) { at.tentative.push(sl.id); verdict = 'tentative'; }
      else { at.wrong.push(sl.id); verdict = 'wrong'; }
      emit(c, 'FLIPPED', { seat: me, slot: sl.id, card: face(sl.card!), verdict, sum: attemptSum(R, at), target: at.target, penaltyDue: at.wrong.length * PENALTY_PER_WRONG });
      if (verdict === 'complete') return completeAttempt(c, at);
      if (!unflippedLeft(R, at)) return failAttempt(c, at, 'noCards'); // auto-end (E31)
      return;
    }
    case 'REMOVE_TENTATIVE': {
      check(a?.k === 'attempt' && a.seat === me, 'NOT_MATCHING');
      const at = a as Extract<Active, { k: 'attempt' }>;
      check(at.tentative.includes(it.slot), 'NOT_TENTATIVE');
      at.tentative = at.tentative.filter((x) => x !== it.slot); at.wrong.push(it.slot);
      emit(c, 'TENTATIVE_REMOVED', { seat: me, slot: it.slot, sum: attemptSum(R, at), penaltyDue: at.wrong.length * PENALTY_PER_WRONG });
      if (!unflippedLeft(R, at)) return failAttempt(c, at, 'noCards');
      return;
    }
    case 'GIVE_UP': {
      check(a?.k === 'attempt' && a.seat === me, 'NOT_MATCHING');
      const at = a as Extract<Active, { k: 'attempt' }>;
      if (!at.flipped.length) return cancelAttemptNoPenalty(c, at, 'cancel');
      return failAttempt(c, at, 'giveUp');
    }
    case 'FINISH_TRY': {
      check(a?.k === 'finish' && a.turnPlayer === me, 'NOT_YOUR_CHOICE');
      const fin = a as Extract<Active, { k: 'finish' }>;
      R.active = { k: 'attempt', seat: me, target: R.window!.target, flipped: [], tentative: [], wrong: [], finishTry: { finisher: fin.finisher } };
      emit(c, 'FINISH_TRYING', { seat: me, finisher: fin.finisher, target: R.window!.target });
      return;
    }
    case 'FINISH_LET_WIN': {
      check(a?.k === 'finish' && a.turnPlayer === me, 'NOT_YOUR_CHOICE');
      const fin = a as Extract<Active, { k: 'finish' }>;
      emit(c, 'FINISH_LET', { seat: me, finisher: fin.finisher });
      endRound(c, fin.finisher, 'letWin');
      return;
    }
    case 'JACK_SWAP': {
      check(a?.k === 'power' && a.owner === me && a.power === 'J', 'NO_JACK');
      check(it.a !== it.b, 'SAME_SLOT');
      const A = findSlot(R, it.a), B = findSlot(R, it.b);
      check(A && B && A.slot.card && B.slot.card, 'BAD_SLOT');
      [A!.slot.card, B!.slot.card] = [B!.slot.card, A!.slot.card];
      R.active = null; st(c, me).jackSwaps++;
      emit(c, 'JACK_SWAPPED', { owner: me, a: it.a, b: it.b, ownerA: A!.owner, ownerB: B!.owner });
      advance(c);
      return;
    }
    case 'JACK_SKIP': check(a?.k === 'power' && a.owner === me && a.power === 'J', 'NO_JACK'); R.active = null; emit(c, 'POWER_SKIPPED', { owner: me, power: 'J' }); advance(c); return;
    case 'QUEEN_PEEK': {
      check(a?.k === 'power' && a.owner === me && a.power === 'Q', 'NO_QUEEN');
      const q = a as Extract<Active, { k: 'power' }>;
      check(!q.peekSlot, 'ALREADY_PEEKED');
      const f = findSlot(R, it.slot); check(f && f.slot.card, 'BAD_SLOT');
      q.peekSlot = it.slot; know(R, f!.slot.card!, [me]);
      emit(c, 'QUEEN_PEEKED', { owner: me, slot: it.slot }, { to: me, d: { card: face(f!.slot.card!) } });
      return;
    }
    case 'QUEEN_DONE': {
      check(a?.k === 'power' && a.owner === me && a.power === 'Q', 'NO_QUEEN');
      check((a as Extract<Active, { k: 'power' }>).peekSlot, 'NOT_PEEKED');
      R.active = null; emit(c, 'QUEEN_DONE', { owner: me }); advance(c);
      return;
    }
    case 'QUEEN_SKIP': {
      check(a?.k === 'power' && a.owner === me && a.power === 'Q', 'NO_QUEEN');
      check(!(a as Extract<Active, { k: 'power' }>).peekSlot, 'ALREADY_PEEKED');
      check(it.confirm === true, 'CONFIRM_REQUIRED'); // §6.2: "Skip your peek?" asks again
      R.active = null; emit(c, 'POWER_SKIPPED', { owner: me, power: 'Q' }); advance(c);
      return;
    }
    case 'TEN_GIVE': {
      check(a?.k === 'power' && a.owner === me && a.power === '10', 'NO_TEN');
      check(it.to !== me && R.participants.includes(it.to), 'BAD_TARGET');
      R.active = null;
      giveTen(c, me, it.to);
      advance(c);
      return;
    }
  }
  fail('UNKNOWN_INTENT');
}

function applyTest(c: Ctx, me: SeatId, it: Intent) {
  const s = c.s;
  check(s.settings.test, 'NOT_TEST_ROOM'); // E40: every TEST_* intent is rejected in a normal room
  const r = s.round;
  switch (it.t) {
    case 'TEST_REVEAL': s.test.reveal = s.test.reveal.filter((x) => x !== me); if (it.on) s.test.reveal.push(me); emit(c, '_TEST', {}); return;
    case 'TEST_FORCE_DECK': check(Array.isArray(it.cards) && it.cards.every((f) => parseFace(f)), 'BAD_CARD'); s.test.forcedDeck = it.cards.slice(0, 52); emit(c, '_TEST', {}); return;
    case 'TEST_FORCE_DICE': check(Array.isArray(it.values) && it.values.every((v) => Number.isInteger(v) && v >= 1 && v <= 6), 'BAD_DICE'); s.test.forcedDice = it.values.slice(0, 40); emit(c, '_TEST', {}); return;
    case 'TEST_PRESET': {
      const p = PRESETS.find((x) => x.id === it.id) ?? fail('BAD_PRESET');
      s.test.preset = p.id;
      if (p.dice) s.test.forcedDice = [...p.dice];
      if (p.settings) Object.assign(s.settings, p.settings);
      emit(c, '_TEST', { preset: p.id });
      return;
    }
    case 'TEST_SET_SLOT': {
      check(r && (s.phase === 'PEEK' || s.phase === 'PLAY'), 'NOT_PLAYING');
      check(!r!.active || r!.active.k !== 'attempt', 'ATTEMPT_RUNNING');
      testPutCard(r!, it.slot, it.card); emit(c, 'TEST_EDITED', { slot: it.slot }); return;
    }
    case 'TEST_SET_DECK_TOP': check(r && (s.phase === 'PEEK' || s.phase === 'PLAY'), 'NOT_PLAYING'); testDeckTop(r!, it.cards); emit(c, 'TEST_EDITED', {}); return;
  }
  fail('UNKNOWN_INTENT');
}

function applySys(c: Ctx, it: Intent) {
  const s = c.s;
  switch (it.t) {
    case 'SYS_JOIN': {
      check(validSeat(it.seat) && !s.seats[it.seat], 'SEAT_TAKEN');
      check(s.phase === 'LOBBY', 'IN_PROGRESS');
      check(seatedIds(s).length < s.settings.maxPlayers, 'ROOM_FULL');
      s.seats[it.seat] = { name: cleanName(it.name), characterId: it.characterId || 'biscuit', lang: it.lang === 'fr' ? 'fr' : 'en', isBot: false, ready: false, connected: true };
      if (s.host === null || !s.seats[s.host]) s.host = it.seat;
      emit(c, 'JOINED', { seat: it.seat });
      return;
    }
    case 'SYS_CONNECT': {
      const si = seat(s, it.seat);
      if (si.isBot && !si.replacedByBot) return;
      const was = isPaused(s);
      si.connected = !!it.connected;
      if (it.connected) si.left = false;
      emit(c, it.connected ? 'CONNECTED' : 'DISCONNECTED', { seat: it.seat });
      const now = isPaused(s);
      if (!was && now) emit(c, 'PAUSED', { seats: pausedSeats(s) });
      else if (was && !now) emit(c, 'RESUMED', {});
      else if (now) emit(c, 'PAUSED', { seats: pausedSeats(s) });
      if (!it.connected && s.phase === 'ROUND_END') maybeFinishRoundEndReady(c);
      return;
    }
    case 'SYS_SET_LANG': seat(s, it.seat).lang = it.lang === 'fr' ? 'fr' : 'en'; emit(c, '_SEAT', { seat: it.seat }); return;
  }
  fail('UNKNOWN_SYS');
}

const validSeat = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 3;
export function cleanName(n: unknown): string {
  const t = String(n ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
  return t || 'Player';
}
export type { Power };
