// The table screen: renderer + HUD (status line, action bar, my held card, banners, pause overlay with the host's
// manual buttons, finish choice, round/match end panels, log & chat drawer, test tools). No timers anywhere (§10.4).
import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { sha256Hex, RANK_LABEL, type CardFace, type PlayerView, type Intent } from '@marlivo/engine';
import type { Session } from '../game/session';
import { Table, CardEl, NamePlate, type TableProps } from '../render/Table';
import { webglAvailable, has3dFailed, mark3dFailed } from '../render3d/webgl';
import { BackRoom } from '../render/BackRoom';
import { useDirector } from '../render/director';
import { setFlyLayer, clearFly } from '../render/fly';
import { CharacterBust, SEAT_COLORS, Pumpkin } from '../render/characters';
import { HUD_EMOTES, triggerEmote, activeEmoteFor, subscribeEmotes } from '../render3d/actors';
import { sfx, unlock } from '../render/sound';
import { t } from '../i18n';
import { usePrefs, setPrefs, SCENES } from '../prefs';
import { Lobby } from './Lobby';
import { TestPanel } from './TestPanel';

import { armed, nextStreak } from './tapGuard';
import { TAP_BOUNCE_MS } from './tapGuard';
let prevBarTap = -1e9, streak = -1e9;
function ActButton({ b }: { b: { label: string; on(): void; kind?: string; disabled?: boolean } }) {
  const born = useRef(performance.now());
  return <button className={`act ${b.kind ?? ''}`} disabled={b.disabled}
    onClick={() => { const now = performance.now(); streak = nextStreak(streak, prevBarTap, now); prevBarTap = now; if (armed(born.current, streak, now)) b.on(); }}>{b.label}</button>;
}

const SUIT_CH: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const cardStr = (c: CardFace) => RANK_LABEL[c.r] + SUIT_CH[c.s];

export function useSession(s: Session | null) {
  useSyncExternalStore((f) => (s ? s.subscribe(f) : () => {}), () => s?.version ?? 0);
  return s;
}

