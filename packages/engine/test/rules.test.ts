import { describe, it, expect } from 'vitest';
import { act, rej, lobby, play, sid, count, total, ofType, type Run } from './helpers';
import { initialGrid, layoutOptions, placeCard, SeededRng, createGame, reduce, projectView, sha256Hex, parseFace, CHARACTERS, type RoundState } from '../src';

/** Seat 0 draws the forced top card and throws it, opening a window. Resolves a Q/J power by skipping/peeking. */
function drawThrow(run: Run, seat = 0) { act(run, seat, { t: 'DRAW' }); act(run, seat, { t: 'THROW' }); }
function skipPower(run: Run) {
  const a = run.s.round!.active;
  if (a?.k !== 'power') return;
  if (a.power === 'Q') act(run, a.owner, { t: 'QUEEN_SKIP', confirm: true });
  else if (a.power === 'J') act(run, a.owner, { t: 'JACK_SKIP' });
}
const attempt = (run: Run) => run.s.round!.active as Extract<NonNullable<RoundState['active']>, { k: 'attempt' }>;
const lastEnd = (run: Run) => ofType(run, 'ATTEMPT_END').at(-1)!.p as { result: string; penalty: number; wrong: string[]; played: { r: number }[] };
const K6 = ['KS', 'KH', 'KD', 'KC', '8S', '8H'];

describe('§3.1 setup (R1–R5)', () => {
  it('R1: needs 2–4 players; 5th join is rejected', () => {
    const run = lobby(1);
    expect(rej(run, 0, { t: 'START' })).toBe('NEED_2_PLAYERS');
    const r4 = lobby(4);
    expect(reduce(r4.s, 'sys', { t: 'SYS_JOIN', seat: 3, name: 'x', characterId: 'mint', lang: 'en' }, r4.rng).ok).toBe(false);
  });
  it('R2: one 52-card deck, values A=1..K=13, no jokers', () => {
    const run = play(2);
    expect(total(run)).toBe(52);
    const all = [...run.s.round!.deck, ...Object.values(run.s.round!.areas).flat().map((x) => x.card!)];
    expect(new Set(all.map((c) => c.r + c.s)).size).toBe(52);
    expect(Math.min(...all.map((c) => c.r))).toBe(1); expect(Math.max(...all.map((c) => c.r))).toBe(13);
  });
  it('R3: cards per player default 6, range 4–8; 4×8 leaves 20 in the deck', () => {
    const run = lobby(4);
    expect(run.s.settings.cardsPerPlayer).toBe(6);
    expect(rej(run, 0, { t: 'HOST_UPDATE_SETTINGS', patch: { cardsPerPlayer: 9 } })).toBe('BAD_CARDS');
    expect(rej(run, 0, { t: 'HOST_UPDATE_SETTINGS', patch: { cardsPerPlayer: 3 } })).toBe('BAD_CARDS');
    const p = play(4, [], [], { cardsPerPlayer: 8 });
    expect(p.s.round!.deck.length).toBe(20);
    expect(rej(run, 1, { t: 'HOST_UPDATE_SETTINGS', patch: { cardsPerPlayer: 5 } })).toBe('NOT_HOST');
  });
  it('R4/§7.2: default layouts 4→2×2, 5→3+2, 6→2×3, 7→4+3, 8→2×4', () => {
    const rows = (n: number) => [0, 1].map((r) => initialGrid(n).filter((g) => g.row === r).length);
    expect(rows(4)).toEqual([2, 2]); expect(rows(5)).toEqual([3, 2]); expect(rows(6)).toEqual([3, 3]); expect(rows(7)).toEqual([4, 3]); expect(rows(8)).toEqual([4, 4]);
  });
  it('R5/Q18: each player peeks exactly 2 chosen cards; a 3rd is rejected; done needs 2; peek visible only to owner during PEEK', () => {
    const run = lobby(2, { test: true });
    act(run, 0, { t: 'START' });
    run.s.test.forcedDice = [6, 1];
    act(run, 0, { t: 'ROLL_DIE' }); act(run, 1, { t: 'ROLL_DIE' });
    expect(run.s.phase).toBe('PEEK');
    act(run, 0, { t: 'PEEK_PICK', slot: sid(0, 3) });
    expect(rej(run, 0, { t: 'PEEK_DONE' })).toBe('PICK_2');
    expect(rej(run, 0, { t: 'PEEK_PICK', slot: sid(0, 3) })).toBe('ALREADY_PICKED');
    expect(rej(run, 0, { t: 'PEEK_PICK', slot: sid(1, 1) })).toBe('NOT_YOUR_SLOT');
    act(run, 0, { t: 'PEEK_PICK', slot: sid(0, 5) });
    expect(rej(run, 0, { t: 'PEEK_PICK', slot: sid(0, 1) })).toBe('PEEK_LIMIT');
    const v0 = projectView(run.s, 0), v1 = projectView(run.s, 1);
    expect(v0.round!.areas[0]!.filter((x) => x.face).map((x) => x.id)).toEqual([sid(0, 3), sid(0, 5)]);
    expect(v1.round!.areas[0]!.some((x) => x.face)).toBe(false);
    act(run, 0, { t: 'PEEK_DONE' });
    expect(projectView(run.s, 0).round!.areas[0]!.some((x) => x.face)).toBe(false); // back face down
    act(run, 1, { t: 'PEEK_PICK', slot: sid(1, 1) }); act(run, 1, { t: 'PEEK_PICK', slot: sid(1, 2) }); act(run, 1, { t: 'PEEK_DONE' });
    expect(run.s.phase).toBe('PLAY');
  });
});

describe('§4.5 starting player (R6, Q3)', () => {
  it('forced dice 6, 6, 3 → only seats 1 and 2 re-roll; highest then starts', () => {
    const run = lobby(3, { test: true });
    act(run, 0, { t: 'START' });
    run.s.test.forcedDice = [6, 6, 3, 2, 5];
    act(run, 0, { t: 'ROLL_DIE' }); act(run, 1, { t: 'ROLL_DIE' });
    expect(run.s.phase).toBe('START_ROLL');
    act(run, 2, { t: 'ROLL_DIE' });
    expect(run.s.roll!.rollers).toEqual([0, 1]);
    expect(rej(run, 2, { t: 'ROLL_DIE' })).toBe('NOT_ROLLER');
    act(run, 0, { t: 'ROLL_DIE' }); act(run, 1, { t: 'ROLL_DIE' });
    expect(run.s.round!.starter).toBe(1);
    expect(run.s.round!.current).toBe(1);
    expect(ofType(run, 'DICE_ROLLED').map((e) => e.p.tied ?? e.p.starter)).toEqual([[0, 1], 1]);
  });
  it('rolls are hidden until everyone rolled; a die cannot be rolled twice', () => {
    const run = lobby(2);
    act(run, 0, { t: 'START' });
    act(run, 0, { t: 'ROLL_DIE' });
    expect(rej(run, 0, { t: 'ROLL_DIE' })).toBe('ALREADY_ROLLED');
    const v = projectView(run.s, 1);
    expect(JSON.stringify(v.roll)).not.toContain('pending');
    expect(v.roll!.rolled).toEqual([0]);
  });
  it('round 2 starts with the round-1 winner; a rematch rolls again; turns go clockwise from the starter', () => {
    const run = play(3, [['5S'], ['KS', 'KH', 'KD', 'KC'], ['QS', 'QH', 'QD', 'QC']], ['5H']);
    expect(run.s.round!.current).toBe(0);
    drawThrow(run);
    expect(run.s.round!.current).toBe(1);
    act(run, 0, { t: 'CLAIM_MATCH' }); act(run, 0, { t: 'FLIP', slot: sid(0, 1) });
    expect(run.s.phase).toBe('ROUND_END');
    expect(run.s.round!.result!.winner).toBe(0);
    for (const p of [0, 1, 2]) act(run, p, { t: 'NEXT_ROUND' });
    expect(run.s.round!.starter).toBe(0);
    expect(run.s.round!.starterReason).toBe('lastWinner');
    act(run, 0, { t: 'HOST_END_GAME' });
    act(run, 0, { t: 'REMATCH' });
    expect(run.s.phase).toBe('START_ROLL');
  });
});

