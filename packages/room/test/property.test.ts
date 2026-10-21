import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { simulateMatch } from '../src/sim';

describe('property: any bot match on any settings keeps the invariants and ends', () => {
  it('52 unique cards, stable slots, a winner per finished match (fast-check, 60 runs)', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 12 }), fc.integer({ min: 2, max: 4 }), fc.integer({ min: 4, max: 8 }), fc.integer({ min: 1, max: 3 }),
      (seed, players, cards, target) => {
        const r = simulateMatch(seed, { players, cards, target, invariants: true, randomLayouts: true });
        expect(r.state.phase).toBe('MATCH_END');
        expect(r.state.matchWinner).not.toBeNull();
        expect(Math.max(...Object.values(r.state.scores))).toBe(target);
      }), { numRuns: 60 });
  });
});