export function Game({ session, onExit }: { session: Session; onExit(): void }) {
  useSession(session);
  const prefs = usePrefs();
  const nameOfRef = useRef<(n: number) => string>(() => '');
  const bannerFor = useCallback((e: { t: string; p: Record<string, unknown> }, v: PlayerView) => {
    const p = e.p as Record<string, any>;
    const nm = (s: number) => (s === v.you ? t('common.you') : v.seats[s]?.name ?? '?');
    switch (e.t) {
      case 'DICE_ROLLED': return p.tied ? { text: t('dice.tie', { names: (p.tied as number[]).map(nm).join(', ') }), kind: 'dice' } : { text: p.starter === v.you ? t('dice.startsYou') : t('dice.starts', { name: nm(p.starter) }), kind: 'dice' };
      case 'ROUND_START': return p.reason === 'lastWinner' ? { text: p.starter === v.you ? t('dice.lastWinnerYou') : t('dice.lastWinner', { name: nm(p.starter) }), kind: 'round' } : { text: t('game.round', { n: p.roundNo }), kind: 'round' };
      case 'POWER_START': return { text: `${t('power.' + p.power)}!`, kind: 'power-' + p.power };
      case 'RESHUFFLED': return { text: t('toast.reshuffled'), kind: 'info' };
      default: return null;
    }
  }, []);
  const dir = useDirector(session, bannerFor);
  (window as unknown as { __ml: unknown }).__ml = session; // for the headless end-to-end checks
  const v = dir.display ?? session.view;
  const flyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setFlyLayer(flyRef.current); return () => { clearFly(); setFlyLayer(null); }; }, []);
  useEffect(() => { const f = (e: Event) => session?.toast(String((e as CustomEvent).detail)); addEventListener('marlivo-toast', f); return () => removeEventListener('marlivo-toast', f); }, [session]);
  const [drawer, setDrawer] = useState<null | 'log' | 'chat' | 'menu' | 'test'>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [swapPick, setSwapPick] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { text: string; go(): void }>(null);
  const [banner, setBanner] = useState<typeof dir.banner>(null);
  useEffect(() => { if (!dir.banner) return; setBanner(dir.banner); const id = setTimeout(() => setBanner((b) => (b?.key === dir.banner?.key ? null : b)), 1700); return () => clearTimeout(id); }, [dir.banner]);

  const me = v?.you ?? session.seat;
  const r = v?.round;
  const act = (i: Intent) => { unlock(); session.intent(i); };
  const nameOf = (s: number) => (s === me ? t('common.you') : v?.seats[s]?.name ?? '?');
  nameOfRef.current = nameOf;
  const isHost = v?.host === me;
  const a = r?.active;
  const busy = dir.busy;

  // Reset local selections whenever the situation changes.
  const sitKey = `${v?.phase}|${r?.turns}|${r?.drawn?.by}|${a?.k}|${a && 'owner' in a ? a.owner : ''}|${a?.k === 'attempt' ? a.seat : ''}`;
  useEffect(() => { setPicks([]); setSwapPick(null); }, [sitKey]);

  // Practice: ready up and start as soon as the bots are seated.
  useEffect(() => {
    if (!session.autoStart || !v || v.phase !== 'LOBBY' || v.you === null) return;
    const bots = v.seats.filter((s) => s?.isBot).length;
    if (bots < session.autoStart) return;
    session.autoStart = 0;
    session.intent({ t: 'SET_LAYOUT', layout: prefs.layout });
    session.intent({ t: 'SET_READY', ready: true });
    session.intent({ t: 'START' });
  });
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => { const f = (e: KeyboardEvent) => keyRef.current(e); addEventListener('keydown', f); return () => removeEventListener('keydown', f); }, []);
  const lastHover = useRef(0);
  const lastTap = useRef({ id: '', at: 0 });

  if (!v) return <div className="screen center"><div className="spinner" /><p>{session.error ? t('err.' + session.error.code) : t('lobby.waiting')}</p><button onClick={onExit}>{t('common.back')}</button></div>;
  if (v.phase === 'LOBBY') return <Lobby session={session} view={v} onExit={onExit} />;

  const myAreaIds = (r?.areas[me ?? -1] ?? []).filter((s) => !s.empty).map((s) => s.id);
  const allFaceDown = Object.values(r?.areas ?? {}).flat().filter((s) => !s.empty).map((s) => s.id);
  const paused = v.paused;
  const myTurn = v.phase === 'PLAY' && r?.current === me && !a;
  const iDrew = r?.drawn?.by === me && r?.drawn;
  const queued = !!r?.queue.some((q) => q.k === 'claim' && q.seat === me);
  const canClaim = v.phase === 'PLAY' && !!r?.window && a?.k !== 'finish' && (r.counts[me ?? -1] ?? 0) > 0 && !queued && !(a?.k === 'attempt' && a.seat === me) && !iDrew;

  let selectable = new Set<string>();
  const selected = new Set<string>(picks);
  const seatSelectable = new Set<number>();
  let status = '';
  const buttons: { label: string; on(): void; kind?: string; key?: string; disabled?: boolean }[] = [];

  if (!paused) {
    if (v.phase === 'START_ROLL') {
      const can = v.roll?.rollers.includes(me ?? -1) && !v.roll?.rolled.includes(me ?? -1);
      status = can ? t('status.roll') : t('status.rollWait');
      if (can) buttons.push({ label: '🎲 ' + t('game.roll'), on: () => { sfx('dice'); act({ t: 'ROLL_DIE' }); }, kind: 'primary', key: 'r' });
    } else if (v.phase === 'PEEK' && me !== null && r?.peek[me]) {
      const pk = r.peek[me]!;
      if (!pk.done) {
        status = t('status.peek');
        if (pk.count < 2) selectable = new Set((r.areas[me] ?? []).filter((s) => !s.face).map((s) => s.id));
        if (pk.count >= 2) buttons.push({ label: t('game.memorized'), on: () => act({ t: 'PEEK_DONE' }), kind: 'primary', key: 'enter' });
        else buttons.push({ label: t('game.skip'), on: () => setConfirm({ text: t('confirm.skipPeek'), go: () => act({ t: 'PEEK_DONE' }) }) });
      } else status = t('status.peekWait');
    } else if (v.phase === 'PLAY' && r) {
      if (a?.k === 'attempt') {
        if (a.seat === me) {
          status = t('status.youMatch', { t: a.target }) + ` · ${t('game.sum', { s: a.sum, t: a.target })}` + (a.penaltyDue ? ` · ${t('game.penaltyDue', { n: a.penaltyDue })}` : '');
          // v0.7: every card can be tapped: face down → flip (stays up), face up → turn back down. Nothing closes
          // on its own; only Done (exact sum) or Stop ends the attempt.
          selectable = new Set(myAreaIds);
          const exact = a.tentative.length > 0 && a.sum === a.target;
          buttons.push({ label: '✓ ' + t('game.matchDone', { s: a.sum, t: a.target }), kind: 'primary', key: 'enter', disabled: !exact, on: () => { if (exact) act({ t: 'SUBMIT_MATCH' }); } });
          buttons.push({ label: t('game.stopMatching'), kind: 'danger', key: 'g', on: () => {
            const n = a.flipped.length;
            if (!n) act({ t: 'GIVE_UP' });
            else setConfirm({ text: n === 1 ? t('confirm.giveUp_one') : t('confirm.giveUp_other', { count: n, pen: n * 2 }), go: () => act({ t: 'GIVE_UP' }) });
          } });
        } else status = t('status.matching', { name: nameOf(a.seat), t: a.target });
      } else if (a?.k === 'power') {
        if (a.owner === me) {
          if (a.power === 'J') {
            status = picks.length === 1 ? t('status.jackPick2') : t('status.jackYou');
            selectable = new Set(allFaceDown.filter((id) => !picks.includes(id) || true));
            if (picks.length === 2) buttons.push({ label: t('game.swap'), kind: 'primary', key: 'enter', on: () => act({ t: 'JACK_SWAP', a: picks[0]!, b: picks[1]! }) });
            buttons.push({ label: t('game.skip'), key: 's', on: () => act({ t: 'JACK_SKIP' }) });
          } else if (a.power === 'Q') {
            if (!a.peekSlot) { status = t('status.queenYou'); selectable = new Set(allFaceDown); buttons.push({ label: t('game.skip'), key: 's', kind: 'quiet', on: () => setConfirm({ text: t('confirm.skipQueen'), go: () => act({ t: 'QUEEN_SKIP', confirm: true }) }) }); }
            else { status = t('status.queenSeen'); buttons.push({ label: t('game.done'), kind: 'primary', key: 'enter', on: () => act({ t: 'QUEEN_DONE' }) }); }
          } else {
            status = t('status.tenYou');
            for (const s of r.participants) if (s !== me) { seatSelectable.add(s); buttons.push({ label: `→ ${nameOf(s)}`, kind: 'primary', on: () => act({ t: 'TEN_GIVE', to: s }) }); }
          }
        } else status = t('status.power', { name: nameOf(a.owner), p: t('power.' + a.power) });
      } else if (a?.k === 'finish') {
        if (a.turnPlayer === me) {
          status = t('status.finishYou', { name: nameOf(a.finisher) });
          buttons.push({ label: t('game.tryFinish'), kind: 'primary', on: () => act({ t: 'FINISH_TRY' }) });
          buttons.push({ label: t('game.letWin', { name: nameOf(a.finisher) }), on: () => act({ t: 'FINISH_LET_WIN' }) });
        } else status = t('status.finishOther', { name: nameOf(a.turnPlayer) });
      } else if (myTurn && !r.drawn) {
        status = r.window ? t('status.windowOpen', { t: r.window.target, name: t('common.you') }) + ' · ' + t('status.yourDraw') : t('status.yourDraw');
        buttons.push({ label: t('game.draw'), kind: 'primary', key: 'd', on: () => act({ t: 'DRAW' }) });
      } else if (myTurn && iDrew) {
        status = t('status.decide');
        selectable = new Set(myAreaIds);
        if (swapPick) selected.add(swapPick);
        buttons.push({ label: t('game.throw'), kind: 'primary', key: 't', on: () => act({ t: 'THROW' }) });
        if (swapPick) buttons.push({ label: `${t('game.swap')} #${r.areas[me!]?.find((s) => s.id === swapPick)?.num}`, kind: 'accent', key: 'enter', on: () => act({ t: 'SWAP', slot: swapPick }) });
      } else {
        const cur = r.current;
        status = r.drawn ? t('status.deciding', { name: nameOf(cur) }) : r.window ? t('status.windowOpen', { t: r.window.target, name: nameOf(cur) }) : t('status.waitDraw', { name: nameOf(cur) });
      }
      if (canClaim) buttons.unshift({ label: t('game.match', { n: r.window!.target }), kind: 'match', key: 'm', on: () => act({ t: 'CLAIM_MATCH' }) });
      if (queued) {
        const pos = r.queue.filter((q) => q.k === 'claim').findIndex((q) => (q as { seat: number }).seat === me);
        status = t('game.queued', { n: pos + 1 }) + ' · ' + status;
        buttons.push({ label: t('common.cancel'), on: () => act({ t: 'CANCEL_CLAIM' }) });
      }
    }
  }
  if (paused) status = t('status.paused', { names: v.pausedSeats.map(nameOf).join(', ') });

  const onSlot = (id: string, owner: number) => {
    unlock();
    if (!selectable.has(id)) return;
    // a fast double tap on one card is one tap (prevents flip+unflip or select+swap by a finger bounce)
    const now = performance.now();
    if (lastTap.current.id === id && now - lastTap.current.at < TAP_BOUNCE_MS) return;
    lastTap.current = { id, at: now };
    if (v.phase === 'PEEK') return act({ t: 'PEEK_PICK', slot: id });
    if (a?.k === 'attempt' && a.seat === me) return a.tentative.includes(id) ? act({ t: 'REMOVE_TENTATIVE', slot: id }) : act({ t: 'FLIP', slot: id });
    if (a?.k === 'power' && a.power === 'J') { setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 2 ? [p[1]!, id] : [...p, id])); sfx('tick'); return; }
    if (a?.k === 'power' && a.power === 'Q') return act({ t: 'QUEEN_PEEK', slot: id });
    if (myTurn && iDrew && owner === me) {
      if (!prefs.confirmSwap || swapPick === id) return act({ t: 'SWAP', slot: id });
      setSwapPick(id); sfx('tick');
    }
  };

  // keyboard shortcuts (§12.3)
  keyRef.current = (e) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    const b = buttons.find((x) => x.key === (k === 'enter' ? 'enter' : k));
    if (b) { e.preventDefault(); b.on(); return; }
    if (/^[1-9]$/.test(k) && me !== null) { const sl = r?.areas[me]?.find((s) => s.num === Number(k)); if (sl) onSlot(sl.id, me); }
  };

  const onHoverSlot = (id: string | null) => {
    if (!(myTurn || (a?.k === 'attempt' && a.seat === me) || (a?.k === 'power' && a.owner === me))) return;
    const now = Date.now(); if (id && now - lastHover.current < 150) return; lastHover.current = now;
    session.send({ type: 'HOVER', slot: id });
  };

  const iAmIn = me !== null && !!r?.participants.includes(me);
  const myScore = v.scores[me ?? -1] ?? 0;
  const roundEnd = v.phase === 'ROUND_END' && !busy && r?.result;
  const matchEnd = v.phase === 'MATCH_END' && !busy;

  return (
    <div className={`game ${prefs.leftHanded ? 'lefty' : ''} ${paused ? 'is-paused' : ''}`}>
      <BackRoom dim={paused} />
      <header className="topbar">
        <button className="icon" onClick={() => setDrawer('menu')} aria-label={t('game.menu')}>☰</button>
        <div className="tb-mid">
          <b>{t('game.round', { n: v.roundNo || 1 })}</b> · <span>{t('game.target', { n: v.settings.targetPoints })}</span>
          {session.test && <span className="test-pill">{t('lobby.testRoom')}</span>}
          {session.mode !== 'online' && <span className="code-pill">{session.code}</span>}
        </div>
        {session.test && <button className="icon" onClick={() => setDrawer('log')} aria-label={t('game.log')}>📜</button>}
        <button className="icon" onClick={() => setDrawer('chat')} aria-label={t('game.chat')}>💬</button>
        {session.test && <button className="icon" onClick={() => setDrawer('test')} aria-label={t('test.title')}>🧪</button>}
      </header>

      <TableSwitch view={v} ov={dir.ov} selectable={selectable} selected={selected} seatSelectable={seatSelectable} hover={session.hover} bubbles={session.bubbles}
        onSlot={onSlot} onSeat={(s) => seatSelectable.has(s) && act({ t: 'TEN_GIVE', to: s })}
        onDeck={() => { if (myTurn && !r?.drawn && !paused) act({ t: 'DRAW' }); }}
        onPile={() => { /* taps on the pile never throw: only the Throw button does (stray taps closed draws) */ }} onHoverSlot={onHoverSlot}
        onLongPressMine={() => { if (canClaim && !paused) { navigator.vibrate?.(20); act({ t: 'CLAIM_MATCH' }); } }} />

      <div className="fly-layer" ref={flyRef} />

      {/* my held card + hand (§16.3) */}
      <div className="my-hand-zone">
        {iDrew && r?.drawn?.face && !dir.ov.hideHand[me!] ? (
          <div className="my-hand">
            <CardEl face={r.drawn.face} up four={prefs.fourColor} className="held-big" data-anchor="hand-me" />
            <svg className="hand-svg" viewBox="0 0 120 80" aria-hidden><path d="M8 78 C 10 50, 26 40, 40 42 L 70 40 C 80 40, 84 48, 76 52 L 58 54 C 70 56, 96 50, 108 56 C 116 62, 112 72, 100 72 L 60 78 Z" fill="#d9a074" stroke="#8a5a3c" strokeWidth="2" /><path d="M44 52 C 52 54, 60 54, 70 52" stroke="#8a5a3c" strokeWidth="1.5" fill="none" /></svg>
            {r.drawn.face.r >= 10 && r.drawn.face.r <= 12 && <div className="power-hint">{t(r.drawn.face.r === 10 ? 'hint.tPower' : r.drawn.face.r === 11 ? 'hint.jPower' : 'hint.qPower')}</div>}
          </div>
        ) : <div className="held-spot me" data-anchor="handspot-me" />}
      </div>

      {banner && <div key={banner.key} className={`banner ${banner.kind}`}>{banner.text}</div>}

      <footer className="hud">
        <div className="me-plate">
          {me !== null && v.seats[me] && <CharacterBust id={v.seats[me]!.characterId} size={44} color={SEAT_COLORS[me]} mood={r?.result?.winner === me ? 'happy' : 'idle'} />}
          <div>
            <b>{v.seats[me ?? -1]?.name ?? ''}</b>
            <span>★ {myScore}/{v.settings.targetPoints}{iAmIn && r ? ` · 🂠 ${r.counts[me!]}` : ''}</span>
            {me !== null && (() => { const em = activeEmoteFor(me); return em ? <span className="emote-pill me">{em.icon} {em.label}</span> : null; })()}
          </div>
          {me !== null && (
            <div className="emote-bar" role="group" aria-label="Emotes">
              {HUD_EMOTES.map((em) => (
                <button key={em.kind} type="button" className="emote-btn" title={em.label} aria-label={em.label}
                  onClick={() => { sfx('tick'); triggerEmote(me, em.kind); }}>{em.icon}</button>
              ))}
            </div>
          )}
        </div>
        <div className="status-line" aria-live="polite">{status}</div>
        <div className="actions">
          {buttons.map((b) => <ActButton key={(b.key ?? '') + '|' + b.kind + '|' + b.label.replace(/[0-9]+/g, '#')} b={b} />)}
        </div>
      </footer>

      {session.toasts.length > 0 && <div className="toasts">{session.toasts.map((x) => <div key={x.id} className={`toast ${x.kind ?? ''}`}>{x.kind === 'reject' ? (t('reject.' + x.text) !== 'reject.' + x.text ? t('reject.' + x.text) : t('reject.default', { r: x.text })) : x.text}</div>)}</div>}

      {paused && <PauseOverlay view={v} isHost={isHost} nameOf={nameOf} act={act} setConfirm={setConfirm} />}
      {roundEnd && <RoundEnd view={v} me={me} nameOf={nameOf} act={act} />}
      {matchEnd && <MatchEnd view={v} me={me} nameOf={nameOf} act={act} isHost={isHost} onExit={onExit} />}
      {session.error && <div className="overlay"><div className="panel"><p>{t('err.' + session.error.code, { n: session.error.triesLeft ?? 0 })}</p><button onClick={onExit}>{t('game.home')}</button></div></div>}

      {drawer && (
        <div className="drawer-back" onClick={() => setDrawer(null)}>
          <aside className={`drawer ${drawer}`} onClick={(e) => e.stopPropagation()}>
            <button className="drawer-close" onClick={() => setDrawer(null)}>✕</button>
            {session.test && drawer === 'log' && <LogView view={v} nameOf={nameOf} />}
            {drawer === 'chat' && <ChatView session={session} nameOf={nameOf} />}
            {drawer === 'test' && <TestPanel session={session} view={v} />}
            {drawer === 'menu' && (
              <div className="menu">
                <h3>{t('game.menu')}</h3>
                <label className="row"><input type="checkbox" checked={prefs.sound} onChange={(e) => setPrefs({ sound: e.target.checked })} /> {t('settings.sound')}</label>
                {prefs.renderer === '3d' && <label className="scene-pick">{t('settings.scene')}<div className="seg">{SCENES.map((s) => <button key={s} className={(prefs.scene ?? 'golden') === s ? 'on' : ''} onClick={() => setPrefs({ scene: s })}>{t('settings.scene.' + s)}</button>)}</div></label>}
                <label className="row"><input type="checkbox" checked={prefs.camera === 'seat'} onChange={(e) => setPrefs({ camera: e.target.checked ? 'seat' : 'top' })} /> {t('settings.seat')}</label>
                <label className="row"><input type="checkbox" checked={prefs.slotNumbers} onChange={(e) => setPrefs({ slotNumbers: e.target.checked })} /> {t('settings.slotNumbers')}</label>
                <label className="row"><input type="checkbox" checked={prefs.confirmSwap} onChange={(e) => setPrefs({ confirmSwap: e.target.checked })} /> {t('settings.confirmSwap')}</label>
                {isHost && <HostTools view={v} nameOf={nameOf} act={act} setConfirm={setConfirm} />}
                <button className="wide" onClick={onExit}>{t('game.home')}</button>
                <button className="wide danger" onClick={() => setConfirm({ text: t('game.leave') + '?', go: () => { act({ t: 'LEAVE_GAME' }); session.forgetSeat(); onExit(); } })}>{t('game.leave')}</button>
              </div>
            )}
          </aside>
        </div>
      )}
      {confirm && (
        <div className="overlay"><div className="panel"><p>{confirm.text}</p><div className="row-btns">
          <button onClick={() => setConfirm(null)}>{t('common.no')}</button>
          <ActButton b={{ label: t('common.yes'), kind: 'primary', on: () => { confirm.go(); setConfirm(null); } }} />
        </div></div></div>
      )}
    </div>
  );
}