describe('§3.2 turn (R7, R8)', () => {
  it('only the current player draws; the drawn card is visible only to him; throw or blind swap', () => {
    const run = play(2, [['2S', '3S', '4S', '5S', '6S', '7S']], ['9H', '8D']);
    expect(rej(run, 1, { t: 'DRAW' })).toBe('NOT_YOUR_TURN');
    act(run, 0, { t: 'DRAW' });
    expect(projectView(run.s, 0).round!.drawn!.face).toEqual({ r: 9, s: 'H' });
    expect(projectView(run.s, 1).round!.drawn!.face).toBeUndefined();
    expect(JSON.stringify(projectView(run.s, 1))).not.toContain('"r":9,"s":"H"');
    expect(rej(run, 0, { t: 'DRAW' })).toBe('ALREADY_DREW');
    expect(rej(run, 1, { t: 'CLAIM_MATCH' })).toBe('TOO_LATE'); // E25: nobody acts during DECIDE
    act(run, 0, { t: 'SWAP', slot: sid(0, 3) });
    expect(run.s.round!.discard.at(-1)).toMatchObject({ r: 4, s: 'S' });
    expect(run.s.round!.areas[0]![2]!.card).toMatchObject({ r: 9, s: 'H' });
    expect(run.s.round!.window!.target).toBe(4);
    expect(run.s.round!.current).toBe(1);
    // the drawer knows the swapped-in card, the other does not
    const id = run.s.round!.areas[0]![2]!.card!.id;
    expect(run.s.round!.knowledge[id]).toEqual([0]);
    expect(projectView(run.s, 0).round!.areas[0]![2]!.face).toBeUndefined(); // not re-sent (§11.2.3)
    act(run, 1, { t: 'DRAW' }); act(run, 1, { t: 'THROW' });
    expect(run.s.round!.window!.target).toBe(8);
    expect(total(run)).toBe(52);
  });
  it('E27: swapping into an empty gap is rejected', () => {
    const run = play(2, [['2S', '3S', '4S']], ['9H']);
    act(run, 0, { t: 'DRAW' });
    expect(rej(run, 0, { t: 'SWAP', slot: sid(0, 5) })).toBe('EMPTY_SLOT');
    expect(rej(run, 0, { t: 'SWAP', slot: sid(1, 1) })).toBe('NOT_YOUR_SLOT');
  });
});

