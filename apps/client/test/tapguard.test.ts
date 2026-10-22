import { describe, it, expect } from 'vitest';
import { armed, nextStreak, BUTTON_ARM_MS as A } from '../src/screens/tapGuard';

/** Simulates taps on the bar: a button born at `born`; returns how many taps it accepted. */
function run(born: number, taps: number[]) {
  let prev = -1e9, streak = -1e9, n = 0;
  for (const t of taps) { streak = nextStreak(streak, prev, t); prev = t; if (t >= born && armed(born, streak, t)) n++; }
  return n;
}
describe('action-bar tap guard (stray taps must not close draws or attempts)', () => {
  it('a new button ignores taps right after it appears', () => {
    expect(run(1000, [1000 + A - 1])).toBe(0);
    expect(run(1000, [1000 + A])).toBe(1);
  });
  it('a finger that was hammering the old button never falls through to the new one', () => {
    const taps: number[] = []; for (let t = 500; t < 4000; t += 80) taps.push(t);
    expect(run(1000, taps)).toBe(0);
  });
  it('after a pause the new button works; repeated taps on a button that was already there work too', () => {
    expect(run(1000, [900, 1600])).toBe(1);
    const taps: number[] = []; for (let t = 2000; t < 3000; t += 250) taps.push(t);
    expect(run(1000, taps)).toBe(taps.length);
  });
});
