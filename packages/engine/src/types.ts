// MarLivo rules engine: data model (spec §4.4). Pure data, JSON-serialisable.
export type Suit = 'S' | 'H' | 'D' | 'C';
export type SeatId = number; // 0..3, clockwise
export type Lang = 'en' | 'fr';
export type BotLevel = 'easy' | 'normal' | 'hard';
export type BotSpeed = 'slow' | 'normal' | 'fast' | 'instant';
export type Power = 'J' | 'Q' | '10';
export type Phase = 'LOBBY' | 'START_ROLL' | 'PEEK' | 'PLAY' | 'ROUND_END' | 'MATCH_END';

/** A physical card. `id` is random per round and is never sent to clients. */
export interface Card { id: string; r: number; s: Suit }
/** What a client may see of a face-up card. */
export interface CardFace { r: number; s: Suit }

export interface Slot { id: string; num: number; row: number; col: number; card: Card | null }

export interface SeatInfo {
  name: string;
  characterId: string;
  lang: Lang;
  isBot: boolean;
  botLevel?: BotLevel;
  ready: boolean;
  /** For humans: socket connected. Bots are always "connected". For a bot-replaced seat: the human's connection. */
  connected: boolean;
  left?: boolean;
  /** A human seat taken over by a bot via the host's "Replace with bot" button. */
  replacedByBot?: boolean;
}

export interface Settings {
  maxPlayers: number;      // 2..4
  cardsPerPlayer: number;  // 4..8 (R3)
  targetPoints: number;    // 1..21 (R26)
  memoryHelper: 'off' | 'own' | 'full';
  freeText: boolean;
  voiceNotes: boolean;
  botSpeed: BotSpeed;
  locked: boolean;
  test: boolean;           // Test room (owner key only, §17.3). Cannot be changed after creation.
}

export type QueueItem =
  | { k: 'power'; owner: SeatId; power: Power; cardId: string }
  | { k: 'claim'; seat: SeatId };

export type Active =
  | { k: 'power'; owner: SeatId; power: Power; peekSlot?: string }
  | { k: 'attempt'; seat: SeatId; target: number; flipped: string[]; tentative: string[]; wrong: string[]; finishTry?: { finisher: SeatId } }
  | { k: 'finish'; finisher: SeatId; turnPlayer: SeatId };

export interface MatchWindow { target: number; triggerId: string; openIds: string[]; turnPlayer: SeatId }

export interface RoundResult { winner: SeatId | null; reason: 'empty' | 'finishRule' | 'letWin' | 'noCards' | 'removed'; deckOrder: string[]; salt: string }

export interface RoundState {
  no: number;
  participants: SeatId[];
  starter: SeatId;
  starterReason: 'dice' | 'lastWinner' | 'repeat';
  deck: Card[];          // index 0 = top
  discard: Card[];       // last = top
  areas: Record<number, Slot[]>;
  nextNum: Record<number, number>;
  current: SeatId;       // seat whose turn it is to draw (or who is deciding)
  drawn: Card | null;
  window: MatchWindow | null;
  queue: QueueItem[];
  active: Active | null;
  peek: Record<number, { picked: string[]; done: boolean }>;
  knowledge: Record<string, SeatId[]>; // cardId -> seats that legitimately saw it (follows the card through swaps)
  publicSeen: string[];  // cardIds that were face up for everyone at some point this round
  commitment: string;
  salt: string;
  order: string[];       // initial deck order as faces ("9H"), revealed at round end
  nextReady: SeatId[];
  result: RoundResult | null;
  reshuffles: number;
  turns: number;        // number of draws so far (bots use it to age memories)
  windows: number;      // number of match windows opened so far
}

export interface SeatStats { roundsWon: number; matches: number; longestCombo: number; penalties: number; jackSwaps: number; wrongFlips: number; worstAttempt: number }

export interface TestState {
  reveal: number[];               // seats with reveal-all on (per window)
  forcedDeck?: string[];          // faces placed on top for the next round
  forcedDice?: number[];          // next die values in order
  preset?: string;                // preset applied at next round start
}

export interface LogEntry { t: string; p: Record<string, unknown> }

