// The security "leak test" (§11.2 item 2, §21.1): every message to a seat must not contain a rank/suit for a card
// that seat is not entitled to see at that moment.
import { allSlots, findSlot, type GameState, type Card } from '@marlivo/engine';

const key = (c: { r: number; s: string }) => `${c.r}${c.s}`;
export function facesIn(obj: unknown, out: { r: number; s: string; path: string }[] = [], path = ''): typeof out {
  if (!obj || typeof obj !== 'object') return out;
  const o = obj as Record<string, unknown>;
  if (typeof o.r === 'number' && typeof o.s === 'string' && /^[SHDC]$/.test(o.s)) out.push({ r: o.r, s: o.s, path });
  for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object') facesIn(v, out, path + '.' + k);
  return out;
}

export function entitled(s: GameState, seat: number, withKnowledge: boolean): Set<string> {
  const r = s.round;
  const out = new Set<string>();
  if (!r) return out;
  const all: Card[] = [...r.deck, ...r.discard, ...allSlots(r).map((x) => x.card!).filter(Boolean), ...(r.drawn ? [r.drawn] : [])];
  const ended = s.phase === 'ROUND_END' || (s.phase === 'MATCH_END' && !!r.result);
  for (const c of all) {
    if (ended || r.publicSeen.includes(c.id) || (withKnowledge && r.knowledge[c.id]?.includes(seat))) out.add(key(c));
  }
  if (r.drawn && r.current === seat) out.add(key(r.drawn));
  if (s.phase === 'PEEK' && r.peek[seat] && !r.peek[seat]!.done) for (const id of r.peek[seat]!.picked) { const f = findSlot(r, id); if (f?.slot.card) out.add(key(f.slot.card)); }
  const a = r.active;
  if (a?.k === 'power' && a.power === 'Q' && a.owner === seat && a.peekSlot) { const f = findSlot(r, a.peekSlot); if (f?.slot.card) out.add(key(f.slot.card)); }
  return out;
}

export interface LeakReport { messages: number; facesChecked: number; leaks: string[] }
export function newReport(): LeakReport { return { messages: 0, facesChecked: 0, leaks: [] }; }

/** Checks one outgoing message against the authoritative state at the moment it was sent. */
export function checkMessage(rep: LeakReport, s: GameState, seat: number, msg: unknown, withKnowledge: boolean) {
  rep.messages++;
  const ok = entitled(s, seat, withKnowledge);
  for (const f of facesIn(msg)) {
    rep.facesChecked++;
    if (!ok.has(key(f))) rep.leaks.push(`seat ${seat} got ${key(f)} at ${f.path} (phase ${s.phase})`);
  }
  // Structural: a face on a slot must be exactly the card in that slot and legitimately visible to this seat now.
  const view = (msg as { view?: { round?: { areas?: Record<string, { id: string; face?: { r: number; s: string }; ghost?: { r: number; s: string } }[]> } } }).view;
  const r = s.round;
  if (view?.round?.areas && r) {
    const ended = s.phase === 'ROUND_END' || (s.phase === 'MATCH_END' && !!r.result);
    const a = r.active;
    for (const [owner, slots] of Object.entries(view.round.areas)) for (const sv of slots) {
      const real = findSlot(r, sv.id)?.slot.card;
      if (sv.face) {
        const legit = ended || (a?.k === 'attempt' && a.tentative.includes(sv.id)) ||
          (s.phase === 'PEEK' && Number(owner) === seat && !r.peek[seat]!.done && r.peek[seat]!.picked.includes(sv.id)) ||
          (a?.k === 'power' && a.power === 'Q' && a.owner === seat && a.peekSlot === sv.id);
        if (!legit || !real || key(real) !== key(sv.face)) rep.leaks.push(`seat ${seat} slot ${sv.id} face not legit`);
      }
      if (sv.ghost && (!withKnowledge || !real || !r.knowledge[real.id]?.includes(seat))) rep.leaks.push(`seat ${seat} slot ${sv.id} ghost not legit`);
    }
  }
  // No card ids ever leave the server.
  if (/"id":"c[0-9a-f]{8}"/.test(JSON.stringify(msg))) rep.leaks.push(`seat ${seat} got a card id`);
}
