// Rule-based bots (§17.1). They only ever see their own seat's projected view (helper 'full' = what this seat
// legitimately saw), so they cannot cheat. No paid AI, no network.
import type { BotLevel, CardFace, Intent, PlayerView, Rng, SeatId, SlotView } from '@marlivo/engine';
import { randInt } from '@marlivo/engine';

interface Belief { r: number; forgotten: boolean; learnedTurn: number; checkedTurn: number }
export interface BotBrain { level: BotLevel; roundNo: number; beliefs: Record<string, Belief>; claimsThisWindow: number; windowKey: string }

export const createBrain = (level: BotLevel): BotBrain => ({ level, roundNo: -1, beliefs: {}, claimsThisWindow: 0, windowKey: '' });

const keyOf = (slot: string, f: CardFace) => `${slot}:${f.r}${f.s}`;
const turnsOf = (v: PlayerView) => v.round?.turns ?? 0;

/** Updates the bot's (possibly imperfect) memory from the legit knowledge in its view. Easy forgets and misremembers. */
function sync(view: PlayerView, brain: BotBrain, rng: Rng) {
  const r = view.round!;
  if (brain.roundNo !== r.no) { brain.roundNo = r.no; brain.beliefs = {}; }
  const turn = turnsOf(view);
  const seen = new Set<string>();
  for (const slots of Object.values(r.areas)) for (const sl of slots) {
    const f = sl.face ?? sl.ghost;
    if (!f || sl.empty) continue;
    const k = keyOf(sl.id, f);
    seen.add(k);
    let b = brain.beliefs[k];
    if (!b) {
      let rv = f.r;
      if (brain.level === 'easy' && !sl.face && rng.next() < 0.08) rv = Math.min(13, Math.max(1, rv + (rng.next() < 0.5 ? -1 : 1)));
      b = brain.beliefs[k] = { r: rv, forgotten: false, learnedTurn: turn, checkedTurn: turn };
    }
    if (sl.face) { b.r = sl.face.r; b.forgotten = false; }
    if (b.checkedTurn !== turn && !b.forgotten && brain.level !== 'hard' && !sl.face) {
      // Per-turn survival: easy ≈ 87%/turn (≈85% after 1 turn, ≈50% after 5); normal ≈ 99%/turn.
      const q = brain.level === 'easy' ? 0.87 : 0.99;
      for (let t = b.checkedTurn; t < turn && !b.forgotten; t++) if (rng.next() > q) b.forgotten = true;
      b.checkedTurn = turn;
    }
  }
  for (const k of Object.keys(brain.beliefs)) if (!seen.has(k)) delete brain.beliefs[k];
}

function believed(view: PlayerView, brain: BotBrain, sl: SlotView): number | null {
  if (sl.empty) return null;
  if (sl.face) return sl.face.r;
  if (!sl.ghost) return null;
  const b = brain.beliefs[keyOf(sl.id, sl.ghost)];
  return b && !b.forgotten ? b.r : null;
}

/** Finds own slots whose believed values sum exactly to `need`. Larger sets shed more cards (preferred). */
export function findCombo(cards: { id: string; r: number }[], need: number, maxSize: number): string[] | null {
  let best: string[] | null = null;
  const sorted = [...cards].sort((a, b) => b.r - a.r);
  const rec = (i: number, left: number, pick: string[]) => {
    if (left === 0) { if (!best || pick.length > best.length) best = [...pick]; return; }
    if (left < 0 || i >= sorted.length || pick.length >= maxSize) return;
    pick.push(sorted[i]!.id); rec(i + 1, left - sorted[i]!.r, pick); pick.pop();
    rec(i + 1, left, pick);
  };
  rec(0, need, []);
  return best;
}
const maxSizeFor = (level: BotLevel) => (level === 'hard' ? 8 : 2);

