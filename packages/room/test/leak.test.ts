import { describe, it, expect } from 'vitest';
import { RoomHost, type ServerMsg, type ClientMsg } from '@marlivo/room';
import { SeededRng, type Intent, type PlayerView } from '@marlivo/engine';
import { VirtualScheduler } from './sim';
import { checkMessage, newReport, type LeakReport } from './leakcheck';
import { randomHuman } from './humans';

function runRoom(seed: string, humans: number, bots: number, helper: 'off' | 'own' | 'full', target = 1, cards = 4): { rep: LeakReport; host: RoomHost; rounds: number } {
  const sched = new VirtualScheduler();
  const rng = new SeededRng(seed);
  const rep = newReport();
  const views = new Map<string, PlayerView>();
  const seatOf = new Map<string, number>();
  const tokens = new Map<string, string>();
  let cseq = 0;
  let rejects = 0;
  let host!: RoomHost;
  const transport = {
    send(conn: string, msg: ServerMsg) {
      const seat = seatOf.get(conn);
      if (msg.type === 'WELCOME') { seatOf.set(conn, msg.seat); if (msg.seatToken) tokens.set(conn, msg.seatToken); }
      if (seat !== undefined || msg.type === 'WELCOME') checkMessage(rep, host.state, seatOf.get(conn)!, msg, helper === 'full' || helper === 'own');
      if (msg.type === 'REJECT' && rejects++ < 20000) later(conn);
      if (msg.type === 'UPDATE' || msg.type === 'SNAPSHOT') { views.set(conn, msg.view); later(conn); }
    },
    close() {},
  };
  host = RoomHost.create('TEST1', { memoryHelper: helper, botSpeed: 'fast', targetPoints: target, cardsPerPlayer: cards }, {
    transport, scheduler: sched,
    observe: (seat, msg) => { if (msg.type === 'BOT_VIEW' && seat !== null) checkMessage(rep, host.state, seat, msg, true); },
  });
  const send = (conn: string, m: ClientMsg) => host.message(conn, m);
  let dropped = false;
  const pendingDrive = new Set<string>();
  const mems = new Map<string, Map<string, number>>();
  function later(conn: string) {
    if (pendingDrive.has(conn)) return;
    pendingDrive.add(conn);
    sched.set(50 + Math.floor(rng.next() * 400), () => { pendingDrive.delete(conn); drive(conn); });
  }
  function drive(conn: string) {
    const v = views.get(conn); if (!v || !host.state.seats[v.you ?? -1]) return;
    // Once, mid-round, drop a human and bring him back (pause + SNAPSHOT path).
    if (!dropped && v.phase === 'PLAY' && conn === 'h1' && rng.next() < 0.05) {
      dropped = true; host.close('h1'); seatOf.delete('h1');
      sched.set(3000, () => { host.open('h1b'); seatOf.set('h1b', v.you!); send('h1b', { type: 'HELLO', name: 'x', characterId: 'mint', lang: 'fr', seatToken: tokens.get('h1')! }); tokens.set('h1b', tokens.get('h1')!); });
      return;
    }
    if (!mems.has(conn)) mems.set(conn, new Map());
    const it = randomHuman(v, rng, mems.get(conn)!);
    if (it) send(conn, { type: 'INTENT', cseq: ++cseq, intent: it });
  }
  for (let i = 0; i < humans; i++) { const id = 'h' + i; host.open(id); send(id, { type: 'HELLO', name: 'H' + i, characterId: 'biscuit', lang: 'en' }); }
  const hostConn = 'h0';
  for (let i = 0; i < bots; i++) send(hostConn, { type: 'INTENT', cseq: ++cseq, intent: { t: 'HOST_ADD_BOT', level: (['easy', 'normal', 'hard'] as const)[i % 3] } });
  for (let i = 1; i < humans; i++) send('h' + i, { type: 'INTENT', cseq: ++cseq, intent: { t: 'SET_READY', ready: true } });
  send(hostConn, { type: 'INTENT', cseq: ++cseq, intent: { t: 'START' } });
  sched.runAll(400000);
  return { rep, host, rounds: host.state.roundNo };
}

describe('leak test: no message ever contains a hidden card value', () => {
  const cases: [string, number, number, 'off' | 'own' | 'full', number, number][] = [
    ['a', 2, 0, 'off', 1, 4], ['b', 2, 2, 'off', 2, 5], ['c', 3, 1, 'off', 1, 4], ['d', 4, 0, 'off', 1, 4], ['e', 2, 1, 'full', 2, 6], ['f', 1, 3, 'own', 3, 6], ['g', 3, 0, 'off', 1, 4], ['h', 2, 2, 'off', 1, 6],
  ];
  for (const [seed, h, b, helper, target, cards] of cases) {
    it(`${h} humans + ${b} bots, helper ${helper}, target ${target}, ${cards} cards (seed ${seed})`, () => {
      const { rep, host, rounds } = runRoom(seed, h, b, helper, target, cards);
      expect(rep.leaks.slice(0, 5)).toEqual([]);
      expect(rep.messages).toBeGreaterThan(100);
      expect(rep.facesChecked).toBeGreaterThan(100);
      if (host.state.phase !== 'MATCH_END') console.log('STUCK', seed, JSON.stringify({ phase: host.state.phase, paused: host.state.seats.map((x) => x && [x.connected, x.isBot]), r: host.state.round && { cur: host.state.round.current, drawn: !!host.state.round.drawn, win: host.state.round.window, act: host.state.round.active, q: host.state.round.queue } }));
      expect(host.state.phase).toBe('MATCH_END');
      expect(rounds).toBeGreaterThanOrEqual(target);
    });
  }
  it('the checker itself catches a deliberately leaked card', () => {
    const { host } = runRoom('z', 2, 0, 'off');
    const rep = newReport();
    const st = host.state;
    // find a hidden card for seat 1 by making the round look "in play"
    const fake = structuredClone(st); fake.phase = 'PLAY';
    const hidden = Object.values(fake.round!.areas).flat().find((x) => x.card && !fake.round!.publicSeen.includes(x.card.id) && !fake.round!.knowledge[x.card.id]?.includes(1));
    if (!hidden) return;
    checkMessage(rep, fake, 1, { type: 'UPDATE', events: [{ t: 'X', p: { card: { r: hidden.card!.r, s: hidden.card!.s } } }] }, false);
    expect(rep.leaks.length).toBe(1);
  });
});
