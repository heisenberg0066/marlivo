// Create / join an online room (§10.1): friends key to create, optional join password, owner key for Test rooms.
import { useState } from 'react';
import { t } from '../i18n';
import { serverUrl, usePrefs, setPrefs } from '../prefs';
import { go } from '../App';
import { BackRoom } from '../render/BackRoom';
import { Logo } from './Home';

export function CreateRoom() {
  const prefs = usePrefs();
  const [pw, setPw] = useState('');
  const [test, setTest] = useState(false);
  const [cards, setCards] = useState(6);
  const [target, setTarget] = useState(5);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!serverUrl()) return setErr(t('err.NO_SERVER'));
    setBusy(true); setErr('');
    try {
      const r = await fetch(serverUrl() + '/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ friendsKey: prefs.friendsKey, ownerKey: test ? prefs.ownerKey : undefined, test, password: pw || undefined, settings: { cardsPerPlayer: cards, targetPoints: target } }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'NETWORK');
      if (pw) sessionStorage.setItem('marlivo.pw.' + j.code, pw);
      go('/r/' + j.code);
    } catch (e) { setErr(t('err.' + ((e as Error).message || 'NETWORK'))); } finally { setBusy(false); }
  };
  return (
    <div className="screen form-screen"><BackRoom dim />
      <div className="panel form">
        <div className="lobby-head"><button className="icon" onClick={() => go('/')}>←</button><Logo small /></div>
        <h2>{t('create.title')}</h2>
        <label>{t('create.friendsKey')}<input type="password" value={prefs.friendsKey} onChange={(e) => setPrefs({ friendsKey: e.target.value })} /></label>
        <p className="muted small">{t('create.friendsKeyHint')}</p>
        <label>{t('create.password')}<input value={pw} maxLength={64} onChange={(e) => setPw(e.target.value)} /></label>
        <label>{t('practice.cards')}<div className="seg">{[4, 5, 6, 7, 8].map((n) => <button key={n} className={cards === n ? 'on' : ''} onClick={() => setCards(n)}>{n}</button>)}</div></label>
        <label>{t('practice.target')}<div className="seg">{[3, 5, 7, 11].map((n) => <button key={n} className={target === n ? 'on' : ''} onClick={() => setTarget(n)}>{n}</button>)}</div></label>
        <label className="row"><input type="checkbox" checked={test} onChange={(e) => setTest(e.target.checked)} /> {t('home.test')}</label>
        {test && <label>{t('create.ownerKey')}<input type="password" value={prefs.ownerKey} onChange={(e) => setPrefs({ ownerKey: e.target.value })} /></label>}
        {err && <p className="error">{err}</p>}
        <button className="act primary wide" disabled={busy || !prefs.friendsKey} onClick={create}>{t('create.go')}</button>
      </div>
    </div>
  );
}

export function JoinRoom() {
  const [code, setCode] = useState('');
  return (
    <div className="screen form-screen"><BackRoom dim />
      <div className="panel form">
        <div className="lobby-head"><button className="icon" onClick={() => go('/')}>←</button><Logo small /></div>
        <h2>{t('join.title')}</h2>
        <label>{t('join.code')}<input className="code-input" value={code} maxLength={5} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></label>
        <button className="act primary wide" disabled={code.length !== 5} onClick={() => go('/r/' + code)}>{t('join.go')}</button>
      </div>
    </div>
  );
}
