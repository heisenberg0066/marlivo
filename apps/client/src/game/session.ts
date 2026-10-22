// A game session: one connection to a room (online Durable Object, local worker, or another tab), with the
// latest projected view, an ordered queue of updates for the animation director, chat and the event inspector.
import type { ClientMsg, ServerMsg, ProjectedEvent } from '@marlivo/room';
import type { Intent, PlayerView } from '@marlivo/engine';
import { LocalConn, OnlineConn, ChannelConn, type Conn } from '../net/conn';
import { getPrefs, serverUrl } from '../prefs';
import { getLang } from '../i18n';

export interface Update { seq: number; events: ProjectedEvent[]; view: PlayerView; snapshot?: boolean }
export interface ChatLine { seat: number; text: string; ts: number; emote?: boolean }

type Listener = () => void;

const SILENT_REJECTS = new Set(['ALREADY_QUEUED', 'ALREADY_MATCHING', 'ALREADY_DREW', 'ALREADY_ROLLED', 'ALREADY_PICKED', 'ALREADY_PEEKED', 'PEEK_DONE', 'PEEK_LIMIT',
  'NOT_MATCHING', 'NOT_DECIDING', 'NOT_ROLLING', 'NOT_ROLLER', 'NOT_PEEK', 'NOT_YOUR_CHOICE', 'NOT_ROUND_END', 'NOT_TENTATIVE', 'EMPTY_SLOT', 'NO_CLAIM',
  'NO_JACK', 'NO_QUEEN', 'NO_TEN', 'SAME_SLOT', 'ATTEMPT_RUNNING', 'NOT_PLAYING', 'RATE_LIMIT']);

export class Session {
  conn: Conn;
  view: PlayerView | null = null;
  seat: number | null = null;
  test = false;
  local = false;
  status: 'connecting' | 'open' | 'closed' = 'connecting';
  error: { code: string; triesLeft?: number } | null = null;
  updates: Update[] = [];
  chat: ChatLine[] = [];
  bubbles: Record<number, { text: string; at: number }> = {};
  hover: Record<number, string | null> = {};
  toasts: { id: number; text: string; kind?: string }[] = [];
  inspector: { dir: 'in' | 'out'; at: number; msg: unknown }[] = [];
  testInfo: Extract<ServerMsg, { type: 'TEST_INFO' }> | null = null;
  password = '';
  /** Practice rooms sit you down and start straight away (bots are already seated). */
  autoStart = 0;
  version = 0;
  private cseq = 0;
  private subs = new Set<Listener>();
  private lastSeq = 0;

  constructor(public code: string, public mode: 'online' | 'local' | 'channel', public tokenKey: string, opts: { port?: { post(m: unknown): void }; connId?: string; useSession?: boolean; tag?: string } = {}) {
    const store = opts.useSession ? sessionStorage : localStorage;
    this.tokenStore = store;
    this.tag = opts.tag;
    const hello = (): ClientMsg => ({ type: 'HELLO', name: (getPrefs().name || 'Player').slice(0, this.tag ? 11 : 16) + (this.tag ? ' ' + this.tag : ''), characterId: getPrefs().characterId, lang: getLang(), seatToken: store.getItem(tokenKey) ?? undefined, password: this.password || undefined, tag: this.tag });
    if (mode === 'online') this.conn = new OnlineConn(serverUrl().replace(/^http/, 'ws') + '/ws/' + code, hello);
    else if (mode === 'channel') this.conn = new ChannelConn(code, hello);
    else { const c = new LocalConn(opts.port!, opts.connId!); this.conn = c; }
    this.conn.onMessage = (m) => this.receive(m);
    this.conn.onStatus = (s) => { this.status = s; this.bump(); };
    if (mode === 'local') { this.status = 'open'; this.conn.send(hello()); }
    this.helloFn = hello;
  }
  private tokenStore: Storage;
  private tag?: string;
  helloFn: () => ClientMsg;

  subscribe(f: Listener) { this.subs.add(f); return () => this.subs.delete(f); }
  bump() { this.version++; this.subs.forEach((f) => f()); }

  private receive(m: ServerMsg) {
    this.inspector.push({ dir: 'in', at: Date.now(), msg: m });
    if (this.inspector.length > 300) this.inspector.splice(0, this.inspector.length - 300);
    switch (m.type) {
      case 'WELCOME':
        this.seat = m.seat; this.test = m.test; this.local = !!m.local; this.error = null;
        if (m.seatToken) this.tokenStore.setItem(this.tokenKey, m.seatToken);
        break;
      case 'SNAPSHOT':
        this.view = m.view; this.lastSeq = m.seq;
        this.updates.push({ seq: m.seq, events: [], view: m.view, snapshot: true });
        break;
      case 'UPDATE':
        if (this.lastSeq && m.seq > this.lastSeq + 1) this.send({ type: 'RESYNC' }); // gap → full snapshot
        this.lastSeq = m.seq;
        this.view = m.view;
        this.updates.push({ seq: m.seq, events: m.events, view: m.view });
        break;
      // Rejections that only mean "a second tap raced the first" stay silent; only ones that tell the player
      // something useful become a toast (§12: no scary codes on screen).
      case 'REJECT': if (!SILENT_REJECTS.has(m.reason)) this.toast(m.reason, 'reject'); break;
      case 'ERROR': this.error = { code: m.code, triesLeft: m.triesLeft }; if (m.code === 'IN_PROGRESS' || m.code === 'ROOM_FULL' || m.code === 'ROOM_LOCKED') this.tokenStore.removeItem(this.tokenKey); break;
      case 'CHAT': this.chat.push({ seat: m.seat, text: m.text, ts: m.ts }); this.bubbles[m.seat] = { text: m.text, at: Date.now() }; break;
      case 'EMOTE': this.chat.push({ seat: m.seat, text: m.id, ts: Date.now(), emote: true }); this.bubbles[m.seat] = { text: m.id, at: Date.now() }; break;
      case 'HOVER': this.hover[m.seat] = m.slot; break;
      case 'KICKED': this.error = { code: 'KICKED' }; this.tokenStore.removeItem(this.tokenKey); break;
      case 'ELSEWHERE': this.error = { code: 'ELSEWHERE' }; break;
      case 'TEST_INFO': this.testInfo = m; if (m.export) downloadText(`marlivo-replay-${this.code}.json`, m.export); break;
    }
    this.bump();
  }

  send(m: ClientMsg) { this.inspector.push({ dir: 'out', at: Date.now(), msg: m }); this.conn.send(m); }
  intent(i: Intent) { this.send({ type: 'INTENT', cseq: ++this.cseq, intent: i }); }
  retryHello() { this.error = null; this.send(this.helloFn()); this.bump(); }
  takeUpdate(): Update | undefined { return this.updates.shift(); }
  toast(text: string, kind?: string) {
    const id = Math.random();
    this.toasts.push({ id, text, kind });
    setTimeout(() => { this.toasts = this.toasts.filter((x) => x.id !== id); this.bump(); }, 2600);
  }
  forgetSeat() { this.tokenStore.removeItem(this.tokenKey); }
  close() { this.conn.close(); }
}

export function downloadText(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; a.click();
}
