// RoomHost: the authoritative room "server" logic, independent of transport. The Cloudflare Durable Object and the
// in-browser local host (Web Worker, offline practice) both wrap this class, so the UI code path is identical (§17.1).
import {
  createGame, reduce, projectView, projectEvent, sha256Hex, CryptoRng, SeededRng, randHex, cleanName, CHARACTERS,
  type GameState, type Intent, type Rng, type Settings, type SeatId, type BotLevel, type GameEvent,
} from '@marlivo/engine';
import { botDecide, botDelay, createBrain, type BotBrain } from '@marlivo/bots';
import type { ClientMsg, ServerMsg } from './protocol';

export interface Transport { send(connId: string, msg: ServerMsg): void; close(connId: string, code: number, reason: string): void }
export interface Scheduler { set(ms: number, fn: () => void): unknown; clear(h: unknown): void; now(): number }

export interface RoomRecord {
  code: string; state: GameState; tokens: Record<number, string>; pwHash: string | null; pwSalt: string;
  createdAt: number; lastActive: number; seq: number; seed: string | null; rngState?: number[]; actions: { a: number | 'sys'; i: Intent }[];
}

export interface HostOptions { transport: Transport; scheduler: Scheduler; onChange?: (rec: RoomRecord) => void; observe?: (seat: number | null, msg: ServerMsg | { type: 'BOT_VIEW'; view: unknown }) => void; local?: boolean }

const MAX_INTENTS_PER_SEC = 20;

export class RoomHost {
  rec: RoomRecord;
  rng: Rng;
  private botRng: Rng = new CryptoRng();
  private conns = new Map<string, { seat: number | null; tag?: string; intents: number[]; chats: number[] }>();
  private brains = new Map<number, BotBrain>();
  private botTimers = new Map<number, unknown>();
  private pwTries = new Map<string, number[]>();
  stepMode = false;

  constructor(rec: RoomRecord, private o: HostOptions) {
    this.rec = rec;
    // Engine RNG: crypto for real rooms; seeded (and persisted) in Test rooms so a game can be replayed from seed + action log.
    this.rng = rec.seed ? new SeededRng(rec.rngState ?? rec.seed) : new CryptoRng();
  }

  static create(code: string, settings: Partial<Settings>, o: HostOptions, extra: { password?: string; seed?: string } = {}): RoomHost {
    const now = o.scheduler.now();
    const salt = randHex(new CryptoRng(), 16);
    const rec: RoomRecord = {
      code, state: createGame(settings), tokens: {}, pwHash: extra.password ? sha256Hex(salt + ':' + extra.password) : null, pwSalt: salt,
      createdAt: now, lastActive: now, seq: 0, seed: settings.test && extra.seed ? extra.seed : null, actions: [],
    };
    return new RoomHost(rec, o);
  }

  get state() { return this.rec.state; }
  connectedCount() { return [...this.conns.values()].filter((c) => c.seat !== null).length; }

  // ---------- connections ----------
  open(connId: string) { this.conns.set(connId, { seat: null, intents: [], chats: [] }); }
  /** Re-attach a connection after a Durable Object wake-up (hibernation). */
  restoreConn(connId: string, seat: number | null) { this.conns.set(connId, { seat, intents: [], chats: [] }); }

  close(connId: string) {
    const c = this.conns.get(connId);
    this.conns.delete(connId);
    if (c?.seat === null || c?.seat === undefined) return;
    const stillThere = [...this.conns.values()].some((x) => x.seat === c.seat);
    if (!stillThere && this.state.seats[c.seat] && !this.state.seats[c.seat]!.left) this.sys({ t: 'SYS_CONNECT', seat: c.seat, connected: false });
  }