describe('§3.6 match attempts: Ammar\'s examples (R14–R20)', () => {
  it('v0.7 Ammar\'s example: T=13: 7, 2, 5 (14, over), turn the 2 back, 1 → Done: 7+5+1 played; the 2 was wrong → +2', () => {
    const run = play(2, [['7S', '2H', '5C', 'AD', 'KS', 'KH']], ['KC']); run.autoDone = false;
    drawThrow(run); skipPower(run);
    act(run, 0, { t: 'CLAIM_MATCH' });
    for (const n of [1, 2, 3]) act(run, 0, { t: 'FLIP', slot: sid(0, n) });
    // all three stay face up for everyone; nothing is judged yet
    expect(projectView(run.s, 1).round!.areas[0]!.slice(0, 3).map((x) => x.face?.r)).toEqual([7, 2, 5]);
    expect(projectView(run.s, 1).round!.active).toMatchObject({ sum: 14, penaltyDue: 0 });
    expect(rej(run, 0, { t: 'SUBMIT_MATCH' })).toBe('NOT_TARGET');
    act(run, 0, { t: 'REMOVE_TENTATIVE', slot: sid(0, 2) });
    expect(projectView(run.s, 1).round!.areas[0]![1]!.face).toBeFalsy(); // turned back down, still in its spot
    expect(projectView(run.s, 1).round!.active).toMatchObject({ sum: 12, penaltyDue: 2 });
    act(run, 0, { t: 'FLIP', slot: sid(0, 4) });
    expect(run.s.round!.active?.k).toBe('attempt'); // exact, but nothing happens until Done
    expect(ofType(run, 'ATTEMPT_END').length).toBe(0);
    act(run, 0, { t: 'SUBMIT_MATCH' });
    expect(lastEnd(run)).toMatchObject({ result: 'complete', penalty: 2 });
    expect(lastEnd(run).played.map((c) => c.r).sort((a, b) => a - b)).toEqual([1, 5, 7]);
    expect(count(run, 0)).toBe(6 - 3 + 2);
    expect(run.ev.findIndex((e) => e.t === 'PENALTY_DEALT')).toBeGreaterThan(run.ev.findIndex((e) => e.t === 'ATTEMPT_END'));
    expect(total(run)).toBe(52);
  });
  it('v0.7: a turned-back card flipped again and used in the final set is not wrong', () => {
    const run = play(2, [['7S', '5H', '9C', 'KD', 'KS', 'KH']], ['QC']); run.autoDone = false;
    drawThrow(run); skipPower(run);
    act(run, 0, { t: 'CLAIM_MATCH' });
    act(run, 0, { t: 'FLIP', slot: sid(0, 1) }); act(run, 0, { t: 'REMOVE_TENTATIVE', slot: sid(0, 1) });
    expect(projectView(run.s, 1).round!.active).toMatchObject({ penaltyDue: 2 });
    act(run, 0, { t: 'FLIP', slot: sid(0, 1) }); act(run, 0, { t: 'FLIP', slot: sid(0, 2) });
    expect(projectView(run.s, 1).round!.active).toMatchObject({ sum: 12, penaltyDue: 0 });
    act(run, 0, { t: 'SUBMIT_MATCH' });
    expect(lastEnd(run)).toMatchObject({ result: 'complete', penalty: 0 });
  });
  it('v0.7: many flips, Done on 3 of them → the other flipped cards are wrong (+2 each), dealt only after the attempt', () => {
    const run = play(2, [['7S', '8H', '9C', 'KD', '3S', '2H']], ['QC']); run.autoDone = false;
    drawThrow(run); skipPower(run);
    act(run, 0, { t: 'CLAIM_MATCH' });
    for (const n of [1, 2]) act(run, 0, { t: 'FLIP', slot: sid(0, n) });
    act(run, 0, { t: 'REMOVE_TENTATIVE', slot: sid(0, 2) });
    act(run, 0, { t: 'FLIP', slot: sid(0, 3) }); act(run, 0, { t: 'REMOVE_TENTATIVE', slot: sid(0, 3) });
    act(run, 0, { t: 'FLIP', slot: sid(0, 4) }); act(run, 0, { t: 'REMOVE_TENTATIVE', slot: sid(0, 4) });
    act(run, 0, { t: 'FLIP', slot: sid(0, 5) }); act(run, 0, { t: 'FLIP', slot: sid(0, 6) });
    expect(attempt(run).wrong.length).toBe(3);
    expect(ofType(run, 'PENALTY_DEALT').length).toBe(0);
    act(run, 0, { t: 'SUBMIT_MATCH' });
    const end = lastEnd(run);
    expect(end).toMatchObject({ result: 'complete', penalty: 6 });
    expect(end.played.map((c) => c.r).sort((a, b) => a - b)).toEqual([2, 3, 7]);
    expect(count(run, 0)).toBe(6 - 3 + 6);
    expect(total(run)).toBe(52);
  });
  it('T=12: 7, 3, 4, give up → 3 wrong → +6; all three back face down in their own slots', () => {
    const run = play(2, [['7S', '3H', '4C', 'KD', 'KS', 'KH']], ['QC']); run.autoDone = false;
    drawThrow(run); skipPower(run);
    act(run, 0, { t: 'CLAIM_MATCH' });
    for (const n of [1, 2, 3]) act(run, 0, { t: 'FLIP', slot: sid(0, n) });
    act(run, 0, { t: 'GIVE_UP' });
    expect(lastEnd(run)).toMatchObject({ result: 'giveUp', penalty: 6 });
    expect(run.s.round!.areas[0]!.slice(0, 3).map((x) => x.card!.r)).toEqual([7, 3, 4]);
    expect(projectView(run.s, 1).round!.areas[0]!.slice(0, 3).every((x) => !x.face)).toBe(true);
    expect(count(run, 0)).toBe(12);
  });
  it('T=9: flip a 9, Done → complete, no penalty. T=9: flip a K, give up → +2', () => {
    const a = play(2, [['9S', 'KH', '2C', '3D', '4S', '6H']], ['9C']); a.autoDone = false;
    drawThrow(a); act(a, 0, { t: 'CLAIM_MATCH' }); act(a, 0, { t: 'FLIP', slot: sid(0, 1) }); act(a, 0, { t: 'SUBMIT_MATCH' });
    expect(lastEnd(a)).toMatchObject({ result: 'complete', penalty: 0 });
    const b = play(2, [['KS', '9H', '2C', '3D', '4S', '6H']], ['9C']);
    drawThrow(b); act(b, 0, { t: 'CLAIM_MATCH' }); act(b, 0, { t: 'FLIP', slot: sid(0, 1) }); act(b, 0, { t: 'GIVE_UP' });
    expect(lastEnd(b)).toMatchObject({ result: 'giveUp', penalty: 2 });
  });
  it('v0.7: nothing ever closes on its own — every card face up on a wrong sum keeps the attempt open', () => {
    const run = play(2, [['5S', '2H', 'AC']], ['9C']); run.autoDone = false;
    drawThrow(run); act(run, 0, { t: 'CLAIM_MATCH' });
    for (const n of [1, 2, 3]) act(run, 0, { t: 'FLIP', slot: sid(0, n) });
    expect(run.s.round!.active?.k).toBe('attempt');
    expect(rej(run, 0, { t: 'SUBMIT_MATCH' })).toBe('NOT_TARGET');
    act(run, 0, { t: 'GIVE_UP' });
    expect(lastEnd(run)).toMatchObject({ result: 'giveUp', penalty: 6 });
  });
  it('v0.7: Done with nothing face up is rejected; Stop before any flip is free', () => {
    const run = play(2, [['5S', '2H', 'AC']], ['9C']); run.autoDone = false;
    drawThrow(run); act(run, 0, { t: 'CLAIM_MATCH' });
    expect(rej(run, 0, { t: 'SUBMIT_MATCH' })).toBe('NOTHING_UP');
    act(run, 0, { t: 'GIVE_UP' });
    expect(run.s.round!.active).toBeNull(); expect(count(run, 0)).toBe(3);
  });
  it('Q8: T=9 trying 4+5: flip the 5, give up → only flipped cards count → +2', () => {
    const run = play(2, [['5S', '4H', ...K6.slice(0, 4)]], ['9C']);
    drawThrow(run); act(run, 0, { t: 'CLAIM_MATCH' }); act(run, 0, { t: 'FLIP', slot: sid(0, 1) }); act(run, 0, { t: 'GIVE_UP' });
    expect(lastEnd(run).penalty).toBe(2);
  });
  it('E16/E29: a face-up card cannot be flipped again; a flipped card counts once', () => {
    const run = play(2, [['KS', '9H', '2C', '3D', '4S', '6H']], ['9C']);
    drawThrow(run); act(run, 0, { t: 'CLAIM_MATCH' }); act(run, 0, { t: 'FLIP', slot: sid(0, 1) });
    expect(rej(run, 0, { t: 'FLIP', slot: sid(0, 1) })).toBe('ALREADY_UP');
    expect(rej(run, 0, { t: 'FLIP', slot: sid(1, 1) })).toBe('NOT_YOUR_SLOT');
    act(run, 0, { t: 'GIVE_UP' });
    expect(lastEnd(run).penalty).toBe(2);
  });
  it('E15/Q26: cancel before the first flip is free; after a flip cancel is rejected', () => {
    const run = play(2, [['KS', '9H', '2C', '3D', '4S', '6H']], ['9C']);
    drawThrow(run); act(run, 1, { t: 'CLAIM_MATCH' });
    act(run, 1, { t: 'CANCEL_CLAIM' });
    expect(run.s.round!.active).toBeNull(); expect(count(run, 1)).toBe(6);
    act(run, 0, { t: 'CLAIM_MATCH' }); act(run, 0, { t: 'FLIP', slot: sid(0, 1) });
    expect(rej(run, 0, { t: 'CANCEL_CLAIM' })).toBe('ALREADY_FLIPPED');
  });
  it('R16: flipped cards are revealed to everyone', () => {
    const run = play(2, [['KS', '2H', '2C', '3D', '4S', '6H']], ['9C']);
    drawThrow(run); act(run, 0, { t: 'CLAIM_MATCH' }); act(run, 0, { t: 'FLIP', slot: sid(0, 2) });
    expect(projectView(run.s, 1).round!.areas[0]![1]!.face).toEqual({ r: 2, s: 'H' });
  });
});

