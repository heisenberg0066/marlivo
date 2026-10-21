// Real multi-client test against the Cloudflare Worker running locally (wrangler dev / workerd).
// Checks: health, friends-key + owner-key gating, password, 2–4 WebSocket clients playing full matches,
// per-player hidden-info filtering (leak checks on every message), disconnect → pause → reconnect with the
// seat token (even mid-attempt), host "replace with bot" / "hand back", and room info.
// Usage: start `wrangler dev` (apps/server), then: node --import tsx scripts/server-integration.ts [baseUrl]
import WebSocket from 'ws';
import type { PlayerView, Intent } from '@marlivo/engine';
import type { ServerMsg, ClientMsg } from '@marlivo/room';
import { randomHuman } from '../packages/room/test/humans';
import { facesIn } from '../packages/room/test/leakcheck';

const BASE = process.argv[2] ?? 'http://localhost:8787';
const FRIENDS = process.env.FRIENDS_KEY ?? 'local-friends-key';
const OWNER = process.env.OWNER_KEY ?? 'local-owner-key';
const ORIGIN = 'http://localhost:5173';
let failures = 0, checks = 0;
const ok = (cond: unknown, what: string) => { checks++; if (!cond) { failures++; console.log('  ✖ ' + what); } else console.log('  ✔ ' + what); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const post = async (body: unknown) => { const r = await fetch(BASE + '/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body) }); return { status: r.status, j: await r.json() as any }; };

const CARD_ID = /"id":"c[0-9a-f]{8}"/;
interface Leak { n: number; list: string[] }
/** Structural leak check of one message for one seat (no server state needed). */
function leakCheck(msg: ServerMsg, seat: number, L: Leak) {
  const raw = JSON.stringify(msg);
  if (CARD_ID.test(raw)) L.list.push('card id in message');
  if (msg.type !== 'UPDATE' && msg.type !== 'SNAPSHOT') return;
  L.n++;
  const v = msg.view, r = v.round;
  if (v.you !== seat) L.list.push(`view.you ${v.you} != ${seat}`);
  if (r) {
    if (r.drawn?.face && r.drawn.by !== seat && !v.test?.reveal) L.list.push('saw someone else\'s drawn card');
    const ended = v.phase === 'ROUND_END' || (v.phase === 'MATCH_END' && !!r.result);
    const tent = new Set(r.active?.k === 'attempt' ? r.active.tentative : []);
    for (const [owner, slots] of Object.entries(r.areas)) for (const sl of slots) {
      if (!sl.face) continue;
      const okWhy = (sl.why === 'reveal' && ended) || (sl.why === 'tentative' && tent.has(sl.id)) || (sl.why === 'peek' && Number(owner) === seat && v.phase === 'PEEK')
        || (sl.why === 'queen' && r.active?.k === 'power' && r.active.owner === seat && r.active.peekSlot === sl.id) || (sl.why === 'test' && !!v.test?.reveal);
      if (!okWhy) L.list.push(`face visible without right: ${sl.id} why=${sl.why} phase=${v.phase}`);
    }
    for (const [owner, slots] of Object.entries(r.areas)) for (const sl of slots) if (sl.ghost && Number(owner) !== seat && v.settings.memoryHelper !== 'full') L.list.push('ghost on opponent card with helper ' + v.settings.memoryHelper);
    if (v.phase === 'PEEK') { const n = (r.areas[seat] ?? []).filter((s) => s.why === 'peek').length; if (n > 2) L.list.push('more than 2 peek faces'); }
  }
  if (msg.type === 'UPDATE') for (const e of msg.events) {
    const owner = (e.p as any).seat ?? (e.p as any).owner;
    if (e.priv && owner !== seat) L.list.push(`private part of ${e.t} delivered to seat ${seat}`);
    if (['DREW', 'PEEK_PICKED', 'QUEEN_PEEKED', 'TEN_GIVEN', 'PENALTY_DEALT', 'JACK_SWAPPED', 'DEALT'].includes(e.t) && facesIn(e.p).length) L.list.push(`card face in public part of ${e.t}`);
  }
}

class Client {
  ws!: WebSocket; view: PlayerView | null = null; seat = -1; token = ''; msgs: ServerMsg[] = []; leaks: Leak = { n: 0, list: [] }; cseq = 0;
  mem = new Map<string, number>(); auto = false; closed = false; rng = { next: Math.random }; lastSeqEvents = new Map<number, string>();
  constructor(public code: string, public name: string, public password?: string) {}
  connect(token?: string) {
    return new Promise<void>((res, rej) => {
      this.ws = new WebSocket(BASE.replace(/^http/, 'ws') + '/ws/' + this.code, { headers: { Origin: ORIGIN } });
      this.closed = false;
      this.ws.on('open', () => { this.send({ type: 'HELLO', name: this.name, characterId: 'mint', lang: 'en', seatToken: token ?? (this.token || undefined), password: this.password }); });
      this.ws.on('message', (d) => {
        const m = JSON.parse(String(d)) as ServerMsg; this.msgs.push(m);
        if (m.type === 'WELCOME') { this.seat = m.seat; if (m.seatToken) this.token = m.seatToken; res(); }
        if (m.type === 'ERROR') res();
        if (this.seat >= 0) leakCheck(m, this.seat, this.leaks);
        if (m.type === 'UPDATE') this.lastSeqEvents.set(m.seq, JSON.stringify(m.events.map((e) => ({ t: e.t, p: e.p }))));
        if (m.type === 'UPDATE' || m.type === 'SNAPSHOT') { this.view = m.view; if (this.auto) this.later(); }
        if (m.type === 'REJECT' && this.auto) this.later();
      });
      this.ws.on('close', () => { this.closed = true; });
      this.ws.on('error', rej);
    });
  }
  send(m: ClientMsg) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  intent(i: Intent) { this.send({ type: 'INTENT', cseq: ++this.cseq, intent: i }); }
  private pending = false;
  later() { if (this.pending) return; this.pending = true; setTimeout(() => { this.pending = false; this.drive(); }, 20 + Math.random() * 80); }
  drive() { if (!this.auto || this.closed || !this.view) return; const it = randomHuman(this.view, this.rng, this.mem); if (it) this.intent(it); }
  drop() { this.ws.terminate(); this.closed = true; }
  lastError() { return [...this.msgs].reverse().find((m) => m.type === 'ERROR') as any; }
}

let naturalWins = 0;
async function waitFor(f: () => boolean, ms = 120000, step = 50) { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) return false; await sleep(step); } return true; }

async function playRoom(n: number, opts: { bots?: number; dropMidAttempt?: boolean; replace?: boolean; cards?: number; target?: number }) {
  console.log(`\n▶ ${n} WebSocket clients${opts.bots ? ` + ${opts.bots} bots` : ''}${opts.dropMidAttempt ? ', drop + reconnect mid-attempt' : ''}${opts.replace ? ', host replaces a dropped player with a bot' : ''}`);
  const { status, j } = await post({ friendsKey: FRIENDS, settings: { targetPoints: opts.target ?? 2, cardsPerPlayer: opts.cards ?? 4, botSpeed: 'instant' } });
  ok(status === 200 && j.code, `room created (${j.code})`);
  const cs = Array.from({ length: n }, (_, i) => new Client(j.code, 'P' + i));
  for (const c of cs) await c.connect();
  ok(cs.every((c) => c.seat >= 0) && new Set(cs.map((c) => c.seat)).size === n, 'every client got its own seat');
  const host = cs[0]!;
  for (let i = 0; i < (opts.bots ?? 0); i++) host.intent({ t: 'HOST_ADD_BOT', level: (['easy', 'normal', 'hard'] as const)[i % 3] });
  for (const c of cs.slice(1)) c.intent({ t: 'SET_READY', ready: true });
  await sleep(300);
  host.intent({ t: 'START' });
  for (const c of cs) { c.auto = true; c.later(); }

  if (opts.dropMidAttempt || opts.replace) {
    const victim = cs[1]!;
    const hit = await waitFor(() => { const a = victim.view?.round?.active; return opts.replace ? victim.view?.phase === 'PLAY' : (a?.k === 'attempt' && a.seat === victim.seat && a.flipped.length > 0); }, 120000, 2);
    ok(hit, opts.replace ? 'victim is playing' : 'victim is mid-attempt with a flipped card');
    victim.auto = false; victim.drop();
    const paused = await waitFor(() => !!host.view?.paused && host.view.pausedSeats.includes(victim.seat), 10000);
    const before = JSON.stringify(host.view?.round?.active);
    ok(paused, 'game paused for everyone, waiting for the dropped player (no timer)');
    await sleep(2500);
    ok(!!host.view?.paused && JSON.stringify(host.view?.round?.active) === before, 'still paused after 2.5 s, nothing advanced while he was away');
    if (opts.replace) {
      host.intent({ t: 'HOST_REPLACE_WITH_BOT', seat: victim.seat });
      ok(await waitFor(() => !host.view?.paused && !!host.view?.seats[victim.seat]?.replacedByBot, 10000), 'host replaced him with a bot; game resumed');
      await victim.connect();
      ok(await waitFor(() => !!victim.view, 5000), 'dropped player can come back and watch his bot-played seat');
      host.intent({ t: 'HOST_HAND_BACK', seat: victim.seat });
      ok(await waitFor(() => !host.view?.seats[victim.seat]?.replacedByBot, 10000), 'host handed the seat back to him');
      victim.auto = true; victim.later();
    } else {
      const mark = victim.msgs.length;
      await victim.connect();
      await waitFor(() => victim.msgs.slice(mark).some((m) => m.type === 'SNAPSHOT'), 5000);
      const snap = victim.msgs.slice(mark).find((m) => m.type === 'SNAPSHOT') as any;
      ok(snap && JSON.stringify(snap.view.round.active) === before, 'reconnected with the seat token and resumed the attempt exactly where it was');
      ok(await waitFor(() => !host.view?.paused, 5000), 'game resumed');
      victim.auto = true; victim.later();
      // Random "humans" in this room rarely reach the target (most rounds end with no cards left),
      // so play on for a while to show the game keeps going, then use the host's End game button.
      const seq0 = host.lastSeqEvents.size;
      await sleep(8000);
      ok(host.lastSeqEvents.size > seq0 + 20 || host.view?.phase === 'MATCH_END', `play continued normally after the reconnect (${host.lastSeqEvents.size - seq0} updates)`);
      if (host.view?.phase !== 'MATCH_END') host.intent({ t: 'HOST_END_GAME' });
    }
  }
  // Random test "players" sometimes burn the deck round after round (no winner), so give the match
  // a fair chance to end on its own, then fall back to the host's End game button.
  let done = await waitFor(() => cs.every((c) => c.view?.phase === 'MATCH_END'), 150000);
  const natural = done && host.view?.endedBy !== 'host';
  if (!done) { host.intent({ t: 'HOST_END_GAME' }); done = await waitFor(() => cs.every((c) => c.view?.phase === 'MATCH_END'), 10000); }
  ok(done, `match ended on every client: ${natural ? 'won' : 'host ended it'} after ${host.view?.roundNo} rounds, scores ${JSON.stringify(host.view?.scores)}`);
  if (natural) naturalWins++;
  const msgs = cs.reduce((a, c) => a + c.leaks.n, 0);
  const leaks = cs.flatMap((c) => c.leaks.list);
  ok(leaks.length === 0, `leak check: ${msgs} views/updates checked across ${n} clients, ${leaks.length} leaks${leaks.length ? ': ' + leaks.slice(0, 3).join('; ') : ''}`);
  let mismatch = 0, compared = 0;
  for (const [seq, evs] of host.lastSeqEvents) for (const c of cs.slice(1)) { const o = c.lastSeqEvents.get(seq); if (o !== undefined) { compared++; if (o !== evs) mismatch++; } }
  ok(mismatch === 0 && compared > 50, `public event stream identical for every player (${compared} updates compared)`);
  for (const c of cs) c.ws.close();
}

async function main() {
  console.log('MarLivo server integration test against ' + BASE);
  const h = await (await fetch(BASE + '/api/health')).json() as any;
  ok(h.ok && h.friendsKeySet && h.ownerKeySet, 'health: worker up, FRIENDS_KEY and OWNER_KEY set');
  ok((await post({ friendsKey: 'wrong' })).status === 403, 'wrong friends key → 403');
  ok((await post({ friendsKey: FRIENDS, test: true, ownerKey: 'nope' })).status === 403, 'Test room with wrong owner key → 403');
  const t = await post({ friendsKey: FRIENDS, test: true, ownerKey: OWNER });
  ok(t.status === 200 && t.j.test, 'Test room with owner key → created');
  const normal = await post({ friendsKey: FRIENDS });
  const nc = new Client(normal.j.code, 'N'); await nc.connect();
  nc.intent({ t: 'TEST_REVEAL', on: true }); await sleep(300);
  ok(nc.msgs.some((m) => m.type === 'REJECT' && m.reason === 'NOT_TEST_ROOM'), 'test tools rejected in a normal room');
  nc.ws.close();
  const pw = await post({ friendsKey: FRIENDS, password: 'tea' });
  const info = await (await fetch(BASE + '/api/rooms/' + pw.j.code)).json() as any;
  ok(info.hasPassword === true, 'room info shows a password is needed');
  const a = new Client(pw.j.code, 'A'); await a.connect();
  ok(a.lastError()?.code === 'PASSWORD_REQUIRED', 'joining without the password → PASSWORD_REQUIRED');
  a.ws.close();
  const b = new Client(pw.j.code, 'B', 'coffee'); await b.connect();
  ok(b.lastError()?.code === 'WRONG_PASSWORD', 'wrong password → WRONG_PASSWORD (tries left: ' + b.lastError()?.triesLeft + ')');
  b.ws.close();
  const c = new Client(pw.j.code, 'C', 'tea'); await c.connect();
  ok(c.seat >= 0, 'right password → seated');
  c.ws.close();
  const evil = await new Promise<number>((res) => { const w = new WebSocket(BASE.replace(/^http/, 'ws') + '/ws/' + pw.j.code, { headers: { Origin: 'https://evil.example' } }); w.on('unexpected-response', (_q, r) => res(r.statusCode ?? 0)); w.on('open', () => { w.close(); res(101); }); w.on('error', () => res(-1)); });
  ok(evil === 403, `WebSocket from a foreign origin → ${evil}`);

  if (process.env.ONLY_RECONNECT) { await playRoom(2, { bots: 1, dropMidAttempt: true, cards: 6, target: 9 }); console.log(`\n${checks - failures}/${checks} checks passed`); process.exit(failures ? 1 : 0); }
  await playRoom(2, { target: 1 });
  await playRoom(3, { bots: 1, target: 1 });
  await playRoom(4, { target: 1 });
  await playRoom(2, { bots: 1, dropMidAttempt: true, cards: 6, target: 9 });
  await playRoom(3, { replace: true, target: 1 });
  console.log(`\n${naturalWins} of 5 matches were won outright; the rest were ended with the host button`);
  console.log(`${checks - failures}/${checks} checks passed`);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