export interface GameState {
  v: 1;
  settings: Settings;
  seats: (SeatInfo | null)[];
  host: SeatId | null;
  phase: Phase;
  players: SeatId[];           // seats in the current match
  scores: Record<number, number>;
  roundNo: number;
  lastWinner: SeatId | null;
  lastStarter: SeatId | null;
  roll: { rollers: SeatId[]; pending: Record<number, number>; history: Record<number, number>[] } | null;
  round: RoundState | null;
  matchWinner: SeatId | null;
  endedBy: 'host' | 'players' | null;
  stats: Record<number, SeatStats>;
  log: LogEntry[];
  test: TestState;
}

export type Intent =
  // system (from the room host, not from a player)
  | { t: 'SYS_JOIN'; seat: SeatId; name: string; characterId: string; lang: Lang }
  | { t: 'SYS_CONNECT'; seat: SeatId; connected: boolean }
  | { t: 'SYS_SET_LANG'; seat: SeatId; lang: Lang }
  // lobby
  | { t: 'PICK_CHARACTER'; id: string }
  | { t: 'SET_NAME'; name: string }
  | { t: 'SET_READY'; ready: boolean }
  | { t: 'HOST_UPDATE_SETTINGS'; patch: Partial<Settings> }
  | { t: 'HOST_SEAT_MOVE'; from: SeatId; to: SeatId }
  | { t: 'HOST_SHUFFLE_SEATS' }
  | { t: 'HOST_KICK'; seat: SeatId }
  | { t: 'HOST_ADD_BOT'; level: BotLevel; name?: string; characterId?: string }
  | { t: 'HOST_REMOVE_BOT'; seat: SeatId }
  | { t: 'HOST_LOCK'; locked: boolean }
  | { t: 'HOST_HANDOVER'; seat: SeatId }
  | { t: 'TAKE_OVER_HOST' }
  | { t: 'START' }
  | { t: 'LEAVE_GAME' }
  // host buttons (§10.4)
  | { t: 'HOST_REPLACE_WITH_BOT'; seat: SeatId }
  | { t: 'HOST_HAND_BACK'; seat: SeatId }
  | { t: 'HOST_REMOVE_PLAYER'; seat: SeatId }
  | { t: 'HOST_END_GAME' }
  // game
  | { t: 'ROLL_DIE' }
  | { t: 'PEEK_PICK'; slot: string }
  | { t: 'PEEK_DONE' }
  | { t: 'DRAW' }
  | { t: 'THROW' }
  | { t: 'SWAP'; slot: string }
  | { t: 'CLAIM_MATCH' }
  | { t: 'CANCEL_CLAIM' }
  | { t: 'FLIP'; slot: string }
  | { t: 'REMOVE_TENTATIVE'; slot: string }
  | { t: 'GIVE_UP' }
  | { t: 'FINISH_TRY' }
  | { t: 'FINISH_LET_WIN' }
  | { t: 'JACK_SWAP'; a: string; b: string }
  | { t: 'JACK_SKIP' }
  | { t: 'QUEEN_PEEK'; slot: string }
  | { t: 'QUEEN_DONE' }
  | { t: 'QUEEN_SKIP'; confirm?: boolean }
  | { t: 'TEN_GIVE'; to: SeatId }
  | { t: 'NEXT_ROUND' }
  | { t: 'REMATCH' }
  | { t: 'BACK_TO_LOBBY' }
  // Test room only (§17.3)
  | { t: 'TEST_REVEAL'; on: boolean }
  | { t: 'TEST_FORCE_DECK'; cards: string[] }
  | { t: 'TEST_FORCE_DICE'; values: number[] }
  | { t: 'TEST_SET_SLOT'; slot: string; card: string }
  | { t: 'TEST_SET_DECK_TOP'; cards: string[] }
  | { t: 'TEST_PRESET'; id: string };

export type Actor = SeatId | 'sys';

/** An engine event. `p` is public; `x` is private data for one seat only. */
export interface GameEvent { t: string; p: Record<string, unknown>; x?: { to: SeatId; d: Record<string, unknown> } }

export type ReduceResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; reason: string };

export interface Rng { next(): number }