describe('§5 windows, claims and the finish rule', () => {
  it('Q7/E36: one player matches the same throw twice (a 9, then 5+4)', () => {
    const run = play(2, [['9S', '5H', '4C', 'KD', 'KS', 'KH']], ['9C']);
    drawThrow(run);
    act(run, 0, { t: 'CLAIM_MATCH' }); act(run, 0, { t: 'FLIP', slot: sid(0, 1) });
    act(run, 0, { t: 'CLAIM_MATCH' }); act(run, 0, { t: 'FLIP', slot: sid(0, 2) }); act(run, 0, { t: 'FLIP', slot: sid(0, 3) });
    expect(ofType(run, 'ATTEMPT_END').map((e) => e.p.result)).toEqual(['complete', 'complete']);
    expect(count(run, 0)).toBe(3);
  });
  it('R15: matches stack; all target the trigger value (9 then 5+4 by another player)', () => {
    const run = play(2, [['9S', ...K6.slice(0, 5)], ['5H', '4C', ...K6.slice(0, 4)]], ['9C']);
    drawThrow(run);
    act(run, 0, { t: 'CLAIM_MATCH' }); act(run, 1, { t: 'CLAIM_MATCH' });
    expect(run.s.round!.queue).toEqual([{ k: 'claim', seat: 1 }]);
    expect(rej(run, 1, { t: 'CLAIM_MATCH' })).toBe('ALREADY_QUEUED');
    act(run, 0, { t: 'FLIP', slot: sid(0, 1) });
    expect(attempt(run).seat).toBe(1); expect(attempt(run).target).toBe(9);
    act(run, 1, { t: 'FLIP', slot: sid(1, 1) }); act(run, 1, { t: 'FLIP', slot: sid(1, 2) });
    expect(lastEnd(run).result).toBe('complete');
  });
  it('claim order: server arrival order, no turn-player head start; a queued claim can be cancelled', () => {
    const run = play(3, [['9S', ...K6.slice(0, 5)], ['9H', ...K6.slice(0, 5)], ['9D', ...K6.slice(0, 5)]], ['9C']);
    drawThrow(run);
    act(run, 2, { t: 'CLAIM_MATCH' }); act(run, 0, { t: 'CLAIM_MATCH' }); act(run, 1, { t: 'CLAIM_MATCH' });
    expect(attempt(run).seat).toBe(2);
    expect(run.s.round!.queue.map((q) => (q as { seat: number }).seat)).toEqual([0, 1]);
    act(run, 1, { t: 'CANCEL_CLAIM' });
    expect(run.s.round!.queue.length).toBe(1);
  });
  it('§5.4: the next player cannot draw while a claim is pending; draw closes the window; late claims are "Too late" (R15b)', () => {
    const run = play(2, [['9S', ...K6.slice(0, 5)], ['9H', ...K6.slice(0, 5)]], ['9C', '9D']);
    drawThrow(run);
    act(run, 0, { t: 'CLAIM_MATCH' });
    expect(rej(run, 1, { t: 'DRAW' })).toBe('SOMEONE_MATCHING');
    act(run, 0, { t: 'CANCEL_CLAIM' });
    act(run, 1, { t: 'DRAW' });
    expect(run.s.round!.window).toBeNull();
    expect(rej(run, 0, { t: 'CLAIM_MATCH' })).toBe('TOO_LATE');
    act(run, 1, { t: 'THROW' });
    expect(run.s.round!.window!.target).toBe(9); // a new target begins with the next throw
  });
  it('§5.3 finish rule: X empties first → FINISH_PENDING; C tries and empties → C wins', () => {
    const run = play(2, [['7S'], ['7H']], ['7C']);
    drawThrow(run);
    act(run, 1, { t: 'CLAIM_MATCH' }); act(run, 1, { t: 'FLIP', slot: sid(1, 1) });
    expect(run.s.round!.active).toEqual({ k: 'finish', finisher: 1, turnPlayer: 0 });
    expect(run.s.phase).toBe('PLAY');
    expect(rej(run, 1, { t: 'FINISH_TRY' })).toBe('NOT_YOUR_CHOICE');
    expect(rej(run, 1, { t: 'CLAIM_MATCH' })).toBe('FINISH_PENDING');
    act(run, 0, { t: 'FINISH_TRY' }); act(run, 0, { t: 'FLIP', slot: sid(0, 1) });
    expect(run.s.round!.result).toMatchObject({ winner: 0, reason: 'finishRule' });
    expect(run.s.scores).toEqual({ 0: 1, 1: 0 });
  });
  it('§5.3: C tries and fails (a 6) → X wins; no penalty cards; C lets X win → X wins', () => {
    const a = play(2, [['6S'], ['7H']], ['7C']);
    drawThrow(a); act(a, 1, { t: 'CLAIM_MATCH' }); act(a, 1, { t: 'FLIP', slot: sid(1, 1) });
    act(a, 0, { t: 'FINISH_TRY' }); act(a, 0, { t: 'FLIP', slot: sid(0, 1) }); act(a, 0, { t: 'GIVE_UP' });
    expect(a.s.round!.result!.winner).toBe(1);
    expect(ofType(a, 'PENALTY_DEALT').length).toBe(0);
    const b = play(2, [['6S'], ['7H']], ['7C']);
    drawThrow(b); act(b, 1, { t: 'CLAIM_MATCH' }); act(b, 1, { t: 'FLIP', slot: sid(1, 1) });
    act(b, 0, { t: 'FINISH_LET_WIN' });
    expect(b.s.round!.result).toMatchObject({ winner: 1, reason: 'letWin' });
  });
  it('§5.3: C completes but keeps cards → X wins', () => {
    const run = play(2, [['7S', '3D'], ['7H']], ['7C']);
    drawThrow(run); act(run, 1, { t: 'CLAIM_MATCH' }); act(run, 1, { t: 'FLIP', slot: sid(1, 1) });
    act(run, 0, { t: 'FINISH_TRY' }); act(run, 0, { t: 'FLIP', slot: sid(0, 1) });
    expect(run.s.round!.result!.winner).toBe(1);
  });
  it('E6: if the turn player empties his own area he wins at once', () => {
    const run = play(2, [['7S']], ['7C']);
    drawThrow(run); act(run, 0, { t: 'CLAIM_MATCH' }); act(run, 0, { t: 'FLIP', slot: sid(0, 1) });
    expect(run.s.round!.result).toMatchObject({ winner: 0, reason: 'empty' });
  });
  it('R25 + E3: P3 holds only a J; P1 throws a J → P1 Jack power runs first, then P3 matches; P3\'s own Jack power is discarded; queued claims dropped (E17)', () => {
    const run = play(3, [['4S', '5H', '8C'], ['KD', 'KS'], ['JD']], ['JC']);
    drawThrow(run);
    act(run, 2, { t: 'CLAIM_MATCH' }); act(run, 1, { t: 'CLAIM_MATCH' });
    expect(run.s.round!.active).toMatchObject({ k: 'power', owner: 0, power: 'J' });
    act(run, 0, { t: 'JACK_SKIP' });
    act(run, 2, { t: 'FLIP', slot: sid(2, 1) });
    expect(run.s.round!.active).toEqual({ k: 'finish', finisher: 2, turnPlayer: 0 });
    expect(run.s.round!.queue).toEqual([]); // P3's J power and P2's claim discarded
    act(run, 0, { t: 'FINISH_LET_WIN' });
    expect(run.s.round!.result!.winner).toBe(2);
  });
  it('§5.4: draw is allowed while nothing is pending, with no timers', () => {
    const run = play(2, [], ['9C', '8C']);
    drawThrow(run);
    act(run, 1, { t: 'DRAW' });
    expect(run.s.round!.drawn).toBeTruthy();
  });
});

