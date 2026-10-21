// The animation director (§16): turns each server update (events + new view) into a short choreography, then
// settles on the authoritative view. The display view always ends exactly equal to the server's view; animations
// are only decoration (overrides). Backlogs fast-forward so a slow phone never falls behind the real game.
import { useEffect, useRef, useState } from 'react';
import type { CardFace, PlayerView } from '@marlivo/engine';
import type { Session, Update } from '../game/session';
import { emptyOverrides, type Overrides } from './Table';
import { rectOf, q, sprite, wait, clearFly, type Box, type Sprite } from './fly';
import { sfx } from './sound';
import { confetti } from './confetti';
import { getPrefs } from '../prefs';

type Ev = Update['events'][number];
export interface DirectorState { display: PlayerView | null; ov: Overrides; busy: boolean; banner: { text: string; kind: string; key: number } | null }
export type BannerFn = (e: Ev, view: PlayerView) => { text: string; kind: string } | null;

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

export function useDirector(session: Session | null, bannerFor: BannerFn): DirectorState {
  const [st, setSt] = useState<DirectorState>({ display: null, ov: emptyOverrides(), busy: false, banner: null });
  const ovRef = useRef<Overrides>(emptyOverrides());
  const running = useRef(false);
  const bannerRef = useRef(bannerFor); bannerRef.current = bannerFor;

  useEffect(() => {
    if (!session) return;
    let alive = true;
    let display: PlayerView | null = null;
    const set = (d: PlayerView | null, ov: Overrides, busy: boolean) => { if (alive) setSt((s) => ({ ...s, display: d, ov: { ...ov }, busy })); };
    const banner = (b: { text: string; kind: string } | null) => alive && setSt((s) => ({ ...s, banner: b ? { ...b, key: Math.random() } : null }));

    const pump = async () => {
      if (running.current) return;
      running.current = true;
      try {
        while (alive && session.updates.length) {
          const u = session.takeUpdate()!;
          const backlog = session.updates.length > 4 || document.hidden;
          if (u.snapshot || !display || backlog || !u.events.length) {
            display = u.view; ovRef.current = emptyOverrides(); set(display, ovRef.current, false);
            for (const e of u.events) { const b = bannerRef.current(e, u.view); if (b && !backlog) banner(b); }
            continue;
          }
          const prev = display;
          display = u.view;
          try { await choreograph(prev, u, (ov, busy = true) => { ovRef.current = ov; set(display, ov, busy); }, banner, () => alive, bannerRef.current); }
          catch (e) { console.warn('animation skipped', e); clearFly(); }
          ovRef.current = emptyOverrides();
          set(display, ovRef.current, false);
        }
      } finally { running.current = false; }
    };
    const unsub = session.subscribe(() => { void pump(); });
    void pump();
    return () => { alive = false; unsub(); };
  }, [session]);
  return st;
}

/** Captures the screen rect of everything that might be an animation start point, before the DOM changes. */
function snapRects(): Map<string, Box> {
  const m = new Map<string, Box>();
  document.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => { const b = rectOf(el); if (b) m.set('slot:' + el.dataset.slot, b); });
  document.querySelectorAll<HTMLElement>('[data-anchor]').forEach((el) => { const b = rectOf(el); if (b) m.set(el.dataset.anchor!, b); });
  document.querySelectorAll<HTMLElement>('[data-pile]').forEach((el) => { const b = rectOf(el); if (b) m.set('pile:' + el.dataset.pile, b); });
  return m;
}
const slotBox = (id: string) => rectOf(q(`[data-slot="${id}"]`));
const pileBox = (i: number) => rectOf(q(`[data-pile="${i}"]`)) ?? rectOf(q('[data-pile-next]'));
const deckBox = () => rectOf(q('[data-anchor="deck"]'));
const handBox = (seat: number, me: number | null) => (seat === me ? rectOf(q('[data-anchor="hand-me"]')) ?? rectOf(q('[data-anchor="handspot-me"]')) : rectOf(q(`[data-anchor="hand-${seat}"]`)) ?? rectOf(q(`[data-anchor="handspot-${seat}"]`)));
const areaBox = (seat: number) => rectOf(q(`[data-anchor="area-${seat}"]`));
const sizeLike = (b: Box, like: Box | null): Box => (like ? { ...b, w: like.w, h: like.h, rot: like.rot } : b);
const center = (b: Box | null | undefined, size: Box | null): Box | null => (b ? { x: b.x, y: b.y, w: size?.w ?? 60, h: size?.h ?? 84, rot: size?.rot ?? 0 } : null);

