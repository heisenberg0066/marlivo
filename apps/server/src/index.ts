// MarLivo Worker: HTTP API + WebSocket routing to one Durable Object per room.
import { DurableObject } from 'cloudflare:workers';
import { RoomHost, type RoomRecord, type ClientMsg, type ServerMsg, type CreateRoomRequest } from '@marlivo/room';
import { CryptoRng, randInt } from '@marlivo/engine';

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  LIMITS: DurableObjectNamespace<Limits>;
  FRIENDS_KEY?: string;
  OWNER_KEY?: string;
  ALLOWED_ORIGINS?: string;
  ALLOW_TEST_ROOMS?: string;
  CREATE_LIMIT_PER_HOUR?: string;
}

// Room codes: 5 chars from an unambiguous alphabet (no 0/O/1/I/L), §10.1.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const IDLE_LIMIT_MS = 7 * 24 * 3600 * 1000; // technical idle limit: 7 days with nobody connected
const codeOk = (c: string) => /^[2-9A-HJKMNP-Z]{5}$/.test(c);
const newCode = () => { const r = new CryptoRng(); let s = ''; for (let i = 0; i < 5; i++) s += ALPHABET[randInt(r, ALPHABET.length)]; return s; };

function cors(env: Env, req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = (env.ALLOWED_ORIGINS ?? '*').split(',').map((x) => x.trim());
  const ok = allowed.includes('*') || allowed.includes(origin);
  return ok && origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', Vary: 'Origin' } : {};
}
const json = (data: unknown, status: number, h: Record<string, string>) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...h } });
const safeEq = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const h = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (url.pathname === '/' || url.pathname === '/api/health') return json({ ok: true, app: 'marlivo', friendsKeySet: !!env.FRIENDS_KEY, ownerKeySet: !!env.OWNER_KEY }, 200, h);

    if (url.pathname === '/api/rooms' && req.method === 'POST') {
      let body: CreateRoomRequest;
      try { body = await req.json(); } catch { return json({ error: 'BAD_JSON' }, 400, h); }
      if (!env.FRIENDS_KEY) return json({ error: 'SERVER_NOT_CONFIGURED' }, 503, h);
      if (typeof body.friendsKey !== 'string' || !safeEq(body.friendsKey, env.FRIENDS_KEY)) return json({ error: 'WRONG_FRIENDS_KEY' }, 403, h);
      // 10 room creations per hour per friends key (§11.2 item 9)
      const lim = env.LIMITS.get(env.LIMITS.idFromName('global'));
      if (!(await lim.hit('create', Number(env.CREATE_LIMIT_PER_HOUR ?? 10) || 10, 3600_000))) return json({ error: 'RATE_LIMIT' }, 429, h);
      const test = !!body.test;
      if (test) {
        if (env.ALLOW_TEST_ROOMS === '0') return json({ error: 'TEST_ROOMS_DISABLED' }, 403, h);
        if (!env.OWNER_KEY || typeof body.ownerKey !== 'string' || !safeEq(body.ownerKey, env.OWNER_KEY)) return json({ error: 'WRONG_OWNER_KEY' }, 403, h);
      }
      for (let i = 0; i < 8; i++) {
        const code = newCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const ok = await stub.init(code, { ...(body.settings ?? {}), test }, typeof body.password === 'string' && body.password ? body.password.slice(0, 64) : undefined, test ? body.seed : undefined);
        if (ok) return json({ code, test }, 200, h);
      }
      return json({ error: 'NO_CODE' }, 500, h);
    }

    const info = /^\/api\/rooms\/([A-Za-z0-9]{5})$/.exec(url.pathname);
    if (info && req.method === 'GET') {
      const code = info[1]!.toUpperCase();
      if (!codeOk(code)) return json({ error: 'ROOM_NOT_FOUND' }, 404, h);
      const res = await env.ROOMS.get(env.ROOMS.idFromName(code)).info();
      return res ? json(res, 200, h) : json({ error: 'ROOM_NOT_FOUND' }, 404, h);
    }

    const ws = /^\/ws\/([A-Za-z0-9]{5})$/.exec(url.pathname);
    if (ws) {
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'EXPECTED_WEBSOCKET' }, 426, h);
      const origin = req.headers.get('Origin');
      if (origin && !Object.keys(h).length) return json({ error: 'ORIGIN_NOT_ALLOWED' }, 403, {});
      const code = ws[1]!.toUpperCase();
      if (!codeOk(code)) return json({ error: 'ROOM_NOT_FOUND' }, 404, h);
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(req);
    }
    return json({ error: 'NOT_FOUND' }, 404, h);
  },
};