function HostTools({ view, nameOf, act, setConfirm }: { view: PlayerView; nameOf(n: number): string; act(i: Intent): void; setConfirm(c: { text: string; go(): void }): void }) {
  const humans = view.seats.map((s, i) => ({ s, i })).filter(({ s, i }) => s && i !== view.you && (view.round?.participants.includes(i) ?? view.players.includes(i)));
  return (
    <div className="host-tools">
      <h4>{t('host.title')}</h4>
      {humans.map(({ s, i }) => (
        <div key={i} className="host-row">
          <span>{nameOf(i)}{!s!.isBot && !s!.connected ? ` (${t('lobby.disconnected')})` : ''}</span>
          {!s!.isBot && <button onClick={() => act({ t: 'HOST_REPLACE_WITH_BOT', seat: i })}>{t('host.replace')}</button>}
          {s!.replacedByBot && s!.connected && <button onClick={() => act({ t: 'HOST_HAND_BACK', seat: i })}>{t('host.handBack')}</button>}
          <button className="danger" onClick={() => setConfirm({ text: `${t('host.remove')}: ${nameOf(i)}?`, go: () => act({ t: 'HOST_REMOVE_PLAYER', seat: i }) })}>{t('host.remove')}</button>
        </div>
      ))}
      <button className="wide danger" onClick={() => setConfirm({ text: t('confirm.endGame'), go: () => act({ t: 'HOST_END_GAME' }) })}>{t('game.endGame')}</button>
    </div>
  );
}