describe('§6 powers (R9–R13, R22)', () => {
  it('R10/Q10/E11/E35: Jack swaps any two face-down cards: own+opponent, two of the same player; skip allowed', () => {
    const run = play(2, [['2S', '3S', '4S', '5S', '6S', '7S'], ['2H', '3H', '4H', '5H', '6H', '7H']], ['JC', 'JD']);
    drawThrow(run);
    expect(run.s.round!.active).toMatchObject({ k: 'power', power: 'J', owner: 0 });
    expect(rej(run, 1, { t: 'JACK_SWAP', a: sid(0, 1), b: sid(1, 1) })).toBe('NO_JACK');
    expect(rej(run, 0, { t: 'JACK_SWAP', a: sid(0, 1), b: sid(0, 1) })).toBe('SAME_SLOT');
    act(run, 0, { t: 'JACK_SWAP', a: sid(0, 1), b: sid(1, 1) });
    expect(run.s.round!.areas[0]![0]!.card).toMatchObject({ r: 2, s: 'H' });
    // knowledge follows the card: seat 1 had peeked 2H in its slot 1; it now sits in seat 0's slot 1
    expect(projectView(run.s, 1, { helper: 'full' }).round!.areas[0]![0]!.ghost).toEqual({ r: 2, s: 'H' });
    act(run, 1, { t: 'DRAW' }); act(run, 1, { t: 'THROW' });
    act(run, 1, { t: 'JACK_SWAP', a: sid(0, 2), b: sid(0, 3) });
    expect(run.s.round!.areas[0]![1]!.card!.r).toBe(4);
  });
  it('Jack: two other opponents\' cards (3 players); skip', () => {
    const run = play(3, [], ['JC']);
    drawThrow(run);
    act(run, 0, { t: 'JACK_SWAP', a: sid(1, 2), b: sid(2, 5) });
    expect(ofType(run, 'JACK_SWAPPED')[0]!.p).toMatchObject({ ownerA: 1, ownerB: 2 });
    const r2 = play(3, [], ['JC']); drawThrow(r2); act(r2, 0, { t: 'JACK_SKIP' });
    expect(r2.s.round!.active).toBeNull();
  });
  it('R11/Q11: Queen peeks one card privately; skip needs a second confirm', () => {
    const run = play(2, [[], ['8H', '2C']], ['QC']);
    drawThrow(run);
    expect(rej(run, 0, { t: 'QUEEN_SKIP' })).toBe('CONFIRM_REQUIRED');
    act(run, 0, { t: 'QUEEN_PEEK', slot: sid(1, 1) });
    expect(projectView(run.s, 0).round!.areas[1]![0]!.face).toEqual({ r: 8, s: 'H' });
    expect(projectView(run.s, 1).round!.areas[1]![0]!.face).toBeUndefined();
    expect(rej(run, 0, { t: 'QUEEN_PEEK', slot: sid(1, 2) })).toBe('ALREADY_PEEKED');
    act(run, 0, { t: 'QUEEN_DONE' });
    expect(projectView(run.s, 0).round!.areas[1]![0]!.face).toBeUndefined(); // wiped after the peek
    const b = play(2, [], ['QC']); drawThrow(b); act(b, 0, { t: 'QUEEN_SKIP', confirm: true });
    expect(b.s.round!.active).toBeNull();
  });
  it('R13: a 10 with 2 players gives the card automatically; no skip intent exists', () => {
    const run = play(2, [], ['10C']);
    drawThrow(run);
    expect(run.s.round!.active).toBeNull();
    expect(count(run, 1)).toBe(7);
    expect(ofType(run, 'TEN_GIVEN')[0]!.p).toMatchObject({ owner: 0, to: 1 });
    expect(run.s.round!.knowledge[run.s.round!.areas[1]!.at(-1)!.card!.id]).toEqual([]); // unseen by everyone
  });
  it('R13: with 3 players the thrower must choose an opponent (mandatory)', () => {
    const run = play(3, [], ['10C']);
    drawThrow(run);
    expect(run.s.round!.active).toMatchObject({ power: '10' });
    expect(rej(run, 0, { t: 'TEN_GIVE', to: 0 })).toBe('BAD_TARGET');
    expect(rej(run, 0, { t: 'JACK_SKIP' })).toBe('NO_JACK');
    expect(rej(run, 0, { t: 'QUEEN_SKIP', confirm: true })).toBe('NO_QUEEN');
    expect(rej(run, 1, { t: 'DRAW' })).toBe('PENDING');
    act(run, 0, { t: 'TEN_GIVE', to: 2 });
    expect(count(run, 2)).toBe(7);
  });
  it('R9: a power triggers for a swapped-out card too', () => {
    const run = play(2, [['QS']], ['5C']);
    act(run, 0, { t: 'DRAW' }); act(run, 0, { t: 'SWAP', slot: sid(0, 1) });
    expect(run.s.round!.active).toMatchObject({ power: 'Q', owner: 0 });
  });
  it('R22/E13: a King matched with J+2 gives the matcher a Jack power', () => {
    const run = play(2, [[], ['JS', '2H', '8C', '9D']], ['KC']);
    drawThrow(run);
    act(run, 1, { t: 'CLAIM_MATCH' }); act(run, 1, { t: 'FLIP', slot: sid(1, 1) }); act(run, 1, { t: 'FLIP', slot: sid(1, 2) });
    expect(run.s.round!.active).toMatchObject({ k: 'power', power: 'J', owner: 1 });
  });
  it('§5.6: a Jack thrown (2 players), matched by a Jack → two Jack powers in landing order; powers run before queued claims', () => {
    const run = play(2, [[], ['JS', '4H', '5C']], ['JC']);
    drawThrow(run);
    act(run, 1, { t: 'CLAIM_MATCH' });
    expect(run.s.round!.active).toMatchObject({ power: 'J', owner: 0 });
    act(run, 0, { t: 'JACK_SKIP' });
    act(run, 1, { t: 'FLIP', slot: sid(1, 1) });
    expect(run.s.round!.active).toMatchObject({ power: 'J', owner: 1 });
  });
  it('§5.6.5: a 10 matched by a 10 (3 players) → both powers in landing order; a power ranks ahead of queued claims', () => {
    const run = play(3, [[], ['10S', '4H'], ['9D', '2S']], ['10C']);
    drawThrow(run);
    act(run, 2, { t: 'CLAIM_MATCH' }); act(run, 1, { t: 'CLAIM_MATCH' });
    act(run, 0, { t: 'TEN_GIVE', to: 2 });
    expect(attempt(run).seat).toBe(2);
    act(run, 2, { t: 'CANCEL_CLAIM' });
    act(run, 1, { t: 'FLIP', slot: sid(1, 1) });
    expect(run.s.round!.active).toMatchObject({ power: '10', owner: 1 });
  });
  it('§3.7: at most one J/Q/10 per combination (sums exceed 13)', () => {
    for (const [a, b] of [[11, 12], [11, 10], [12, 10]]) expect(a! + b!).toBeGreaterThan(13);
  });
  it('E14: an Ace can only be matched by a single Ace', () => {
    const run = play(2, [['AS', '2H']], ['AC']);
    drawThrow(run); act(run, 0, { t: 'CLAIM_MATCH' });
    expect(act(run, 0, { t: 'FLIP', slot: sid(0, 2) })[0]!.p.over).toBe(true); // 2 overshoots 1
    act(run, 0, { t: 'REMOVE_TENTATIVE', slot: sid(0, 2) });
    act(run, 0, { t: 'FLIP', slot: sid(0, 1) });
    expect(lastEnd(run)).toMatchObject({ result: 'complete', penalty: 2 });
  });
});

