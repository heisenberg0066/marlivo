// Connections to a room "server": the Cloudflare Durable Object (online), or a RoomHost running in a Web Worker
// on this device (offline practice / local two-window test). The UI code path is identical.
import type { ClientMsg, ServerMsg } from '@marlivo/room';

export interface Conn {
  send(msg: ClientMsg): void;
  onMessage: (msg: ServerMsg) => void;
  onStatus: (s: 'connecting' | 'open' | 'closed') => void;
  close(): void;
  /** Test tools (§17.3): simulated latency and a manual drop. */
  latency: number;
  drop(): void;
  kind: 'local' | 'online' | 'channel';
}

abstract class Base implements Conn {
  onMessage: (msg: ServerMsg) => void = () => {};
  onStatus: (s: 'connecting' | 'open' | 'closed') => void = () => {};
  latency = 0;
  abstract kind: Conn['kind'];
  protected deliver(msg: ServerMsg) { if (this.latency) setTimeout(() => this.onMessage(msg), this.latency); else this.onMessage(msg); }
  send(msg: ClientMsg) { if (this.latency) setTimeout(() => this.raw(msg), this.latency); else this.raw(msg); }
  protected abstract raw(msg: ClientMsg): void;
  abstract close(): void;
  abstract drop(): void;
}

/** Online: WebSocket with auto-reconnect and exponential backoff 0.5 s → 8 s (§10.4). */
export class OnlineConn extends Base {
  kind = 'online' as const;
  private ws: WebSocket | null = null; private backoff = 500; private closed = false; private hello: ClientMsg | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  constructor(private url: string, private getHello: () => ClientMsg) { super(); this.connect(); }
  private connect() {
    this.onStatus('connecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => { this.backoff = 500; this.onStatus('open'); this.hello = this.getHello(); ws.send(JSON.stringify(this.hello)); };
    ws.onmessage = (e) => { try { const m = JSON.parse(e.data as string) as ServerMsg; if (m.type !== 'PONG') this.deliver(m); } catch { /* ignore */ } };
    ws.onclose = (e) => {
      this.onStatus('closed');
      if (this.closed || e.code === 4001 || e.code === 4002 || e.code === 4004) return;
      setTimeout(() => !this.closed && this.connect(), this.backoff);
      this.backoff = Math.min(8000, this.backoff * 2);
    };
    if (this.ping) clearInterval(this.ping);
    this.ping = setInterval(() => { if (ws.readyState === 1) ws.send('{"type":"PING"}'); }, 5000);
  }
  protected raw(msg: ClientMsg) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  close() { this.closed = true; if (this.ping) clearInterval(this.ping); this.ws?.close(); }
  drop() { this.ws?.close(); }
}

/** Offline: the room host runs in a Web Worker on this device. */
export class LocalConn extends Base {
  kind = 'local' as const;
  constructor(private port: { post(m: unknown): void }, public connId: string) { super(); }
  receive(m: ServerMsg) { this.deliver(m); }
  protected raw(msg: ClientMsg) { this.port.post({ kind: 'msg', connId: this.connId, msg }); }
  close() { this.port.post({ kind: 'close', connId: this.connId }); }
  drop() { this.port.post({ kind: 'close', connId: this.connId }); setTimeout(() => this.port.post({ kind: 'reopen', connId: this.connId }), 2500); }
}

/** Local two-window test: another tab hosts the room; we talk to it over a BroadcastChannel. */
export class ChannelConn extends Base {
  kind = 'channel' as const;
  private ch: BroadcastChannel; private id = 'tab-' + Math.random().toString(36).slice(2);
  constructor(code: string, private getHello: () => ClientMsg) {
    super();
    this.ch = new BroadcastChannel('marlivo-local-' + code);
    this.ch.onmessage = (e) => { const d = e.data; if (d?.to === this.id) this.deliver(d.msg); if (d?.hostUp) this.open(); };
    this.open();
  }
  private open() { this.onStatus('open'); this.ch.postMessage({ from: this.id, open: true }); this.raw(this.getHello()); }
  protected raw(msg: ClientMsg) { this.ch.postMessage({ from: this.id, msg }); }
  close() { this.ch.postMessage({ from: this.id, close: true }); this.ch.close(); }
  drop() { this.ch.postMessage({ from: this.id, close: true }); setTimeout(() => this.open(), 2500); }
}
