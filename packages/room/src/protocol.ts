// Wire protocol (§9), shared by the Durable Object, the in-browser local host and the client.
import type { GameEvent, Intent, Lang, PlayerView, Settings } from '@marlivo/engine';

export type ClientMsg =
  | { type: 'HELLO'; name: string; characterId: string; lang: Lang; seatToken?: string; password?: string; tag?: string }
  | { type: 'INTENT'; cseq: number; intent: Intent }
  | { type: 'CHAT'; text: string }
  | { type: 'EMOTE'; id: string }
  | { type: 'HOVER'; slot: string | null }
  | { type: 'RESYNC' }
  | { type: 'PING' }
  | { type: 'TEST'; op: 'STEP_MODE'; on: boolean }
  | { type: 'TEST'; op: 'STEP' }
  | { type: 'TEST'; op: 'EXPORT' };

export type ProjectedEvent = ReturnType<typeof import('@marlivo/engine').projectEvent>;

export type ServerMsg =
  | { type: 'WELCOME'; seat: number; seatToken?: string; code: string; test: boolean; hasPassword: boolean; local?: boolean }
  | { type: 'SNAPSHOT'; seq: number; view: PlayerView }
  | { type: 'UPDATE'; seq: number; events: ProjectedEvent[]; view: PlayerView }
  | { type: 'ACK'; cseq: number }
  | { type: 'REJECT'; cseq: number; reason: string }
  | { type: 'ERROR'; code: string; triesLeft?: number }
  | { type: 'CHAT'; seat: number; text: string; ts: number }
  | { type: 'EMOTE'; seat: number; id: string }
  | { type: 'HOVER'; seat: number; slot: string | null }
  | { type: 'KICKED' }
  | { type: 'ELSEWHERE' }
  | { type: 'PONG' }
  | { type: 'TEST_INFO'; stepMode: boolean; pendingBots: number; seed?: string; export?: string };

export interface CreateRoomRequest { friendsKey: string; ownerKey?: string; test?: boolean; password?: string; settings?: Partial<Settings>; seed?: string }
export type { GameEvent };
