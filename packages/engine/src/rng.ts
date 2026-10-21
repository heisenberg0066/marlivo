import type { Rng } from './types';

/** Seeded, serialisable PRNG (sfc32). Used by tests, simulations and Test rooms (§17.3 seeded replay). */
export class SeededRng implements Rng {
  private a: number; private b: number; private c: number; private d: number;
  constructor(seed: number | string | number[] = 1) {
    if (Array.isArray(seed)) { [this.a, this.b, this.c, this.d] = seed as [number, number, number, number]; return; }
    let h = 1779033703 ^ String(seed).length;
    const s = String(seed);
    for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    const mix = () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
    this.a = mix(); this.b = mix(); this.c = mix(); this.d = mix();
    for (let i = 0; i < 12; i++) this.next();
  }
  next(): number {
    this.a >>>= 0; this.b >>>= 0; this.c >>>= 0; this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
  getState(): number[] { return [this.a, this.b, this.c, this.d]; }
}

/** Crypto RNG for real games (§11.2 item 8): crypto.getRandomValues, never seeded by a client. */
export class CryptoRng implements Rng {
  private buf = new Uint32Array(64); private i = 64;
  next(): number {
    if (this.i >= this.buf.length) { crypto.getRandomValues(this.buf); this.i = 0; }
    return this.buf[this.i++]! / 4294967296;
  }
}

export const randInt = (rng: Rng, n: number) => Math.floor(rng.next() * n);
export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) { const j = randInt(rng, i + 1); [arr[i], arr[j]] = [arr[j]!, arr[i]!]; }
  return arr;
}
export function randHex(rng: Rng, bytes: number): string {
  let s = '';
  for (let i = 0; i < bytes; i++) s += randInt(rng, 256).toString(16).padStart(2, '0');
  return s;
}