export function botDecide(view: PlayerView, brain: BotBrain, rng: Rng): Intent | null {
  const me = view.you;
  if (me === null || view.paused) return null;
  if (view.phase === 'START_ROLL') {
    const roll = view.roll!;
    return roll.rollers.includes(me) && !roll.rolled.includes(me) ? { t: 'ROLL_DIE' } : null;
  }
  const r = view.round;
  if (!r || !r.participants.includes(me)) return null;
  const mine = r.areas[me] ?? [];
  if (view.phase === 'PEEK') {
    const pk = r.peek[me]!;
    if (pk.done) return null;
    if (pk.count < Math.min(2, mine.filter((s) => !s.empty).length)) {
      const free = mine.filter((s) => !s.empty && s.why !== 'peek');
      return { t: 'PEEK_PICK', slot: free[randInt(rng, free.length)]!.id };
    }
    return { t: 'PEEK_DONE' };
  }
  if (view.phase !== 'PLAY') return null;
  sync(view, brain, rng);
  const a = r.active;
  const ownKnown = () => mine.filter((s) => !s.empty).map((s) => ({ id: s.id, r: believed(view, brain, s) })).filter((x): x is { id: string; r: number } => x.r !== null);
  const opponents = r.participants.filter((p) => p !== me);
  const leader = () => [...opponents].sort((x, y) => (view.scores[y] ?? 0) - (view.scores[x] ?? 0) || r.counts[x]! - r.counts[y]!)[0]!;
  const fewest = () => [...opponents].sort((x, y) => r.counts[x]! - r.counts[y]!)[0]!;

  if (a?.k === 'power' && a.owner === me) {
    if (a.power === 'J') {
      const occupied = Object.values(r.areas).flat().filter((s) => !s.empty);
      if (brain.level === 'easy') {
        if (rng.next() < 0.5 && occupied.length >= 2) {
          const i = randInt(rng, occupied.length); let j = randInt(rng, occupied.length - 1); if (j >= i) j++;
          return { t: 'JACK_SWAP', a: occupied[i]!.id, b: occupied[j]!.id };
        }
        return { t: 'JACK_SKIP' };
      }
      const target = brain.level === 'hard' ? leader() : fewest();
      const theirs = (r.areas[target] ?? []).filter((s) => !s.empty);
      // Give the target my known high card in exchange for one of theirs, or scramble two of theirs.
      const myKnownHigh = ownKnown().sort((x, y) => y.r - x.r)[0];
      if (myKnownHigh && myKnownHigh.r >= 9 && theirs.length) return { t: 'JACK_SWAP', a: myKnownHigh.id, b: theirs[randInt(rng, theirs.length)]!.id };
      if (theirs.length >= 2) return { t: 'JACK_SWAP', a: theirs[0]!.id, b: theirs[theirs.length - 1]!.id };
      return { t: 'JACK_SKIP' };
    }
    if (a.power === 'Q') {
      if (a.peekSlot) return { t: 'QUEEN_DONE' };
      const unknownOwn = mine.filter((s) => !s.empty && believed(view, brain, s) === null);
      if (unknownOwn.length && (brain.level !== 'hard' || unknownOwn.length > 1 || rng.next() < 0.5)) return { t: 'QUEEN_PEEK', slot: unknownOwn[randInt(rng, unknownOwn.length)]!.id };
      const l = brain.level === 'easy' ? opponents[randInt(rng, opponents.length)]! : leader();
      const theirs = (r.areas[l] ?? []).filter((s) => !s.empty);
      const pick = theirs.find((s) => !s.ghost) ?? theirs[0] ?? mine.find((s) => !s.empty)!;
      return { t: 'QUEEN_PEEK', slot: pick.id };
    }
    if (a.power === '10') {
      const to = brain.level === 'easy' ? opponents[randInt(rng, opponents.length)]! : brain.level === 'hard' ? leader() : fewest();
      return { t: 'TEN_GIVE', to };
    }
  }
  if (a?.k === 'finish') {
    if (a.turnPlayer !== me) return null;
    const known = ownKnown();
    const all = mine.filter((s) => !s.empty);
    const ok = known.length === all.length && known.reduce((x, y) => x + y.r, 0) === r.window!.target;
    return ok ? { t: 'FINISH_TRY' } : { t: 'FINISH_LET_WIN' };
  }
  if (a?.k === 'attempt' && a.seat === me) {
    const need = a.target - a.sum;
    const cands = ownKnown().filter((x) => !a.flipped.includes(x.id));
    const limit = a.finishTry || brain.level === 'hard' ? 8 : Math.max(1, 2 - a.tentative.length);
    const combo = findCombo(cands, need, limit);
    if (combo?.length) return { t: 'FLIP', slot: combo[0]! };
    if (!a.flipped.length) return { t: 'CANCEL_CLAIM' };
    if (brain.level === 'easy' && rng.next() < 0.3) {
      const un = mine.filter((s) => !s.empty && !a.flipped.includes(s.id));
      if (un.length) return { t: 'FLIP', slot: un[randInt(rng, un.length)]!.id };
    }
    return { t: 'GIVE_UP' };
  }
  if (r.drawn && r.drawn.by === me && r.drawn.face) {
    const d = r.drawn.face;
    if (d.r === 10 || d.r === 11 || d.r === 12) return { t: 'THROW' };
    if (findCombo(ownKnown(), d.r, maxSizeFor(brain.level))) return { t: 'THROW' }; // E6: throw it and match it myself
    const unknown = mine.filter((s) => !s.empty && believed(view, brain, s) === null);
    if (brain.level === 'easy' && rng.next() < 0.3) {
      const any = mine.filter((s) => !s.empty);
      return rng.next() < 0.5 ? { t: 'THROW' } : { t: 'SWAP', slot: any[randInt(rng, any.length)]!.id };
    }
    if (unknown.length) return { t: 'SWAP', slot: unknown[randInt(rng, unknown.length)]!.id };
    // All known: swap out a known high card that no combination can absorb, keeping the low one.
    const known = ownKnown().sort((x, y) => y.r - x.r);
    if (known[0] && known[0].r > d.r && brain.level !== 'easy') return { t: 'SWAP', slot: known[0].id };
    return { t: 'THROW' };
  }
  if (r.window && !(a?.k === 'attempt' && a.seat === me) && !r.queue.some((q) => q.k === 'claim' && q.seat === me)) {
    const wk = `${r.no}:${r.windows}`;
    if (brain.windowKey !== wk) { brain.windowKey = wk; brain.claimsThisWindow = 0; }
    if (brain.claimsThisWindow < 4 && findCombo(ownKnown().filter((x) => !(a?.k === 'attempt' && a.tentative.includes(x.id))), r.window.target, maxSizeFor(brain.level))) {
      brain.claimsThisWindow++;
      return { t: 'CLAIM_MATCH' };
    }
  }
  if (r.current === me && !r.drawn && !a && !r.queue.length) return { t: 'DRAW' };
  return null;
}

export const BOT_DELAYS: Record<string, [number, number]> = { slow: [2000, 4000], normal: [1000, 2000], fast: [300, 600], instant: [0, 0] };
export function botDelay(speed: string, rng: Rng): number {
  const [lo, hi] = BOT_DELAYS[speed] ?? BOT_DELAYS.normal!;
  return Math.round(lo + (hi - lo) * rng.next());
}