function PauseOverlay({ view, isHost, nameOf, act, setConfirm }: { view: PlayerView; isHost: boolean; nameOf(n: number): string; act(i: Intent): void; setConfirm(c: { text: string; go(): void }): void }) {
  return (
    <div className="pause-overlay">
      <div className="panel pause">
        <div className="pause-busts">{view.pausedSeats.map((s) => <CharacterBust key={s} id={view.seats[s]?.characterId ?? 'biscuit'} mood="away" size={64} color={SEAT_COLORS[s]} />)}</div>
        <h3>{t('status.paused', { names: view.pausedSeats.map(nameOf).join(', ') })}</h3>
        <p className="muted">{t('status.pausedHint')}</p>
        {isHost && view.pausedSeats.map((s) => (
          <div key={s} className="host-row">
            <b>{nameOf(s)}</b>
            <button onClick={() => act({ t: 'HOST_REPLACE_WITH_BOT', seat: s })}>{t('host.replace')}</button>
            <button className="danger" onClick={() => setConfirm({ text: `${t('host.remove')}: ${nameOf(s)}?`, go: () => act({ t: 'HOST_REMOVE_PLAYER', seat: s }) })}>{t('host.remove')}</button>
          </div>
        ))}
        {isHost && <button className="wide danger" onClick={() => setConfirm({ text: t('confirm.endGame'), go: () => act({ t: 'HOST_END_GAME' }) })}>{t('game.endGame')}</button>}
      </div>
    </div>
  );
}

