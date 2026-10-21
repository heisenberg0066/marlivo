// Room lobby (§9): seats, ready, host settings, bots, share link, two-window/test seats.
import { useState } from 'react';
import type { PlayerView, Intent, BotLevel, Settings } from '@marlivo/engine';
import type { Session } from '../game/session';
import { CharacterBust, SEAT_COLORS, CHARACTER_IDS } from '../render/characters';
import { BackRoom } from '../render/BackRoom';
import { t } from '../i18n';
import { setPrefs } from '../prefs';
import { LayoutPicker } from './LayoutPicker';

export function Lobby({ session, view, onExit }: { session: Session; view: PlayerView; onExit(): void }) {
  const me = view.you;
  const isHost = view.host === me;
  const act = (i: Intent) => session.intent(i);
  const st = view.settings;
  const [level, setLevel] = useState<BotLevel>('normal');
  const [copied, setCopied] = useState(false);
  const online = session.mode === 'online';
  const link = online ? `${location.origin}${location.pathname}#/r/${session.code}` : `${location.origin}${location.pathname}#/join-local/${session.code}`;
  const seated = view.seats.filter(Boolean).length;
  const allReady = view.seats.every((s) => !s || s.isBot || s.ready);
  const patch = (p: Partial<Settings>) => act({ t: 'HOST_UPDATE_SETTINGS', patch: p });
  const mine = me !== null ? view.seats[me] : null;
  const share = async () => {
    if (!online) { window.open(link, '_blank'); return; }
    try { if (navigator.share) await navigator.share({ title: 'MarLivo', url: link }); else { await navigator.clipboard.writeText(link); setCopied(true); } } catch { /* cancelled */ }
  };
  return (
    <div className="game lobby-screen">
      <BackRoom dim />
      <div className="lobby panel">
        <div className="lobby-head">
          <button className="icon" onClick={onExit}>←</button>
          <h2>{t('lobby.title')} {session.test && <span className="test-pill">{t('lobby.testRoom')}</span>}</h2>
        </div>
        <div className="code-box"><span>{t('lobby.code')}</span><b>{session.code}</b>
          <button onClick={share}>{copied ? t('lobby.copied') : online ? t('lobby.share') : t('home.localTwo')}</button></div>
        <ul className="seats">
          {view.seats.slice(0, st.maxPlayers).map((s, i) => (
            <li key={i} className={`seat ${s ? '' : 'free'}`} style={{ borderColor: SEAT_COLORS[i] }}>
              {s ? <>
                <CharacterBust id={s.characterId} size={46} color={SEAT_COLORS[i]} mood={!s.isBot && !s.connected ? 'away' : s.ready || s.isBot ? 'happy' : 'idle'} />
                <div className="seat-info"><b>{s.name}{i === me ? ` (${t('common.you')})` : ''}</b>
                  <small>{view.host === i ? `👑 ${t('lobby.host')} · ` : ''}{s.isBot ? `🤖 ${t('lobby.bot')} · ${t('practice.' + s.botLevel)}` : !s.connected ? t('lobby.disconnected') : s.ready ? '✓ ' + t('lobby.ready') : t('lobby.notReady')}</small></div>
                {isHost && i !== me && (s.isBot ? <button onClick={() => act({ t: 'HOST_REMOVE_BOT', seat: i })}>{t('lobby.removeBot')}</button> : <button onClick={() => act({ t: 'HOST_KICK', seat: i })}>{t('lobby.kick')}</button>)}
              </> : <span className="muted">{t('lobby.waiting')}</span>}
            </li>
          ))}
        </ul>
        {mine && (
          <div className="me-setup">
            <div className="chars">{CHARACTER_IDS.map((c) => (
              <button key={c} className={`char ${mine.characterId === c ? 'on' : ''}`} onClick={() => { setPrefs({ characterId: c }); act({ t: 'PICK_CHARACTER', id: c }); }} aria-label={t('char.' + c)}>
                <CharacterBust id={c} size={40} /><small>{t('char.' + c)}</small></button>))}</div>
            <LayoutPicker n={st.cardsPerPlayer} value={mine.layout} onPick={(id) => { setPrefs({ layout: id }); act({ t: 'SET_LAYOUT', layout: id }); }} />
            <button className={`act ${mine.ready ? '' : 'primary'}`} onClick={() => act({ t: 'SET_READY', ready: !mine.ready })}>{mine.ready ? t('lobby.notReady') : t('lobby.ready')}</button>
          </div>
        )}
        {isHost && (
          <div className="host-box">
            <h4>{t('lobby.settings')}</h4>
            <div className="grid2">
              <label>{t('practice.cards')}<select value={st.cardsPerPlayer} onChange={(e) => patch({ cardsPerPlayer: Number(e.target.value) })}>{[4, 5, 6, 7, 8].map((n) => <option key={n}>{n}</option>)}</select></label>
              <label>{t('practice.target')}<select value={st.targetPoints} onChange={(e) => patch({ targetPoints: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 7, 10].map((n) => <option key={n}>{n}</option>)}</select></label>
              <label>{t('practice.helper')}<select value={st.memoryHelper} onChange={(e) => patch({ memoryHelper: e.target.value as Settings['memoryHelper'] })}>
                <option value="off">{t('common.off')}</option><option value="own">{t('practice.helperOwn')}</option><option value="full">{t('practice.helperFull')}</option></select></label>
              <label>{t('practice.speed')}<select value={st.botSpeed} onChange={(e) => patch({ botSpeed: e.target.value as Settings['botSpeed'] })}>
                {(['slow', 'normal', 'fast', 'instant'] as const).map((x) => <option key={x} value={x}>{t(x === 'normal' ? 'practice.normal' : 'practice.' + x)}</option>)}</select></label>
            </div>
            <div className="row-btns">
              <select value={level} onChange={(e) => setLevel(e.target.value as BotLevel)}>{(['easy', 'normal', 'hard'] as const).map((l) => <option key={l} value={l}>{t('practice.' + l)}</option>)}</select>
              <button disabled={seated >= st.maxPlayers} onClick={() => act({ t: 'HOST_ADD_BOT', level })}>🤖 {t('lobby.addBot')}</button>
              <button onClick={() => act({ t: 'HOST_SHUFFLE_SEATS' })}>🔀 {t('lobby.shuffle')}</button>
              <button onClick={() => act({ t: 'HOST_LOCK', locked: !st.locked })}>{st.locked ? '🔒' : '🔓'} {t('lobby.lock')}</button>
            </div>
            {session.test && <div className="row-btns">
              <button onClick={() => window.open(online ? `${location.pathname}#/r/${session.code}?seat=new&tag=P${seated + 1}` : `${location.pathname}#/join-local/${session.code}?tag=P${seated + 1}`, '_blank')}>{t('lobby.openTestSeat')}</button>
            </div>}
            <button className="act primary wide" disabled={seated < 2 || !allReady} onClick={() => act({ t: 'START' })}>{t('lobby.start')}</button>
            {(seated < 2 || !allReady) && <p className="muted small">{t('lobby.needTwo')}</p>}
          </div>
        )}
        {!isHost && view.host !== null && !view.seats[view.host]?.connected && <button onClick={() => act({ t: 'TAKE_OVER_HOST' })}>{t('lobby.takeHost')}</button>}
      </div>
    </div>
  );
}
