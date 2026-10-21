// Test-room forced-deck presets (§17.3). Hands are listed relative to the round's starter
// (index 0 = the starter, who draws first). deckTop[0] is the starter's first draw.
import type { Settings } from './types';
export interface Preset {
  id: string;
  hint: string;              // English description (shown in the Test tools panel)
  dice?: number[];
  hands?: string[][];
  deckTop?: string[];
  deckCount?: number;        // move all but N deck cards onto the pile (to test reshuffles)
  settings?: Partial<Settings>;
}
const F = ['KS', 'KH', 'KD', 'KC'];
export const PRESETS: Preset[] = [
  { id: 'jack-chain', hint: 'You draw a J: throw it (Jack power), then match it with your own J → a second Jack power.', hands: [['JS', '4H', '8C', 'KS', 'KH', '6D']], deckTop: ['JH'] },
  { id: 'six-flips', hint: "Ammar's R18 example. Draw Q, throw (T=12). Flip 7, 8✗, 9✗, K✗, 3, 2 → 3 played, 3 wrong → +6.", hands: [['7S', '8H', '9C', 'KD', '3S', '2H']], deckTop: ['QC'] },
  { id: 'combo-mistake', hint: 'T=12: flip 7, 3, 5 (overshoots), 2 → played 7+3+2, +2.', hands: [['7S', '3H', '5C', '2D', ...F.slice(0, 2)]], deckTop: ['QC'] },
  { id: 'giveup-6', hint: 'T=12: flip 7, 3, 4 (overshoots), give up → +6.', hands: [['7S', '3H', '4C', ...F.slice(0, 3)]], deckTop: ['QC'] },
  { id: 'giveup-1', hint: 'T=9 trying 4+5: flip the 5, give up → +2.', hands: [['5S', '4H', ...F]], deckTop: ['9C'] },
  { id: 'remove-from-set', hint: 'T=12: 7, 2, 9 (overshoots), remove the 2, flip 5 → played 7+5, +4.', hands: [['7S', '2H', '9C', '5D', 'KS', 'KH']], deckTop: ['QC'] },
  { id: 'out-of-cards', hint: 'T=9 with only 5, 2, A → auto-fail, +6.', hands: [['5S', '2H', 'AC']], deckTop: ['9C'] },
  { id: 'double-match', hint: 'T=9: match with your 9, then claim again and match 5+4.', hands: [['9S', '5H', '4C', 'KD', 'KS', 'KH']], deckTop: ['9C'] },
  { id: 'dice-tie', hint: 'Forced rolls 6, 6, 3 → the two 6s roll again (then 5 vs 2).', dice: [6, 6, 3, 3, 5, 2, 2, 2] },
  { id: 'placement', hint: 'T=12: match 6+6 (two gaps), claim again: 9, K✗ give up → penalties fill the gaps first, then random row ends.', hands: [['6S', '6H', '9C', 'KD', 'QS', 'QH']], deckTop: ['QC'] },
  { id: 'king-j2', hint: 'R22: draw K, throw, match with J+2 → you get the Jack power.', hands: [['JS', '2H', '8C', '9D', 'KS', '5H']], deckTop: ['KC'] },
  { id: 'ten-power', hint: 'Draw a 10 and throw it: 2 players → automatic +1 to the opponent; 3–4 → you must choose.', hands: [['4S', '5H', '8C', '9D', 'KS', '7H']], deckTop: ['10C'] },
  { id: 'last-card-out-of-turn', hint: 'R25: the next player holds a single J. You draw a J and throw it; he matches → finish rule.', hands: [['4S', '5H', '8C', '9D', 'KS', '7H'], ['JD']], deckTop: ['JC'] },
  { id: 'finish-rule', hint: '§5.3: you and the next player each hold one 7. You throw a 7; if he empties first you may try to finish.', hands: [['7S'], ['7H']], deckTop: ['7C'] },
  { id: 'empty-deck', hint: 'Only 2 cards left in the deck: the next draws reshuffle the pile (keeping the target).', deckCount: 2 },
];
