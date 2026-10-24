// Hosts an offline room in a Web Worker (§17.1). The hosting tab also relays a BroadcastChannel so other tabs of
// this browser can join as extra seats (local two-window test, §17.2). The room is saved to localStorage, so a
// reload resumes exactly where you were.
import type { Settings, BotLevel } from '@marlivo/engine';
import { RoomHost, type RoomRecord, type ServerMsg } from '@marlivo/room';
import { Session } from './session';

const LS = (code: string) => 'marlivo.local.' + code;
let worker: { postMessage(m: unknown): void; terminate(): void; onmessage: ((e: MessageEvent) => void) | null } | null = null;
let current: { code: string; session: Session; ch: BroadcastChannel } | null = null;

function newCode() { const A = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; let s = ''; for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)]; return s; }

export function hasLocalRoom(code: string) { return !!localStorage.getItem(LS(code)); }
export function lastLocalRoom(): string | null { return localStorage.getItem('marlivo.local.last'); }
export function forgetLocalRoom(code: string) { localStorage.removeItem(LS(code)); localStorage.removeItem('marlivo.seat.L-' + code); if (localStorage.getItem('marlivo.local.last') === code) localStorage.removeItem('marlivo.local.last'); }

export type LocalBot = BotLevel | { level: BotLevel; characterId?: string; name?: string };
export function createLocalRoom(settings: Partial<Settings>, bots: LocalBot[]): string {
  const code = newCode();
  localStorage.setItem('marlivo.local.pending.' + code, JSON.stringify({ settings, bots }));
  return code;
}

function createInThreadWorker() {
  let host: RoomHost | null = null;
  const scheduler = {
    set: (ms: number, fn: () => void) => window.setTimeout(fn, ms),
    clear: (h: unknown) => window.clearTimeout(h as number),
    now: () => Date.now(),
  };
  const selfObj: {
    onmessage: ((e: MessageEvent) => void) | null;
    postMessage(m: unknown): void;
    terminate(): void;
  } = {
    onmessage: null,
    postMessage(raw: unknown) {
      const m = raw as Record<string, unknown>;
      window.setTimeout(() => {
        if (m.kind === 'create') {
          host?.dispose();
          const settings = (m.settings ?? {}) as Partial<Settings>;
          host = RoomHost.create(m.code as string, settings, { transport, scheduler, onChange, local: true }, { seed: settings?.test ? String(Date.now()) : 'animstep-seed-7' });
          emit({ kind: 'ready', code: m.code });
        } else if (m.kind === 'restore') {
          host?.dispose();
          const rec = m.rec as RoomRecord;
          host = new RoomHost(rec, { transport, scheduler, onChange, local: true });
          emit({ kind: 'ready', code: rec.code });
        } else if (m.kind === 'addBots') {
          for (const b of m.levels as (BotLevel | { level: BotLevel; characterId?: string; name?: string })[]) {
            if (typeof b === 'string') host?.addBot(b);
            else host?.addBot(b.level, b.characterId, b.name);
          }
        } else if (m.kind === 'open' || m.kind === 'reopen') {
          host?.open(m.connId as string);
          if (m.kind === 'reopen') emit({ kind: 'reopened', connId: m.connId });
        } else if (m.kind === 'msg') {
          host?.message(m.connId as string, m.msg as never);
        } else if (m.kind === 'close') {
          host?.close(m.connId as string);
        }
      }, 1);
    },
    terminate() {
      host?.dispose();
      host = null;
    },
  };
  const emit = (data: unknown) => {
    window.setTimeout(() => selfObj.onmessage?.({ data } as MessageEvent), 1);
  };
  const transport = {
    send: (connId: string, msg: ServerMsg) => emit({ kind: 'send', connId, msg }),
    close: (connId: string) => emit({ kind: 'closed', connId }),
  };
  let saveTimer: number | null = null;
  const onChange = (rec: RoomRecord) => {
    if (saveTimer !== null) return;
    saveTimer = window.setTimeout(() => { saveTimer = null; emit({ kind: 'save', rec }); }, 150);
  };
  return selfObj;
}

/** Opens (or resumes) the local room hosted in this tab and returns this tab's session. */
export function openLocalRoom(code: string): Session {
  if (current?.code === code) return current.session;
  closeLocalRoom();
  const isAnimStep = (() => { try { return localStorage.getItem('marlivo.animstep') === '1'; } catch { return false; } })();
  worker = isAnimStep
    ? createInThreadWorker()
    : new Worker(new URL('../net/local.worker.ts', import.meta.url), { type: 'module' });
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