  message(connId: string, msg: ClientMsg, ip = 'local') {
    const c = this.conns.get(connId);
    if (!c) return;
    this.rec.lastActive = this.o.scheduler.now();
    switch (msg.type) {
      case 'HELLO': return this.hello(connId, c, msg, ip);
      case 'PING': return this.o.transport.send(connId, { type: 'PONG' });
      case 'RESYNC': if (c.seat !== null) this.sendSnapshot(connId, c.seat); return;
    }
    if (c.seat === null) return this.o.transport.send(connId, { type: 'ERROR', code: 'NOT_JOINED' });
    const seat = c.seat;
    switch (msg.type) {
      case 'INTENT': {
        const now = this.o.scheduler.now();
        c.intents = c.intents.filter((t) => now - t < 1000);
        if (c.intents.length >= MAX_INTENTS_PER_SEC) return this.o.transport.send(connId, { type: 'REJECT', cseq: msg.cseq, reason: 'RATE_LIMIT' });
        c.intents.push(now);
        const res = this.act(seat, msg.intent);
        if (!res.ok) this.o.transport.send(connId, { type: 'REJECT', cseq: msg.cseq, reason: res.reason });
        else this.o.transport.send(connId, { type: 'ACK', cseq: msg.cseq });
        return;
      }
      case 'CHAT': {
        if (!this.state.settings.freeText) return;
        const now = this.o.scheduler.now();
        c.chats = c.chats.filter((t) => now - t < 10000);
        if (c.chats.length >= 10) return this.o.transport.send(connId, { type: 'ERROR', code: 'CHAT_RATE_LIMIT' });
        c.chats.push(now);
        const text = String(msg.text ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').slice(0, 300).trim();
        if (text) this.toAll({ type: 'CHAT', seat, text, ts: now });
        return;
      }
      case 'EMOTE': if (typeof msg.id === 'string' && msg.id.length <= 24) this.toAll({ type: 'EMOTE', seat, id: msg.id }); return;
      case 'HOVER': {
        // Power cursor (Q9): others see the power-user's target. Only relayed while that seat owns a power.
        const a = this.state.round?.active;
        if (a?.k === 'power' && a.owner === seat) for (const [id, x] of this.conns) if (x.seat !== seat && x.seat !== null) this.o.transport.send(id, { type: 'HOVER', seat, slot: typeof msg.slot === 'string' ? msg.slot.slice(0, 12) : null });
        return;
      }
      case 'TEST': {
        if (!this.state.settings.test) return this.o.transport.send(connId, { type: 'ERROR', code: 'NOT_TEST_ROOM' });
        if (msg.op === 'STEP_MODE') { this.stepMode = !!msg.on; if (!this.stepMode) this.scheduleBots(); }
        else if (msg.op === 'STEP') this.stepOnce();
        this.toAllTestInfo(msg.op === 'EXPORT' ? connId : null);
        return;
      }
    }
  }

  private hello(connId: string, c: { seat: number | null; tag?: string }, msg: Extract<ClientMsg, { type: 'HELLO' }>, ip: string) {
    const s = this.state;
    const welcome = (seat: number, token?: string) => {
      this.o.transport.send(connId, { type: 'WELCOME', seat, seatToken: token, code: this.rec.code, test: s.settings.test, hasPassword: !!this.rec.pwHash, local: this.o.local });
    };
    // Reconnect with the saved seat token (§10.2).
    if (msg.seatToken) {
      const h = sha256Hex(msg.seatToken);
      const seat = Object.entries(this.rec.tokens).find(([, v]) => v === h)?.[0];
      if (seat !== undefined && s.seats[Number(seat)]) {
        const sid = Number(seat);
        for (const [id, x] of this.conns) if (id !== connId && x.seat === sid) { this.o.transport.send(id, { type: 'ELSEWHERE' }); this.o.transport.close(id, 4001, 'opened elsewhere'); this.conns.delete(id); }
        c.seat = sid; c.tag = msg.tag;
        welcome(sid);
        if (msg.lang && msg.lang !== s.seats[sid]!.lang) this.sys({ t: 'SYS_SET_LANG', seat: sid, lang: msg.lang }, false);
        // Full snapshot first (resume exactly where he was), then announce he is back (un-pauses the table).
        this.sendSnapshot(connId, sid);
        if (!s.seats[sid]!.connected || s.seats[sid]!.left) this.sys({ t: 'SYS_CONNECT', seat: sid, connected: true });
        return;
      }
    }
    // New join.
    if (this.rec.pwHash) {
      const now = this.o.scheduler.now();
      const tries = (this.pwTries.get(ip) ?? []).filter((t) => now - t < 60000);
      if (tries.length >= 5) return this.o.transport.send(connId, { type: 'ERROR', code: 'TOO_MANY_TRIES', triesLeft: 0 });
      if (!msg.password) return this.o.transport.send(connId, { type: 'ERROR', code: 'PASSWORD_REQUIRED', triesLeft: 5 - tries.length });
      if (sha256Hex(this.rec.pwSalt + ':' + msg.password) !== this.rec.pwHash) {
        tries.push(now); this.pwTries.set(ip, tries);
        return this.o.transport.send(connId, { type: 'ERROR', code: msg.password ? 'WRONG_PASSWORD' : 'PASSWORD_REQUIRED', triesLeft: 5 - tries.length });
      }
    }
    if (s.phase !== 'LOBBY') return this.o.transport.send(connId, { type: 'ERROR', code: 'IN_PROGRESS' });
    if (s.settings.locked) return this.o.transport.send(connId, { type: 'ERROR', code: 'ROOM_LOCKED' });
    const free = [0, 1, 2, 3].find((i) => !s.seats[i]);
    if (free === undefined || s.seats.filter(Boolean).length >= s.settings.maxPlayers) return this.o.transport.send(connId, { type: 'ERROR', code: 'ROOM_FULL' });
    const token = randHex(new CryptoRng(), 16);
    const res = this.sysRaw({ t: 'SYS_JOIN', seat: free, name: cleanName(msg.name), characterId: CHARACTERS.includes(msg.characterId) ? msg.characterId : 'biscuit', lang: msg.lang === 'fr' ? 'fr' : 'en' });
    if (!res) return this.o.transport.send(connId, { type: 'ERROR', code: 'JOIN_FAILED' });
    this.rec.tokens[free] = sha256Hex(token);
    c.seat = free; c.tag = msg.tag;
    welcome(free, token);
    this.after(res.events);
  }

  // ---------- applying intents ----------
  act(seat: SeatId, intent: Intent): { ok: true } | { ok: false; reason: string } {
    if (!intent || typeof intent !== 'object' || typeof (intent as { t?: unknown }).t !== 'string' || intent.t.startsWith('SYS_')) return { ok: false, reason: 'BAD_INTENT' };
    const r = reduce(this.state, seat, intent, this.rng);
    if (!r.ok) return r;
    this.commit(seat, intent, r.state);
    this.after(r.events);
    return { ok: true };
  }
  private sysRaw(intent: Intent) {
    const r = reduce(this.state, 'sys', intent, this.rng);
    if (!r.ok) return null;
    this.commit('sys', intent, r.state);
    return r;
  }
  private sys(intent: Intent, _broadcast = true) {
    const r = this.sysRaw(intent);
    if (r) this.after(r.events);
  }
  private commit(actor: number | 'sys', intent: Intent, state: GameState) {
    this.rec.state = state;
    if (this.rec.seed) { this.rec.actions.push({ a: actor, i: intent }); this.rec.rngState = (this.rng as SeededRng).getState(); }
  }

  private after(events: GameEvent[]) {
    this.rec.seq++;
    // Seats freed (kicked / removed / left in lobby): drop their tokens and sockets.
    for (const k of Object.keys(this.rec.tokens)) {
      const sid = Number(k);
      if (!this.state.seats[sid]) {
        delete this.rec.tokens[sid];
        for (const [id, x] of this.conns) if (x.seat === sid) { this.o.transport.send(id, { type: 'KICKED' }); this.o.transport.close(id, 4002, 'removed'); this.conns.delete(id); }
      }
    }
    for (const [id, x] of this.conns) {
      if (x.seat === null) continue;
      const msg: ServerMsg = { type: 'UPDATE', seq: this.rec.seq, events: events.map((e) => projectEvent(e, x.seat)), view: projectView(this.state, x.seat) };
      this.o.observe?.(x.seat, msg);
      this.o.transport.send(id, msg);
    }
    this.o.onChange?.(this.rec);
    this.scheduleBots();
  }

  sendSnapshot(connId: string, seat: number) {
    const msg: ServerMsg = { type: 'SNAPSHOT', seq: this.rec.seq, view: projectView(this.state, seat) };
    this.o.observe?.(seat, msg);
    this.o.transport.send(connId, msg);
  }
  private toAll(msg: ServerMsg) { for (const [id, x] of this.conns) if (x.seat !== null) this.o.transport.send(id, msg); }
  private toAllTestInfo(exportTo: string | null) {
    const info: ServerMsg = { type: 'TEST_INFO', stepMode: this.stepMode, pendingBots: this.pendingBotIntents().length, seed: this.rec.seed ?? undefined };
    this.toAll(info);
    if (exportTo) this.o.transport.send(exportTo, { ...info, export: JSON.stringify({ code: this.rec.code, seed: this.rec.seed, settings: this.rec.state.settings, actions: this.rec.actions }) });
  }

  // ---------- bots ----------
  private brain(seat: number): BotBrain {
    const level = (this.state.seats[seat]?.botLevel ?? 'normal') as BotLevel;
    let b = this.brains.get(seat);
    if (!b || b.level !== level) { b = createBrain(level); this.brains.set(seat, b); }
    return b;
  }
  private botIntent(seat: number): Intent | null {
    const view = projectView(this.state, seat, { helper: 'full', log: false }); // only this seat's legitimate knowledge
    this.o.observe?.(seat, { type: 'BOT_VIEW', view });
    return botDecide(view, this.brain(seat), this.botRng);
  }
  private pendingBotIntents() {
    const out: { seat: number; intent: Intent }[] = [];
    this.state.seats.forEach((si, seat) => { if (si?.isBot) { const it = this.botIntent(seat); if (it) out.push({ seat, intent: it }); } });
    return out;
  }
  scheduleBots() {
    if (this.stepMode) { this.toAllTestInfo(null); return; }
    const speed = this.state.settings.botSpeed;
    this.state.seats.forEach((si, seat) => {
      if (!si?.isBot || this.botTimers.has(seat)) return;
      if (!this.botIntent(seat)) return;
      const h = this.o.scheduler.set(botDelay(speed, this.botRng), () => {
        this.botTimers.delete(seat);
        if (this.stepMode || !this.state.seats[seat]?.isBot) return;
        const it = this.botIntent(seat);
        if (!it) return;
        const res = this.act(seat, it);
        if (!res.ok) this.scheduleBots(); // state moved on; re-plan
      });
      this.botTimers.set(seat, h);
    });
  }
  private stepOnce() {
    const next = this.pendingBotIntents()[0];
    if (next) this.act(next.seat, next.intent);
  }
  dispose() { for (const h of this.botTimers.values()) this.o.scheduler.clear(h); this.botTimers.clear(); }

  /** Rebuilds a Test-room game from its seed and action log (§17.3 seeded replay). */
  static replay(seed: string, settings: Partial<Settings>, actions: { a: number | 'sys'; i: Intent }[], upTo = actions.length): GameState {
    const rng = new SeededRng(seed);
    let st = createGame({ ...settings, test: true });
    for (const x of actions.slice(0, upTo)) { const r = reduce(st, x.a, x.i, rng); if (r.ok) st = r.state; }
    return st;
  }

  /** Host-only convenience for solo practice (local host): seat bots directly. */
  addBot(level: BotLevel) { const host = this.state.host; if (host !== null) this.act(host, { t: 'HOST_ADD_BOT', level }); }
}