function verify(r: NonNullable<PlayerView['round']>) {
  if (!r.result?.salt) return null;
  return sha256Hex(r.result.deckOrder.join(',') + '|' + r.result.salt) === r.commitment;
}

function Scores({ view, nameOf }: { view: PlayerView; nameOf(n: number): string }) {
  const seats = view.players.length ? view.players : Object.keys(view.scores).map(Number);
  return (
    <table className="scores"><tbody>
      {[...seats].sort((a, b) => (view.scores[b] ?? 0) - (view.scores[a] ?? 0)).map((s) => (
        <tr key={s}><td><CharacterBust id={view.seats[s]?.characterId ?? 'biscuit'} size={30} color={SEAT_COLORS[s]} /></td><td>{nameOf(s)}</td>
          <td className="pips">{Array.from({ length: view.settings.targetPoints }, (_, i) => <span key={i} className={i < (view.scores[s] ?? 0) ? 'on' : ''}>🎃</span>)}</td><td>{view.scores[s] ?? 0}</td></tr>
      ))}
    </tbody></table>
  );
}

function RoundEnd({ view, me, nameOf, act }: { view: PlayerView; me: number | null; nameOf(n: number): string; act(i: Intent): void }) {
  const r = view.round!;
  const w = r.result!.winner;
  const ok = verify(r);
  const ready = me !== null && r.nextReady.includes(me);
  const [open, setOpen] = useState(true);
  if (!open) return <button className="reopen-panel" onClick={() => setOpen(true)}>{t('end.scores')} ▴</button>;
  return (
    <div className="end-panel">
      <div className="panel">
        <button className="drawer-close" onClick={() => setOpen(false)}>▾</button>
        {w !== null ? <h2>{w === me ? t('end.roundYou') : t('end.round', { name: nameOf(w) })}</h2> : <h2>{t('end.noWinner')}</h2>}
        {w !== null && <p className="muted">{t('end.starts', { name: nameOf(w) })}</p>}
        <Scores view={view} nameOf={nameOf} />
        <p className={`verify ${ok ? 'ok' : 'bad'}`}>{ok === null ? '' : ok ? t('end.verified') : t('end.notVerified')}</p>
        <div className="row-btns">
          <button className="primary" disabled={ready} onClick={() => act({ t: 'NEXT_ROUND' })}>{ready ? '✓ ' + t('lobby.ready') : t('game.nextRound')}</button>
        </div>
        <p className="muted small">{r.nextReady.map(nameOf).join(', ')}</p>
      </div>
    </div>
  );
}

