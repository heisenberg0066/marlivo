// Hosts an offline room in a Web Worker (§17.1). The hosting tab also relays a BroadcastChannel so other tabs of
// this browser can join as extra seats (local two-window test, §17.2). The room is saved to localStorage, so a
// reload resumes exactly where you were.
import type { Settings, BotLevel } from '@marlivo/engine';
import type { RoomRecord, ServerMsg } from '@marlivo/room';
import { Session } from './session';

const LS = (code: string) => 'marlivo.local.' + code;
let worker: Worker | null = null;
let current: { code: string; session: Session; ch: BroadcastChannel } | null = null;

function newCode() { const A = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; let s = ''; for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)]; return s; }

export function hasLocalRoom(code: string) { return !!localStorage.getItem(LS(code)); }
export function lastLocalRoom(): string | null { return localStorage.getItem('marlivo.local.last'); }
export function forgetLocalRoom(code: string) { localStorage.removeItem(LS(code)); localStorage.removeItem('marlivo.seat.L-' + code); if (localStorage.getItem('marlivo.local.last') === code) localStorage.removeItem('marlivo.local.last'); }

export function createLocalRoom(settings: Partial<Settings>, bots: BotLevel[]): string {
  const code = newCode();
  localStorage.setItem('marlivo.local.pending.' + code, JSON.stringify({ settings, bots }));
  return code;
}

/** Opens (or resumes) the local room hosted in this tab and returns this tab's session. */
export function openLocalRoom(code: string): Session {
  if (current?.code === code) return current.session;
  closeLocalRoom();
  worker = new Worker(new URL('../net/local.worker.ts', import.meta.url), { type: 'module' });
  const w = worker;
  const ch = new BroadcastChannel('marlivo-local-' + code);
  const port = { post: (m: unknown) => w.postMessage(m) };
  const pending = localStorage.getItem('marlivo.local.pending.' + code);
  const saved = localStorage.getItem(LS(code));
  let session!: Session;
  w.onmessage = (e: MessageEvent) => {
    const m = e.data;
    if (m.kind === 'send') {
      if (m.connId === 'me') (session.conn as unknown as { receive(x: ServerMsg): void }).receive(m.msg);
      else ch.postMessage({ to: m.connId, msg: m.msg });
    } else if (m.kind === 'save') localStorage.setItem(LS(code), JSON.stringify(m.rec as RoomRecord));
    else if (m.kind === 'reopened' && m.connId === 'me') session.retryHello();
  };
  if (saved) w.postMessage({ kind: 'restore', rec: JSON.parse(saved) });
  else {
    const p = pending ? JSON.parse(pending) : { settings: {}, bots: ['normal'] };
    w.postMessage({ kind: 'create', code, settings: p.settings });
    localStorage.removeItem('marlivo.local.pending.' + code);
    w.postMessage({ kind: 'open', connId: 'me' });
    session = new Session(code, 'local', 'marlivo.seat.L-' + code, { port, connId: 'me' });
    w.postMessage({ kind: 'addBots', levels: p.bots });
    session.autoStart = p.settings?.test ? 0 : (p.bots as unknown[]).length;
  }
  if (saved) { w.postMessage({ kind: 'open', connId: 'me' }); session = new Session(code, 'local', 'marlivo.seat.L-' + code, { port, connId: 'me' }); }
  ch.onmessage = (e) => {
    const d = e.data;
    if (!d?.from) return;
    if (d.open) w.postMessage({ kind: 'open', connId: d.from });
    if (d.msg) w.postMessage({ kind: 'msg', connId: d.from, msg: d.msg });
    if (d.close) w.postMessage({ kind: 'close', connId: d.from });
  };
  ch.postMessage({ hostUp: true });
  localStorage.setItem('marlivo.local.last', code);
  current = { code, session, ch };
  return session;
}
export function closeLocalRoom() {
  if (!current) return;
  current.ch.close(); worker?.terminate(); worker = null; current = null;
}