describe('§7 placement and reshuffle (R27, Q12, Q13, Q25)', () => {
  it('Q12: penalties fill gaps first in reading order, then a random row end; a new row when all rows are full', () => {
    const run = play(2, [['6S', '6H', '9C', 'KD', 'QS', 'QH']], ['QC']);
    drawThrow(run); skipPower(run);
    act(run, 0, { t: 'CLAIM_MATCH' }); act(run, 0, { t: 'FLIP', slot: sid(0, 1) }); act(run, 0, { t: 'FLIP', slot: sid(0, 2) });
    expect(run.s.round!.areas[0]![0]!.card).toBeNull();
    act(run, 0, { t: 'CLAIM_MATCH' }); act(run, 0, { t: 'FLIP', slot: sid(0, 3) }); act(run, 0, { t: 'FLIP', slot: sid(0, 4) }); act(run, 0, { t: 'GIVE_UP' });
    const slots = (ofType(run, 'PENALTY_DEALT').at(-1)!.p.slots as { id: string; row: number }[]);
    expect(slots.slice(0, 2).map((x) => x.id)).toEqual([sid(0, 1), sid(0, 2)]);
    expect(slots.slice(2).every((x) => x.row === 0 || x.row === 1)).toBe(true);
    expect(slots[2]!.id).toBe(sid(0, 7));
    // full rows → new row
    const r = run.s.round!;
    const rng = new SeededRng(1);
    for (let i = 0; i < 20; i++) placeCard(r, 0, r.deck.shift()!, rng);
    const rowLens = [0, 1, 2, 3, 4].map((row) => r.areas[0]!.filter((x) => x.row === row).length);
    expect(Math.max(...rowLens)).toBeLessThanOrEqual(6);
    expect(rowLens[2]! + rowLens[3]!).toBeGreaterThan(0);
    expect(new Set(r.areas[0]!.map((x) => x.id)).size).toBe(r.areas[0]!.length); // slot ids stable & unique
  });
  it('remaining cards never shift when a card leaves (gaps stay)', () => {
    const run = play(2, [['9S', '5H', '4C', 'KD', 'KS', 'KH']], ['9C']);
    const before = run.s.round!.areas[0]!.map((x) => `${x.id}@${x.row},${x.col}`);
    drawThrow(run); act(run, 0, { t: 'CLAIM_MATCH' }); act(run, 0, { t: 'FLIP', slot: sid(0, 1) });
    expect(run.s.round!.areas[0]!.map((x) => `${x.id}@${x.row},${x.col}`)).toEqual(before);
  });
  it('R27/E7: reshuffle only when the deck is empty; keeps the target and open-match cards on the pile', () => {
    const run = play(2, [['9S', '5H', '4C', 'KD', 'KS', 'KH'], ['8S', '2H', '3C', '6D', '7S', '7H']], ['9C']);
    drawThrow(run);
    act(run, 0, { t: 'CLAIM_MATCH' }); act(run, 0, { t: 'FLIP', slot: sid(0, 1) });
    const r = run.s.round!;
    // empty the deck by moving all of it to the pile
    r.discard.unshift(...r.deck.splice(0)); r.deck = [];
    expect(r.deck.length).toBe(0);
    act(run, 0, { t: 'CLAIM_MATCH' }); act(run, 0, { t: 'FLIP', slot: sid(0, 4) }); act(run, 0, { t: 'GIVE_UP' }); // +2 penalty needs cards
    const rs = ofType(run, 'RESHUFFLED');
    expect(rs.length).toBe(1);
    expect(run.s.round!.discard.map((c) => c.r + c.s)).toEqual(['9C', '9S']); // target + open match kept
    expect(total(run)).toBe(52);
  });
  it('E9/E10: truly no cards anywhere → the round ends with no winner; next round repeats the starter', () => {
    const run = play(2, [], ['9C']);
    const r = run.s.round!;
    // move every deck card into player 1's area as extra slots
    while (r.deck.length) placeCard(r, 1, r.deck.shift()!, run.rng);
    act(run, 0, { t: 'DRAW' }); // deck empty, pile empty → no card at all
    expect(run.s.phase).toBe('ROUND_END');
    expect(run.s.round!.result).toMatchObject({ winner: null, reason: 'noCards' });
    expect(run.s.scores).toEqual({ 0: 0, 1: 0 });
    act(run, 0, { t: 'NEXT_ROUND' }); act(run, 1, { t: 'NEXT_ROUND' });
    expect(run.s.round!.starter).toBe(0); expect(run.s.round!.starterReason).toBe('repeat');
  });
  it('E9 last resort: the kept target cards are reshuffled too when nothing else exists', () => {
    const run = play(2, [[], ['2S', '3S', '4S', '5S', '6S', '7S']], ['9C']);
    drawThrow(run);
    const r = run.s.round!;
    while (r.deck.length) placeCard(r, 1, r.deck.shift()!, run.rng);
    act(run, 1, { t: 'CLAIM_MATCH' }); act(run, 1, { t: 'FLIP', slot: sid(1, 1) }); act(run, 1, { t: 'GIVE_UP' });
    expect(ofType(run, 'RESHUFFLED')[0]!.p.lastResort).toBe(true);
    expect(ofType(run, 'NO_CARDS').length).toBe(1); // only 1 card existed, 2 were due
    expect(run.s.round!.result!.winner).toBeNull();
  });
});

