// Soak test (§21.1): many bot-vs-bot matches straight on the engine with invariant checks after every step
// (52 unique cards, stable slot ids/positions, no stuck states). Usage: pnpm soak [count]
import { simulateMatch } from '../packages/room/src/sim';
const n = Number(process.argv[2] ?? 10000);
const t0 = Date.now();
let rounds = 0, steps = 0, noWinner = 0, fails = 0, penalties = 0;
for (let i = 0; i < n; i++) {
  try {
    const r = simulateMatch('soak-' + i, { invariants: true });
    rounds += r.rounds; steps += r.steps; penalties += r.penalties; noWinner += r.winners.filter((w) => w === null).length;
    if (r.state.phase !== 'MATCH_END') { fails++; console.log('not finished', i); }
  } catch (e) { fails++; console.log('FAIL seed soak-' + i, (e as Error).message); }
  if ((i + 1) % 1000 === 0) console.log(`${i + 1}/${n} matches, ${rounds} rounds, ${fails} failures, ${Math.round((Date.now() - t0) / 1000)} s`);
}
console.log(JSON.stringify({ matches: n, rounds, steps, penalties, noWinnerRounds: noWinner, failures: fails, seconds: Math.round((Date.now() - t0) / 1000) }));
process.exit(fails ? 1 : 0);
