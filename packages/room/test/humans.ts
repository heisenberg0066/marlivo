import type { SeededRng, Intent, PlayerView } from '@marlivo/engine';

/** A "random human": plays legal-looking but random moves from its own view only. */
export function randomHuman(view: PlayerView, rng: { next(): number }, mem: Map<string, number>): Intent | null {
  const me = view.you!; const r = view.round;
  // a human's own (imperfect) memory, built only from what its view showed
  if (r) for (const sl of r.areas[me] ?? []) { if (sl.empty) mem.delete(sl.id); else if (sl.face) mem.set(sl.id, sl.face.r); }
  if (r?.drawn?.by === me && r.drawn.face) mem.set('drawn', r.drawn.face.r);
  const pick = <T,>(a: T[]) => a[Math.floor(rng.next() * a.length)]!;
  if (view.phase === 'START_ROLL') return view.roll!.rollers.includes(me) && !view.roll!.rolled.includes(me) ? { t: 'ROLL_DIE' } : null;
  if (view.phase === 'ROUND_END') return r!.nextReady.includes(me) ? null : { t: 'NEXT_ROUND' };
  if (!r || !r.participants.includes(me) || view.paused) return null;
  const mine = r.areas[me]!.filter((s) => !s.empty);
  if (view.phase === 'PEEK') { const pk = r.peek[me]!; if (pk.done) return null; if (pk.count < 2) return { t: 'PEEK_PICK', slot: pick(mine.filter((s) => s.why !== 'peek')).id }; return { t: 'PEEK_DONE' }; }
  const a = r.active;
  if (a?.k === 'power' && a.owner === me) {
    const occ = Object.values(r.areas).flat().filter((s) => !s.empty);
    if (a.power === 'J') return rng.next() < 0.6 ? { t: 'JACK_SWAP', a: occ[0]!.id, b: occ[occ.length - 1]!.id } : { t: 'JACK_SKIP' };
    if (a.power === 'Q') return a.peekSlot ? { t: 'QUEEN_DONE' } : { t: 'QUEEN_PEEK', slot: pick(occ).id };
    return { t: 'TEN_GIVE', to: pick(r.participants.filter((p) => p !== me)) };
  }
  if (a?.k === 'finish') return a.turnPlayer === me ? (rng.next() < 0.5 ? { t: 'FINISH_TRY' } : { t: 'FINISH_LET_WIN' }) : null;
  if (a?.k === 'attempt' && a.seat === me) {
    const un = mine.filter((s) => !a.flipped.includes(s.id));
    if (a.tentative.length && rng.next() < 0.1) return { t: 'REMOVE_TENTATIVE', slot: a.tentative[0]! };
    const good = un.find((s) => mem.get(s.id) === a.target - a.sum);
    if (good && rng.next() < 0.9) return { t: 'FLIP', slot: good.id };
    if (!un.length || rng.next() < 0.3) return { t: 'GIVE_UP' };
    return { t: 'FLIP', slot: pick(un).id };
  }
  if (r.drawn?.by === me) { if (rng.next() < 0.5) return { t: 'THROW' }; const sl = pick(mine).id; mem.set(sl, mem.get('drawn') ?? 0); return { t: 'SWAP', slot: sl }; }
  if (a?.k === 'attempt' && a.seat !== me) return null;
  const knowsMatch = r.window && mine.some((s) => mem.get(s.id) === r.window!.target);
  if (r.window && (knowsMatch || rng.next() < 0.05) && !r.queue.some((q) => q.k === 'claim' && q.seat === me) && !(a?.k === 'attempt' && a.seat === me)) return { t: 'CLAIM_MATCH' };
  if (r.current === me && !a && !r.queue.length) return { t: 'DRAW' };
  return null;
}