function MatchEnd({ view, me, nameOf, act, isHost, onExit }: { view: PlayerView; me: number | null; nameOf(n: number): string; act(i: Intent): void; isHost: boolean; onExit(): void }) {
  const w = view.matchWinner;
  const st = view.stats;
  const seats = Object.keys(st).map(Number);
  const shame = seats.length ? seats.reduce((a, b) => ((st[b]?.worstAttempt ?? 0) > (st[a]?.worstAttempt ?? 0) ? b : a)) : null;
  return (
    <div className="overlay end">
      <div className="panel match-end">
        {w !== null ? <><div className="trophy"><Pumpkin w={70} /></div><h2>{w === me ? t('end.matchYou') : t('end.match', { name: nameOf(w) })}</h2></> : <h2>{view.endedBy === 'host' ? t('end.byHost') : t('game.endGame')}</h2>}
        <Scores view={view} nameOf={nameOf} />
        <h4>{t('end.stats')}</h4>
        <table className="stats"><thead><tr><th /><th>{t('stat.rounds')}</th><th>{t('stat.longest')}</th><th>{t('stat.penalties')}</th><th>{t('stat.jacks')}</th><th>{t('stat.wrong')}</th></tr></thead>
          <tbody>{seats.map((s) => <tr key={s}><td>{nameOf(s)}</td><td>{st[s]!.roundsWon}</td><td>{st[s]!.longestCombo}</td><td>{st[s]!.penalties}</td><td>{st[s]!.jackSwaps}</td><td>{st[s]!.wrongFlips}</td></tr>)}</tbody></table>
        {shame !== null && (st[shame]?.worstAttempt ?? 0) > 0 && <p className="shame">🍫 {t('end.hall')}: <b>{nameOf(shame)}</b> (+{st[shame]!.worstAttempt})</p>}
        <div className="row-btns">
          {isHost && <button className="primary" onClick={() => act({ t: 'REMATCH' })}>{t('game.rematch')}</button>}
          {isHost && <button onClick={() => act({ t: 'BACK_TO_LOBBY' })}>{t('game.backToLobby')}</button>}
          <button onClick={onExit}>{t('game.home')}</button>
        </div>
      </div>
    </div>
  );
}