describe('§3.5 scoring and round end (R23, R26, Q16)', () => {
  it('round ends immediately at 0 cards; winner +1; all cards revealed to everyone; match to target points', () => {
    const run = play(2, [['5S'], ['KS', 'KH', 'KD']], ['5H'], { targetPoints: 1 });
    drawThrow(run); act(run, 0, { t: 'CLAIM_MATCH' }); act(run, 0, { t: 'FLIP', slot: sid(0, 1) });
    expect(run.s.phase).toBe('ROUND_END');
    const v1 = projectView(run.s, 1);
    expect(v1.round!.areas[1]!.filter((x) => !x.empty).every((x) => x.face)).toBe(true);
    expect(v1.round!.areas[0]!.every((x) => x.empty || x.face)).toBe(true);
    // fair-shuffle commitment verifies
    const res = run.s.round!.result!;
    expect(sha256Hex(res.deckOrder.join(',') + '|' + res.salt)).toBe(run.s.round!.commitment);
    act(run, 0, { t: 'NEXT_ROUND' }); expect(run.s.phase).toBe('ROUND_END');
    act(run, 1, { t: 'NEXT_ROUND' });
    expect(run.s.phase).toBe('MATCH_END'); expect(run.s.matchWinner).toBe(0);
  });
  it('§3.7: card counts change only through matches, penalties and the 10', () => {
    const run = play(2, [], ['JC']);
    const c0 = count(run, 0), c1 = count(run, 1);
    drawThrow(run); act(run, 0, { t: 'JACK_SWAP', a: sid(0, 1), b: sid(1, 1) });
    expect([count(run, 0), count(run, 1)]).toEqual([c0, c1]);
  });
});

describe('§10.4 pause and wait (v0.6, no timers)', () => {
  function midAttempt() {
    const run = play(3, [['7S', '2H', '9C', '5D', 'KS', 'KH']], ['QC']);
    drawThrow(run); skipPower(run);
    act(run, 0, { t: 'CLAIM_MATCH' }); act(run, 0, { t: 'FLIP', slot: sid(0, 1) }); act(run, 0, { t: 'FLIP', slot: sid(0, 3) });
    act(run, 0, { t: 'REMOVE_TENTATIVE', slot: sid(0, 3) });
    return run;
  }
  it('a drop mid-attempt pauses everyone; every game intent is rejected; nothing changes; rejoin resumes the same attempt', () => {
    const run = midAttempt();
    const before = structuredClone(attempt(run));
    act(run, 'sys', { t: 'SYS_CONNECT', seat: 0, connected: false });
    expect(projectView(run.s, 1).paused).toBe(true);
    expect(projectView(run.s, 1).pausedSeats).toEqual([0]);
    for (const it of [{ t: 'DRAW' }, { t: 'CLAIM_MATCH' }, { t: 'FLIP', slot: sid(0, 2) }, { t: 'GIVE_UP' }] as const) {
      expect(rej(run, it.t === 'FLIP' || it.t === 'GIVE_UP' ? 0 : 1, it as never)).toBe('PAUSED');
    }
    // "hours later": the engine has no timer intents at all; the state is identical
    act(run, 'sys', { t: 'SYS_CONNECT', seat: 0, connected: true });
    expect(attempt(run)).toEqual(before);
    expect(projectView(run.s, 0).round!.active).toMatchObject({ sum: 7, penaltyDue: 2 });
    act(run, 0, { t: 'FLIP', slot: sid(0, 4) });
    expect(lastEnd(run)).toMatchObject({ result: 'complete', penalty: 2 });
  });
  it('host Replace with bot cancels the attempt with 0 penalty; the seat becomes a bot; hand back later', () => {
    const run = midAttempt();
    // host is seat 0 in helpers; hand host to seat 1 so seat 0 can be replaced
    act(run, 0, { t: 'HOST_HANDOVER', seat: 1 });
    act(run, 'sys', { t: 'SYS_CONNECT', seat: 0, connected: false });
    expect(rej(run, 2, { t: 'HOST_REPLACE_WITH_BOT', seat: 0 })).toBe('NOT_HOST');
    act(run, 1, { t: 'HOST_REPLACE_WITH_BOT', seat: 0 });
    expect(run.s.round!.active).toBeNull();
    expect(ofType(run, 'ATTEMPT_CANCELLED').at(-1)!.p).toMatchObject({ seat: 0, why: 'replaced' });
    expect(ofType(run, 'PENALTY_DEALT').length).toBe(0);
    expect(count(run, 0)).toBe(6);
    expect(run.s.seats[0]!.isBot).toBe(true);
    expect(projectView(run.s, 1).paused).toBe(false);
    act(run, 'sys', { t: 'SYS_CONNECT', seat: 0, connected: true });
    act(run, 1, { t: 'HOST_HAND_BACK', seat: 0 });
    expect(run.s.seats[0]!.isBot).toBe(false);
  });
  it('host Remove player: cards to the deck bottom, attempt cancelled without penalty, game continues', () => {
    const run = midAttempt();
    act(run, 0, { t: 'HOST_HANDOVER', seat: 1 });
    act(run, 'sys', { t: 'SYS_CONNECT', seat: 0, connected: false });
    act(run, 1, { t: 'HOST_REMOVE_PLAYER', seat: 0 });
    expect(run.s.round!.participants).toEqual([1, 2]);
    expect(run.s.seats[0]).toBeNull();
    expect(total(run)).toBe(52);
    expect(run.s.round!.current).toBe(1);
    act(run, 1, { t: 'DRAW' });
  });
  it('a pending finish choice of a removed turn player counts as "Let X win" (E41)', () => {
    const run = play(3, [['7S', '3D'], ['7H']], ['7C']);
    drawThrow(run); act(run, 1, { t: 'CLAIM_MATCH' }); act(run, 1, { t: 'FLIP', slot: sid(1, 1) });
    act(run, 0, { t: 'HOST_HANDOVER', seat: 2 });
    act(run, 'sys', { t: 'SYS_CONNECT', seat: 0, connected: false });
    act(run, 2, { t: 'HOST_REMOVE_PLAYER', seat: 0 });
    expect(run.s.round!.result!.winner).toBe(1);
  });
  it('End game ends the match for everyone, marked "Ended by host"; two drops stay paused until both are back', () => {
    const run = midAttempt();
    act(run, 'sys', { t: 'SYS_CONNECT', seat: 1, connected: false });
    act(run, 'sys', { t: 'SYS_CONNECT', seat: 2, connected: false });
    act(run, 'sys', { t: 'SYS_CONNECT', seat: 1, connected: true });
    expect(projectView(run.s, 0).paused).toBe(true);
    act(run, 'sys', { t: 'SYS_CONNECT', seat: 2, connected: true });
    expect(projectView(run.s, 0).paused).toBe(false);
    act(run, 'sys', { t: 'SYS_CONNECT', seat: 2, connected: false });
    act(run, 0, { t: 'HOST_END_GAME' });
    expect(run.s.phase).toBe('MATCH_END'); expect(run.s.endedBy).toBe('host');
  });
  it('E43: a drop in the lobby or on the round-end screen does not pause', () => {
    const run = lobby(2);
    act(run, 'sys', { t: 'SYS_CONNECT', seat: 1, connected: false });
    expect(projectView(run.s, 0).paused).toBe(false);
  });
  it('E44: when the host drops, any connected player may take over host', () => {
    const run = play(2);
    expect(rej(run, 1, { t: 'TAKE_OVER_HOST' })).toBe('HOST_PRESENT');
    act(run, 'sys', { t: 'SYS_CONNECT', seat: 0, connected: false });
    act(run, 1, { t: 'TAKE_OVER_HOST' });
    expect(run.s.host).toBe(1);
  });
  it('E19: disconnect during own DECIDE: continues with the same drawn card on rejoin', () => {
    const run = play(2, [], ['9C']);
    act(run, 0, { t: 'DRAW' });
    act(run, 'sys', { t: 'SYS_CONNECT', seat: 0, connected: false });
    expect(rej(run, 0, { t: 'THROW' })).toBe('PAUSED');
    act(run, 'sys', { t: 'SYS_CONNECT', seat: 0, connected: true });
    expect(projectView(run.s, 0).round!.drawn!.face).toEqual({ r: 9, s: 'C' });
  });
  it('no timers: the engine exposes no timer/timeout intents', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/engine.ts', import.meta.url), 'utf8'));
    expect(src).not.toMatch(/setTimeout|setInterval|Date\.now|TIMEOUT/);
  });
});

