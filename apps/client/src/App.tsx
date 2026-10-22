// Hash router + app shell. Routes: #/ · #/practice · #/play/<code> (local room) · #/join-local/<code> (second
// window of a local room) · #/create · #/join · #/r/<code> (online room) · #/howto · #/settings
import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
const Lab = lazy(() => import('./screens/Lab'));
import { useLang, t } from './i18n';
import { Home } from './screens/Home';
import { Practice } from './screens/Practice';
import { CreateRoom, JoinRoom } from './screens/Online';
import { SettingsScreen } from './screens/Settings';
import { HowTo } from './screens/HowTo';
import { Game } from './screens/Game';
import { openLocalRoom, closeLocalRoom, hasLocalRoom, forgetLocalRoom } from './game/localRoom';
import { Session } from './game/session';
import { serverUrl } from './prefs';
import { unlock } from './render/sound';

export function go(path: string) { location.hash = '#' + path; }
const subHash = (f: () => void) => { addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); };
function useRoute() {
  const h = useSyncExternalStore(subHash, () => location.hash);
  const raw = h.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path: path!, q: new URLSearchParams(qs ?? '') };
}

export function App() {
  useLang();
  const { path, q } = useRoute();
  useEffect(() => { const f = () => unlock(); addEventListener('pointerdown', f, { once: true }); return () => removeEventListener('pointerdown', f); }, []);
  useEffect(() => { scrollTo(0, 0); }, [path]);
  let m: RegExpExecArray | null;
  if ((m = /^\/play\/([A-Z0-9]{5})$/.exec(path))) return <LocalGame key={m[1]} code={m[1]!} />;
  if ((m = /^\/join-local\/([A-Z0-9]{5})$/.exec(path))) return <ChannelGame key={m[1]} code={m[1]!} tag={q.get('tag') ?? undefined} />;
  if ((m = /^\/r\/([A-Z0-9]{5})$/i.exec(path))) return <OnlineGame key={m[1]} code={m[1]!.toUpperCase()} fresh={q.get('seat') === 'new'} tag={q.get('tag') ?? undefined} />;
  if (path === '/lab') return <Suspense fallback={null}><Lab q={q} /></Suspense>;
  if (path === '/practice') return <Practice test={q.get('test') === '1'} />;
  if (path === '/create') return <CreateRoom />;
  if (path === '/join') return <JoinRoom />;
  if (path === '/howto') return <HowTo />;
  if (path === '/settings') return <SettingsScreen />;
  return <Home />;
}

function LocalGame({ code }: { code: string }) {
  const known = hasLocalRoom(code) || !!localStorage.getItem('marlivo.local.pending.' + code);
  const session = useMemo(() => (known ? openLocalRoom(code) : null), [code, known]);
  if (!session) return <div className="screen center"><p>{t('err.ROOM_NOT_FOUND')}</p><button onClick={() => go('/')}>{t('game.home')}</button></div>;
  return <Game session={session} onExit={() => {
    const v = session.view;
    if (v && (v.phase === 'MATCH_END')) forgetLocalRoom(code);
    closeLocalRoom(); go('/');
  }} />;
}

function ChannelGame({ code, tag }: { code: string; tag?: string }) {
  const session = useMemo(() => new Session(code, 'channel', 'marlivo.seat.C-' + code, { useSession: true, tag }), [code, tag]);
  useEffect(() => () => session.close(), [session]);
  return <Game session={session} onExit={() => go('/')} />;
}

function OnlineGame({ code, fresh, tag }: { code: string; fresh: boolean; tag?: string }) {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    if (!serverUrl()) return;
    const s = new Session(code, 'online', 'marlivo.seat.' + code, { useSession: fresh, tag });
    s.password = sessionStorage.getItem('marlivo.pw.' + code) ?? '';
    setSession(s);
    return () => s.close();
  }, [code, fresh, tag]);
  if (!serverUrl()) return <div className="screen center"><p>{t('err.NO_SERVER')}</p><button onClick={() => go('/')}>{t('game.home')}</button></div>;
  if (!session) return null;
  return <PasswordGate session={session}><Game session={session} onExit={() => go('/')} /></PasswordGate>;
}

function PasswordGate({ session, children }: { session: Session; children: React.ReactNode }) {
  useSyncExternalStore((f) => session.subscribe(f), () => session.version);
  const [pw, setPw] = useState('');
  const e = session.error;
  if (e && (e.code === 'PASSWORD_REQUIRED' || e.code === 'WRONG_PASSWORD' || e.code === 'TOO_MANY_TRIES')) {
    return (
      <div className="screen center"><div className="panel form">
        <h2>{t('join.password')}</h2>
        <p className="error">{t('err.' + e.code, { n: e.triesLeft ?? 0 })}</p>
        <form onSubmit={(ev) => { ev.preventDefault(); session.password = pw; sessionStorage.setItem('marlivo.pw.' + session.code, pw); session.retryHello(); }}>
          <input type="password" autoFocus value={pw} onChange={(ev) => setPw(ev.target.value)} />
          <button className="act primary wide">{t('join.go')}</button>
        </form>
        <button onClick={() => go('/')}>{t('common.back')}</button>
      </div></div>
    );
  }
  return <>{children}</>;
}