export function logLine(e: { t: string; p: Record<string, any> }, nameOf: (n: number) => string): string | null {
  const p = e.p;
  const who = p.seat !== undefined ? nameOf(p.seat) : p.owner !== undefined ? nameOf(p.owner) : '';
  switch (e.t) {
    case 'THROWN': return t('log.THROWN', { who, card: cardStr(p.card) });
    case 'SWAPPED': return t('log.SWAPPED', { who, card: cardStr(p.out) });
    case 'DREW': return t('log.DREW', { who });
    case 'FLIPPED': return t('log.FLIPPED_' + p.verdict, { who, card: cardStr(p.card) });
    case 'TENTATIVE_REMOVED': return t('log.TENTATIVE_REMOVED', { who });
    case 'ATTEMPT_END': return p.result === 'complete' ? t('log.ATTEMPT_END_complete', { who, cards: (p.played as CardFace[]).map(cardStr).join(' + ') }) : t('log.ATTEMPT_END_fail', { who });
    case 'PENALTY_DEALT': return t('log.PENALTY', { who, n: p.slots.length });
    case 'JACK_SWAPPED': return t('log.JACK_SWAPPED', { who });
    case 'QUEEN_PEEKED': return t('log.QUEEN_PEEKED', { who });
    case 'TEN_GIVEN': return t('log.TEN_GIVEN', { who, to: nameOf(p.to) });
    case 'POWER_SKIPPED': return t('log.POWER_SKIPPED', { who, p: t('power.' + p.power) });
    case 'CLAIM_QUEUED': return t('log.CLAIM_QUEUED', { who });
    case 'ROUND_END': return t('log.ROUND_END');
    case 'RESHUFFLED': return t('log.RESHUFFLED');
    case 'REPLACED_WITH_BOT': return t('log.REPLACED_WITH_BOT', { who });
    case 'PLAYER_REMOVED': return t('log.PLAYER_REMOVED');
    case 'PAUSED': return t('status.paused', { names: (p.seats as number[]).map(nameOf).join(', ') });
    default: return null;
  }
}