describe('lobby, characters and test-room gating', () => {
  it('E38: two players may pick the same character', () => {
    const run = lobby(2);
    act(run, 0, { t: 'PICK_CHARACTER', id: 'mint' }); act(run, 1, { t: 'PICK_CHARACTER', id: 'mint' });
    expect(run.s.seats[0]!.characterId).toBe(run.s.seats[1]!.characterId);
  });
  it('E40: every TEST_* intent is rejected in a normal room; the test flag cannot be switched on', () => {
    const run = lobby(2);
    for (const it of [{ t: 'TEST_REVEAL', on: true }, { t: 'TEST_FORCE_DECK', cards: ['9H'] }, { t: 'TEST_PRESET', id: 'six-flips' }, { t: 'TEST_FORCE_DICE', values: [6] }] as const)
      expect(rej(run, 0, it as never)).toBe('NOT_TEST_ROOM');
    expect(rej(run, 0, { t: 'HOST_UPDATE_SETTINGS', patch: { test: true } })).toBe('TEST_FLAG_FIXED');
  });
  it('test room: forced deck, reveal-all per window, preset application', () => {
    const run = lobby(2, { test: true });
    act(run, 0, { t: 'TEST_FORCE_DECK', cards: ['9H', '5S'] });
    act(run, 0, { t: 'TEST_REVEAL', on: true });
    act(run, 0, { t: 'START' }); act(run, 0, { t: 'ROLL_DIE' }); act(run, 1, { t: 'ROLL_DIE' });
    const starter = run.s.round!.starter;
    expect(run.s.round!.areas[starter]![0]!.card).toMatchObject({ r: 9, s: 'H' });
    expect(projectView(run.s, 0).round!.areas[1]!.every((x) => x.face)).toBe(true);
    expect(projectView(run.s, 1).round!.areas[0]!.some((x) => x.face)).toBe(false);
    const p = lobby(2, { test: true });
    act(p, 0, { t: 'TEST_PRESET', id: 'six-flips' });
    act(p, 0, { t: 'START' }); act(p, 0, { t: 'ROLL_DIE' }); act(p, 1, { t: 'ROLL_DIE' });
    const st = p.s.round!.starter;
    expect(p.s.round!.areas[st]!.map((x) => x.card!.r)).toEqual([7, 8, 9, 13, 3, 2]);
    expect(p.s.round!.deck[0]).toMatchObject({ r: 12, s: 'C' });
    expect(parseFace('10s')).toEqual({ r: 10, s: 'S' });
  });
  it('lobby host tools: add/remove bot, seat move, kick, lock', () => {
    const run = lobby(2);
    act(run, 0, { t: 'HOST_ADD_BOT', level: 'hard' });
    expect(run.s.seats[2]!.isBot).toBe(true);
    act(run, 0, { t: 'HOST_SEAT_MOVE', from: 2, to: 3 });
    expect(run.s.seats[3]!.isBot).toBe(true);
    act(run, 0, { t: 'HOST_REMOVE_BOT', seat: 3 });
    act(run, 0, { t: 'HOST_KICK', seat: 1 });
    expect(run.s.seats[1]).toBeNull();
    act(run, 0, { t: 'HOST_LOCK', locked: true });
    expect(run.s.settings.locked).toBe(true);
    expect(createGame().settings.targetPoints).toBe(5);
  });
});

describe('characters', () => {
  it('bots get the asked character (Orange guy, Ammar), else an unused one', () => {
    const run = lobby(1);
    act(run, 0, { t: 'HOST_ADD_BOT', level: 'easy', characterId: 'ammar', name: 'Ammar' });
    act(run, 0, { t: 'HOST_ADD_BOT', level: 'easy', characterId: 'tango' });
    expect(run.s.seats[1]).toMatchObject({ characterId: 'ammar', name: 'Ammar' });
    expect(run.s.seats[2]!.characterId).toBe('tango');
    act(run, 0, { t: 'HOST_ADD_BOT', level: 'easy', characterId: 'nobody' });
    const used = run.s.seats.slice(0, 3).map((x) => x!.characterId);
    expect(CHARACTERS).toContain(run.s.seats[3]!.characterId);
    expect(used).not.toContain(run.s.seats[3]!.characterId);
    expect(CHARACTERS).toEqual(expect.arrayContaining(['tango', 'ammar']));
  });
});

describe('v0.7 starting layout picker', () => {
  it('offers sensible layouts per card count', () => {
    expect(layoutOptions(4)).toEqual(['r1', 'r2']);
    expect(layoutOptions(5)).toEqual(['r1', 'r2']);
    expect(layoutOptions(6)).toEqual(['r1', 'r2', 'r3']);
    expect(layoutOptions(7)).toEqual(['r2']);
    expect(layoutOptions(8)).toEqual(['r2', 'r4']);
    expect(initialGrid(6, 'r3').map((g) => g.row)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(initialGrid(5, 'r3').map((g) => g.row)).toEqual([0, 0, 0, 1, 1]); // not offered → default 2 rows
  });
  it('each player picks in the lobby; the deal uses it; locked once play starts', () => {
    const run = lobby(2, { cardsPerPlayer: 6, test: true });
    act(run, 0, { t: 'SET_LAYOUT', layout: 'r1' });
    act(run, 1, { t: 'SET_LAYOUT', layout: 'r3' });
    expect(rej(run, 1, { t: 'SET_LAYOUT', layout: 'grid' })).toBe('BAD_LAYOUT');
    expect(projectView(run.s, 0).seats[1]!.layout).toBe('r3');
    act(run, 0, { t: 'START' });
    expect(rej(run, 0, { t: 'SET_LAYOUT', layout: 'r2' })).toBe('LAYOUT_LOCKED');
    run.s.test.forcedDice = [6, 1];
    for (const sd of [0, 1]) act(run, sd, { t: 'ROLL_DIE' });
    const areas = run.s.round!.areas;
    expect(new Set(areas[0]!.map((x) => x.row)).size).toBe(1);
    expect(new Set(areas[1]!.map((x) => x.row)).size).toBe(3);
  });
});
