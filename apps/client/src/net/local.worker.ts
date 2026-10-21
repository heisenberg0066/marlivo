/// <reference lib="webworker" />
// The local "server" for offline practice (§17.1): the same RoomHost as the Durable Object, in a Web Worker.
import { RoomHost, type RoomRecord, type ServerMsg } from '@marlivo/room';
import type { Settings, BotLevel } from '@marlivo/engine';

let host: RoomHost | null = null;
const scheduler = { set: (ms: number, fn: () => void) => setTimeout(fn, ms), clear: (h: unknown) => clearTimeout(h as number), now: () => Date.now() };
const transport = {
  send: (connId: string, msg: ServerMsg) => postMessage({ kind: 'send', connId, msg }),
  close: (connId: string) => postMessage({ kind: 'closed', connId }),
};
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const onChange = (rec: RoomRecord) => {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; postMessage({ kind: 'save', rec }); }, 150);
};

self.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.kind === 'create') {
    host?.dispose();
    host = RoomHost.create(m.code, m.settings as Partial<Settings>, { transport, scheduler, onChange, local: true }, { seed: m.settings?.test ? String(Date.now()) : undefined });
    postMessage({ kind: 'ready', code: m.code });
  } else if (m.kind === 'restore') {
    host?.dispose();
    host = new RoomHost(m.rec as RoomRecord, { transport, scheduler, onChange, local: true });
    postMessage({ kind: 'ready', code: m.rec.code });
  } else if (m.kind === 'addBots') {
    for (const lvl of m.levels as BotLevel[]) host?.addBot(lvl);
  } else if (m.kind === 'open' || m.kind === 'reopen') {
    host?.open(m.connId);
    if (m.kind === 'reopen') postMessage({ kind: 'reopened', connId: m.connId });
  } else if (m.kind === 'msg') host?.message(m.connId, m.msg);
  else if (m.kind === 'close') host?.close(m.connId);
};