function LogView({ view, nameOf }: { view: PlayerView; nameOf(n: number): string }) {
  const lines = view.log.map((e) => logLine(e as { t: string; p: Record<string, any> }, nameOf)).filter(Boolean) as string[];
  return <div className="log"><h3>{t('game.log')}</h3><ol>{lines.slice(-200).reverse().map((l, i) => <li key={i}>{l}</li>)}</ol></div>;
}

const EMOTES = ['👍', '😂', '😱', '🎃', '🍫', '🏸', '🍵', '🤫'];
function ChatView({ session, nameOf }: { session: Session; nameOf(n: number): string }) {
  const [text, setText] = useState('');
  const quick = ['GG!', 'Nice!', 'Oops', '🤔', 'Allez !', 'Bien joué'];
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.scrollTo(0, 1e9); });
  const free = session.view?.settings.freeText !== false;
  return (
    <div className="chat">
      <h3>{t('game.chat')}</h3>
      <div className="chat-list" ref={list}>{session.chat.map((c, i) => <div key={i} className={c.emote ? 'emote' : ''}><b style={{ color: SEAT_COLORS[c.seat] }}>{nameOf(c.seat)}:</b> {c.text}</div>)}</div>
      <div className="emotes">{EMOTES.map((e) => <button key={e} onClick={() => session.send({ type: 'EMOTE', id: e })}>{e}</button>)}</div>
      <div className="emotes">{quick.map((e) => <button key={e} onClick={() => session.send({ type: 'CHAT', text: e })}>{e}</button>)}</div>
      {free && <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) session.send({ type: 'CHAT', text: text.trim().slice(0, 200) }); setText(''); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} /><button>➤</button>
      </form>}
    </div>
  );
}
export { NamePlate };

// ---------- 2D / 3D table switch (Settings → Table). three.js is only downloaded when 3D is chosen. ----------
const Table3D = lazy(() => import('../render3d/Table3D'));
class Boundary3D extends Component<{ onError(e: unknown): void; children: ReactNode }, { bad: boolean }> {
  state = { bad: false };
  static getDerivedStateFromError() { return { bad: true }; }
  componentDidCatch(e: unknown) { this.props.onError(e); }
  render() { return this.state.bad ? null : this.props.children; }
}
function TableSwitch(p: TableProps) {
  const prefs = usePrefs();
  const [, bump] = useState(0);
  const want3d = prefs.renderer === '3d' && webglAvailable() && !has3dFailed();
  const fail = useCallback((why: unknown) => {
    console.warn('3D table failed, falling back to 2D', why);
    mark3dFailed(); bump((n) => n + 1);
    window.dispatchEvent(new CustomEvent('marlivo-toast', { detail: t('game.fell2d') }));
  }, []);
  if (!want3d) return <Table {...p} />;
  return (
    <Boundary3D onError={fail}>
      <Suspense fallback={<div className="stage stage3d loading3d"><span className="muted">3D…</span></div>}>
        <Table3D {...p} onFail={fail} />
      </Suspense>
    </Boundary3D>
  );
}
