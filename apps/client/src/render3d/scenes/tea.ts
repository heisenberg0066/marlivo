// Tea levels per seat. Each cup drains at a lively, visible pace during a match (~1.5 min from full to empty,
// small sips every 6–14 s) and starts partially full (0.55..0.78) so the waiter's very first tour visibly refills
// every player's cup to FULL (0.92). Also exposed on window.__mlTea for tests and the waiter job.
const FULL = 0.92, EMPTY = 0.08;
interface Cup { level: number; target: number; nextSip: number; seed: number }
const cups = new Map<number, Cup>();
const listeners = new Set<(seat: number) => void>();
let rnd = 7; const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
/** minutes from full to empty on average; exported so a test room can speed it up */
export const TEA_DRAIN = { minutes: 1.5, sipEvery: [6, 14] as [number, number] };

function cup(seat: number, now: number): Cup {
  let c = cups.get(seat);
  if (!c) {
    const startLvl = 0.55 + rand() * 0.23;
    c = { level: startLvl, target: startLvl, nextSip: now + 3 + rand() * 8, seed: seat };
    cups.set(seat, c);
  }
  return c;
}
/** advance every cup to time `now` (seconds); returns nothing, read with teaLevel() */
let lastNow = 0;
export function tickTea(now: number, dt: number, seats: number[]) {
  lastNow = now;
  const [a, b] = TEA_DRAIN.sipEvery;
  const sipsToEmpty = (TEA_DRAIN.minutes * 60) / ((a + b) / 2);
  for (const s of seats) {
    const c = cup(s, now);
    if (now >= c.nextSip) {
      c.target = Math.max(EMPTY, c.target - ((FULL - EMPTY) / sipsToEmpty) * (0.6 + rand() * 0.8));
      c.nextSip = now + a + rand() * (b - a);
    }
    // ease towards the target (a sip takes ~1.5 s, a refill ~1.8 s)
    c.level += (c.target - c.level) * Math.min(1, dt * (c.target > c.level ? 1.8 : 1.2));
  }
}
export const teaLevel = (seat: number) => cups.get(seat)?.level ?? 0.65;
export function refillTea(seat?: number) {
  const all = seat === undefined ? [...cups.keys()] : [seat];
  for (const s of all) {
    const c = cup(s, lastNow);
    c.target = FULL;
    c.nextSip = Math.max(c.nextSip, lastNow + 10);
    listeners.forEach((f) => f(s));
  }
}
export function onRefill(f: (seat: number) => void) { listeners.add(f); return () => { listeners.delete(f); }; }
export function setTeaLevel(seat: number, level: number) { const c = cup(seat, 0); c.level = c.target = Math.min(FULL, Math.max(EMPTY, level)); }
if (typeof window !== 'undefined') (window as unknown as { __mlTea?: object }).__mlTea = { refill: refillTea, level: teaLevel, set: setTeaLevel, onRefill, drain: TEA_DRAIN };
