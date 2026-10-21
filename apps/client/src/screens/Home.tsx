// Home (§13.1): logo with a pumpkin "o" and a shuttlecock flick, the main buttons, server status and the
// friends scene in the footer.
import { useEffect, useRef, useState } from 'react';
import { t, useLang, setLang } from '../i18n';
import { serverUrl, usePrefs, setPrefs } from '../prefs';
import { FriendsScene, Pumpkin, Shuttlecock, CharacterBust, CHARACTER_IDS } from '../render/characters';
import { BackRoom } from '../render/BackRoom';
import { sfx, unlock } from '../render/sound';
import { lastLocalRoom, hasLocalRoom } from '../game/localRoom';
import { go } from '../App';

export function Logo({ small = false }: { small?: boolean }) {
  const [flick, setFlick] = useState(0);
  useEffect(() => { const id = setTimeout(() => setFlick(1), 500); return () => clearTimeout(id); }, []);
  return (
    <h1 className={`logo ${small ? 'small' : ''}`} onClick={() => { unlock(); sfx('shuttle'); setFlick((f) => f + 1); }}>
      <span className="logo-mar">Mar</span><span className="logo-liv">Liv</span><span className="logo-o"><Pumpkin w={small ? 30 : 54} /></span>
      {flick > 0 && <span key={flick} className="logo-shuttle"><Shuttlecock w={small ? 16 : 26} /></span>}
    </h1>
  );
}

export function useServerStatus() {
  const [st, setSt] = useState<'none' | 'checking' | 'on' | 'off'>(serverUrl() ? 'checking' : 'none');
  useEffect(() => {
    const u = serverUrl();
    if (!u) { setSt('none'); return; }
    let alive = true;
    fetch(u + '/api/health').then((r) => r.ok ? r.json() : Promise.reject()).then(() => alive && setSt('on')).catch(() => alive && setSt('off'));
    return () => { alive = false; };
  }, []);
  return st;
}

export function Home() {
  const lang = useLang();
  const prefs = usePrefs();
  const server = useServerStatus();
  const last = lastLocalRoom();
  const canContinue = !!last && hasLocalRoom(last);
  const nameRef = useRef<HTMLInputElement>(null);
  const [installEvt, setInstallEvt] = useState<any>(null);
  useEffect(() => { const f = (e: Event) => { e.preventDefault(); setInstallEvt(e); }; addEventListener('beforeinstallprompt', f); return () => removeEventListener('beforeinstallprompt', f); }, []);
  const online = server === 'on';
  return (
    <div className="screen home">
      <BackRoom dim />
      <div className="home-card">
        <div className="lang-switch">{(['en', 'fr'] as const).map((l) => <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</div>
        <Logo />
        <p className="tagline">{t('app.tagline')}</p>
        <div className="profile">
          <label>{t('profile.name')}<input ref={nameRef} value={prefs.name} maxLength={16} placeholder="Ammar" onChange={(e) => setPrefs({ name: e.target.value })} /></label>
          <div className="chars">{CHARACTER_IDS.map((c) => (
            <button key={c} className={`char ${prefs.characterId === c ? 'on' : ''}`} onClick={() => setPrefs({ characterId: c })} aria-label={t('char.' + c)}>
              <CharacterBust id={c} size={42} mood={prefs.characterId === c ? 'happy' : 'idle'} /><small>{t('char.' + c)}</small></button>))}</div>
        </div>
        <div className="home-buttons">
          {canContinue && <button className="act accent wide" onClick={() => go('/play/' + last)}>▶ {t('home.continue')}</button>}
          <button className="act primary wide" onClick={() => { unlock(); go('/practice'); }}>🃏 {t('home.practice')}</button>
          <div className="row-btns">
            <button className="act" disabled={!online} onClick={() => go('/create')}>{t('home.create')}</button>
            <button className="act" disabled={!online} onClick={() => go('/join')}>{t('home.join')}</button>
          </div>
          <div className={`server-status ${server}`}>
            {server === 'on' ? <>● {t('home.serverOn')}</> : server === 'checking' ? <>… </> : <><b>○ {t('home.serverOff')}</b><small>{t('home.serverOffHint')}</small></>}
          </div>
          <div className="row-btns small-btns">
            <button onClick={() => go('/howto')}>📖 {t('home.howto')}</button>
            <button onClick={() => go('/settings')}>⚙ {t('home.settings')}</button>
            <button onClick={() => go('/practice?test=1')}>🧪 {t('home.test')}</button>
            {installEvt && <button onClick={() => { installEvt.prompt(); setInstallEvt(null); }}>⬇ {t('home.install')}</button>}
          </div>
        </div>
      </div>
      <footer className="home-footer"><FriendsScene /></footer>
    </div>
  );
}
