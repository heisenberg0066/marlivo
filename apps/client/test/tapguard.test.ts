import { describe, it, expect } from 'vitest';
import { armed, BUTTON_ARM_MS as A } from '../src/screens/tapGuard';

describe('action-bar tap guard (stray taps must not close draws or attempts)', () => {
  it('a new button ignores taps right after it appears', () => {
    expect(armed(1000, 900, 1000 + A - 1)).toBe(false);
    expect(armed(1000, 900, 1000 + A)).toBe(true);
  });
  it('a finger that keeps hammering the bar never falls through to the new button', () => {
    let prev = 990; const born = 1000; let accepted = 0;
    for (let t = 1000; t < 4000; t += 80) { if (armed(born, prev, t)) accepted++; prev = t; }
    expect(accepted).toBe(0);
  });
  it('a deliberate tap after a pause works', () => {
    expect(armed(1000, 990, 1600)).toBe(true);
    expect(armed(1000, 1500, 1500 + A)).toBe(true);
  });
});