/** Tiny global rate limiter (room creations per friends key). */
export class Limits extends DurableObject<Env> {
  async hit(name: string, max: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const list = ((await this.ctx.storage.get<number[]>(name)) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= max) return false;
    list.push(now);
    await this.ctx.storage.put(name, list);
    return true;
  }
}

interface Attachment { connId: string; seat: number | null; ip: string }

/** One Durable Object per room: authoritative, strictly ordered, state persisted in SQLite storage (§8). */
export class Room extends DurableObject<Env> {
  private host: RoomHost | null = null;
  private loaded = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Answer heartbeats without waking the object (hibernation-friendly).
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"PING"}', '{"type":"PONG"}'));
  }

  private transport = {
    send: (connId: string, msg: ServerMsg) => {
      for (const ws of this.ctx.getWebSockets(connId)) { try { ws.send(JSON.stringify(msg)); } catch { /* closed */ } }
      if (msg.type === 'WELCOME') for (const ws of this.ctx.getWebSockets(connId)) {
        const att = ws.deserializeAttachment() as Attachment; ws.serializeAttachment({ ...att, seat: msg.seat });
      }
    },
    close: (connId: string, code: number, reason: string) => { for (const ws of this.ctx.getWebSockets(connId)) { try { ws.close(code, reason); } catch { /* */ } } },
  };
  private scheduler = { set: (ms: number, fn: () => void) => setTimeout(fn, ms), clear: (h: unknown) => clearTimeout(h as number), now: () => Date.now() };

  private async load(): Promise<RoomHost | null> {
    if (this.loaded) return this.host;
    const rec = await this.ctx.storage.get<RoomRecord>('room');
    this.loaded = true;
    if (!rec) return null;
    this.host = this.makeHost(rec);
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att) this.host.restoreConn(att.connId, att.seat);
    }
    this.host.scheduleBots();
    return this.host;
  }
  private makeHost(rec: RoomRecord) {
    return new RoomHost(rec, { transport: this.transport, scheduler: this.scheduler, onChange: (r) => { void this.ctx.storage.put('room', r); } });
  }

  async init(code: string, settings: Record<string, unknown>, password?: string, seed?: string): Promise<boolean> {
    if (await this.load()) return false; // code already in use
    this.host = RoomHost.create(code, settings, { transport: this.transport, scheduler: this.scheduler, onChange: (r) => { void this.ctx.storage.put('room', r); } }, { password, seed: seed ?? (settings.test ? String(Date.now()) : undefined) });
    await this.ctx.storage.put('room', this.host.rec);
    await this.ctx.storage.setAlarm(Date.now() + IDLE_LIMIT_MS);
    return true;
  }

  async info() {
    const h = await this.load();
    if (!h) return null;
    const s = h.state;
    return { code: h.rec.code, phase: s.phase, players: s.seats.filter(Boolean).length, maxPlayers: s.settings.maxPlayers, locked: s.settings.locked, hasPassword: !!h.rec.pwHash, test: s.settings.test };
  }

  async fetch(req: Request): Promise<Response> {
    const h = await this.load();
    if (!h) return new Response(JSON.stringify({ error: 'ROOM_NOT_FOUND' }), { status: 404 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    const connId = crypto.randomUUID();
    this.ctx.acceptWebSocket(server, [connId]);
    server.serializeAttachment({ connId, seat: null, ip: req.headers.get('CF-Connecting-IP') ?? 'local' } satisfies Attachment);
    h.open(connId);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    const h = await this.load();
    const att = ws.deserializeAttachment() as Attachment;
    if (!h) { ws.close(4004, 'room gone'); return; }
    if (typeof data !== 'string' || data.length > 8192) return; // voice notes (binary) arrive in Phase 3
    let msg: ClientMsg;
    try { msg = JSON.parse(data); } catch { return; }
    h.message(att.connId, msg, att.ip);
    await this.ctx.storage.setAlarm(Date.now() + IDLE_LIMIT_MS);
  }
  async webSocketClose(ws: WebSocket) { await this.dropSocket(ws); }
  async webSocketError(ws: WebSocket) { await this.dropSocket(ws); }
  private async dropSocket(ws: WebSocket) {
    const h = await this.load();
    const att = ws.deserializeAttachment() as Attachment | null;
    if (h && att) h.close(att.connId);
  }

  /** Housekeeping only (not a game timer): delete the room after 7 days with nobody connected. */
  async alarm() {
    if (this.ctx.getWebSockets().length) { await this.ctx.storage.setAlarm(Date.now() + IDLE_LIMIT_MS); return; }
    this.host?.dispose();
    this.host = null;
    await this.ctx.storage.deleteAll();
  }
}