function findFace(v: PlayerView, id: string): CardFace | undefined {
  for (const a of Object.values(v.round?.areas ?? {})) for (const s of a) if (s.id === id) return s.face;
  return undefined;
}

async function choreograph(prev: PlayerView, u: Update, apply: (ov: Overrides, busy?: boolean) => void, banner: (b: { text: string; kind: string } | null) => void, alive: () => boolean, bannerFor: BannerFn) {
  const evs = u.events;
  const next = u.view;
  const me = next.you;
  const pre = snapRects();
  const ov = emptyOverrides();
  const landed = evs.filter((e) => e.t === 'LANDED').length;
  const pileLen = next.round?.discard.length ?? 0;
  ov.pileHide = Math.min(landed, pileLen);
  let landK = 0;
  const nextPileIndex = () => pileLen - ov.pileHide + landK++;

  // Initial overrides so the new view does not "pop" before the cards arrive.
  for (const e of evs) {
    const p = e.p as Record<string, any>;
    switch (e.t) {
      case 'DEALT': for (const id of p.order as string[]) ov.slot[id] = { hide: true }; break;
      case 'DREW': ov.hideHand[p.seat] = true; break;
      case 'SWAPPED': ov.slot[p.slot] = { hide: true }; break;
      case 'FLIPPED': if (p.verdict === 'complete' || p.verdict === 'wrong') ov.slot[p.slot] = { show: p.card, cls: p.verdict === 'wrong' ? 'wrong-flip' : 'tentative' }; else ov.slot[p.slot] = { show: 'back' }; break;
      case 'ATTEMPT_END': if (p.result === 'complete') for (const [i, id] of (p.playedSlots as string[]).entries()) ov.slot[id] = { show: (p.played as CardFace[])[i], cls: 'tentative' };
        else { const pa = prev.round?.active; if (pa?.k === 'attempt') for (const id of pa.tentative) { const f = findFace(prev, id); if (f) ov.slot[id] = { show: f, cls: 'tentative' }; } } break;
      case 'PENALTY_DEALT': for (const s of p.slots as { id: string }[]) ov.slot[s.id] = { hide: true }; break;
      case 'TEN_GIVEN': ov.slot[p.slot] = { hide: true }; break;
      case 'JACK_SWAPPED': ov.slot[p.a] = { hide: true }; ov.slot[p.b] = { hide: true }; break;
      case 'ROUND_END': for (const slots of Object.values(prev.round?.areas ?? {})) for (const s of slots) if (!s.empty && !s.face) ov.slot[s.id] = { show: 'back' }; break;
      case 'DICE_ROLLED': ov.dice = { rolling: true, values: {} }; for (const k of Object.keys(p.rolls)) ov.dice.values![Number(k)] = 1; break;
    }
  }
  apply(ov);
  await nextFrame();
  const sprites: Sprite[] = [];
  const done = () => { sprites.forEach((s) => s.remove()); sprites.length = 0; };

  for (const e of evs) {
    if (!alive()) break;
    const p = e.p as Record<string, any>;
    const pv = e.priv as Record<string, any> | undefined;
    const b = bannerFor(e, next); if (b) banner(b);
    switch (e.t) {
      case 'DICE_ROLLED': {
        sfx('dice');
        await wait(900);
        ov.dice = { values: { ...p.rolls }, rolling: false, tied: p.tied, winner: p.starter };
        apply(ov);
        await wait(p.tied ? 1400 : 1100);
        ov.dice = null; apply(ov);
        break;
      }
      case 'DEALT': {
        sfx('riffle');
        const deck = deckBox(); if (!deck) break;
        const order = p.order as string[];
        const per = Math.max(40, Math.min(110, 1600 / order.length));
        const flights: Promise<void>[] = [];
        const stacks: { s: Sprite; id: string }[] = [];
        const stackN: Record<string, number> = {};
        for (const [i, id] of order.entries()) {
          const seat = Number(id.slice(1, id.indexOf('-'))) - 1;
          const target = slotBox(id); const area = areaBox(seat);
          const k = (stackN[seat] = (stackN[seat] ?? 0) + 1);
          const stackAt = center(area, target);
          if (!stackAt) continue;
          const s = sprite({ ...deck, w: target?.w ?? deck.w, h: target?.h ?? deck.h, rot: 0 });
          sprites.push(s); stacks.push({ s, id });
          await wait(per);
          if (i % 2 === 0) sfx('slide');
          flights.push(s.move({ ...stackAt, x: stackAt.x + (Math.random() - 0.5) * 6, y: stackAt.y - k * 1.5 }, { ms: 380, lift: 50, spin: (Math.random() - 0.5) * 30 }));
        }
        await Promise.all(flights);
        await wait(200);
        // auto-arrange from the seat stack into the stable slot layout (§16.2)
        await Promise.all(stacks.map(({ s, id }, i) => (async () => {
          await wait((i % 8) * 30);
          const to = slotBox(id); if (to) await s.move(to, { ms: 320, lift: 10 });
          delete ov.slot[id]; s.remove();
        })()));
        apply(ov); done();
        break;
      }
      case 'DREW': {
        const from = deckBox(); const to = handBox(p.seat, me);
        if (from && to) {
          sfx('slide');
          const s = sprite({ ...from, w: from.w, h: from.h }, pv?.card ?? null, false); sprites.push(s);
          await s.move(to, { ms: 420, lift: 70, flipAt: pv?.card ? { up: true, at: 0.55 } : undefined });
        }
        delete ov.hideHand[p.seat]; apply(ov); done();
        break;
      }
      case 'THROWN': {
        const from = pre.get(p.seat === me ? 'hand-me' : `hand-${p.seat}`) ?? handBox(p.seat, me);
        const i = nextPileIndex();
        const to = pileBox(i);
        if (from && to) {
          const s = sprite(from, p.card, p.seat === me); sprites.push(s);
          await s.move(to, { ms: 380, lift: 90, spin: (Math.random() - 0.5) * 120, flipAt: { up: true, at: 0.3 }, bounce: true });
          sfx('slap');
        }
        ov.pileHide = Math.max(0, ov.pileHide - 1); apply(ov); done();
        break;
      }
      case 'SWAPPED': {
        const fromHand = pre.get(p.seat === me ? 'hand-me' : `hand-${p.seat}`) ?? handBox(p.seat, me);
        const slot = pre.get('slot:' + p.slot) ?? slotBox(p.slot);
        const i = nextPileIndex(); const pile = pileBox(i);
        const ps: Promise<void>[] = [];
        if (slot && pile) {
          const out = sprite(slot, p.out, false); sprites.push(out);
          ps.push((async () => { await out.move({ ...slot, y: slot.y - slot.h * 0.5 }, { ms: 180, lift: 0 }); await out.move(pile, { ms: 380, lift: 80, spin: (Math.random() - 0.5) * 100, flipAt: { up: true, at: 0.4 }, bounce: true }); sfx('slap'); })());
        }
        if (fromHand && slot) {
          const inn = sprite(fromHand, prev.round?.drawn?.face ?? null, p.seat === me && !!prev.round?.drawn?.face); sprites.push(inn);
          ps.push((async () => { await wait(160); await inn.move(slot, { ms: 420, lift: 40, flipAt: p.seat === me ? { up: false, at: 0.3 } : undefined }); sfx('slide'); delete ov.slot[p.slot]; apply(ov); })());
        }
        await Promise.all(ps);
        delete ov.slot[p.slot]; ov.pileHide = Math.max(0, ov.pileHide - 1); apply(ov); done();
        break;
      }
      case 'WINDOW_OPEN': sfx('tick'); break;
      case 'CLAIM_QUEUED': sfx('chime'); ov.pulse[p.seat] = 'claim'; apply(ov); break;
      case 'FLIPPED': {
        sfx('flip');
        if (p.verdict === 'wrong') {
          await wait(160); sfx('bonk'); await wait(560);
          delete ov.slot[p.slot]; apply(ov);
          await wait(220);
        } else if (p.verdict === 'tentative') {
          await wait(30); delete ov.slot[p.slot]; apply(ov); await wait(320);
        } else { await wait(300); }
        break;
      }
      case 'ATTEMPT_END': {
        if (p.result === 'complete') {
          for (const id of p.playedSlots as string[]) {
            const from = slotBox(id); const i = nextPileIndex(); const to = pileBox(i);
            const f = ov.slot[id]?.show;
            delete ov.slot[id]; apply(ov);
            if (from && to && f && f !== 'back') {
              const s = sprite(from, f, true); sprites.push(s);
              await s.move(to, { ms: 360, lift: 70, spin: (Math.random() - 0.5) * 90, bounce: true });
              sfx('slap');
              ov.pileHide = Math.max(0, ov.pileHide - 1); apply(ov);
            } else { ov.pileHide = Math.max(0, ov.pileHide - 1); }
          }
          if (!(p.penalty > 0)) sfx('chime');
          done();
        } else {
          for (const id of Object.keys(ov.slot)) if (ov.slot[id]?.cls === 'tentative') delete ov.slot[id];
          apply(ov); sfx('flip'); await wait(300);
        }
        break;
      }
      case 'PENALTY_DEALT': {
        sfx('whoosh');
        ov.badges[p.seat] = `+${(p.slots as unknown[]).length}`; ov.moods[p.seat] = 'sad'; apply(ov);
        const deck = deckBox();
        for (const s0 of p.slots as { id: string }[]) {
          const to = slotBox(s0.id);
          if (deck && to) { const s = sprite({ ...deck, w: to.w, h: to.h }); sprites.push(s); await s.move(to, { ms: 420, lift: 60, spin: 360, bounce: true }); sfx('plop'); }
          delete ov.slot[s0.id]; apply(ov);
        }
        done();
        await wait(500); delete ov.badges[p.seat]; delete ov.moods[p.seat]; apply(ov);
        break;
      }
      case 'TEN_GIVEN': {
        sfx('whoosh');
        const deck = deckBox(); const to = slotBox(p.slot);
        if (deck && to) { const s = sprite({ ...deck, w: to.w, h: to.h }); sprites.push(s); await s.move(to, { ms: 620, lift: 25, spin: 720 }); sfx('plop'); }
        ov.moods[p.to] = 'surprised'; delete ov.slot[p.slot]; apply(ov); done();
        await wait(400); delete ov.moods[p.to]; apply(ov);
        break;
      }
      case 'JACK_SWAPPED': {
        sfx('whoosh');
        const A = pre.get('slot:' + p.a) ?? slotBox(p.a), B = pre.get('slot:' + p.b) ?? slotBox(p.b);
        const A2 = slotBox(p.a), B2 = slotBox(p.b);
        if (A && B && A2 && B2) {
          const sa = sprite(A), sb = sprite(B); sa.el.classList.add('gold-trail'); sb.el.classList.add('gold-trail'); sprites.push(sa, sb);
          await Promise.all([sa.move(sizeLike(B2, B2), { ms: 720, lift: 70 }), sb.move(sizeLike(A2, A2), { ms: 720, lift: 20 })]);
          sfx('slide');
        }
        delete ov.slot[p.a]; delete ov.slot[p.b]; apply(ov); done();
        break;
      }
      case 'QUEEN_PEEKED': {
        sfx('shh');
        ov.slot[p.slot] = { ...(ov.slot[p.slot] ?? {}), cls: 'queen-glow' }; apply(ov);
        await wait(1300); delete ov.slot[p.slot]; apply(ov);
        break;
      }
      case 'PEEK_PICKED': sfx('flip'); break;
      case 'POWER_START': sfx('stinger'); break;
      case 'RESHUFFLED': {
        sfx('riffle');
        const deck = deckBox();
        const pileRects = [...pre.entries()].filter(([k]) => k.startsWith('pile:')).map(([, v]) => v).slice(0, 8);
        if (deck) await Promise.all(pileRects.map(async (r, i) => { const s = sprite(r, null, false); sprites.push(s); await wait(i * 40); await s.move(deck, { ms: 420, lift: 40 }); }));
        done();
        break;
      }
      case 'ROUND_END': {
        const keys = Object.keys(ov.slot).filter((k) => ov.slot[k]?.show === 'back');
        const wSeat = p.winner as number | null;
        keys.sort((a, b) => (Number(a.slice(1, a.indexOf('-'))) - 1 === wSeat ? -1 : 0) - (Number(b.slice(1, b.indexOf('-'))) - 1 === wSeat ? -1 : 0));
        sfx(wSeat === null ? 'pause' : 'drum');
        for (const [i, k] of keys.entries()) { delete ov.slot[k]; if (i % 3 === 0) { apply(ov); sfx('flip'); await wait(70); } }
        apply(ov);
        if (wSeat !== null) { await wait(250); sfx(wSeat === me ? 'win' : 'chime'); if (wSeat === me) confetti(); }
        await wait(600);
        break;
      }
      case 'MATCH_END': sfx('fanfare'); if (p.winner === me && me !== null) confetti(180); await wait(400); break;
      case 'PAUSED': sfx('pause'); break;
      case 'RESUMED': sfx('back'); break;
      case 'FINISH_PENDING': sfx('stinger'); break;
      default: break;
    }
  }
  done();
  if (!getPrefs().reduced) await wait(60);
}
