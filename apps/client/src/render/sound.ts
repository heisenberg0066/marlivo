// Original synthesized sound effects (plain WebAudio, no sample files, nothing to license).
// iOS unlocks audio only after the first tap; unlock() is called from the first pointer event.
import { getPrefs } from '../prefs';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let ambience: { stop(): void } | null = null;

function ac(): AudioContext | null {
  if (!ctx) {
    const C = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain(); master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  master!.gain.value = getPrefs().volume;
  return ctx;
}
export function unlock() { const c = ac(); if (c && c.state === 'suspended') void c.resume(); syncAmbience(); }

function noise(at: number, dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', sweepTo?: number) {
  const c = ctx!, src = c.createBufferSource(); src.buffer = noiseBuf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, at); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.012, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(master!); src.start(at, Math.random()); src.stop(at + dur + 0.05);
}
function tone(at: number, dur: number, freq: number, gain: number, type: OscillatorType = 'sine', toFreq?: number) {
  const c = ctx!, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, at);
  if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, at + dur);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master!); o.start(at); o.stop(at + dur + 0.05);
}

export type Sfx = 'slide' | 'slap' | 'flip' | 'chime' | 'bonk' | 'plop' | 'dice' | 'riffle' | 'whoosh' | 'fanfare' | 'tick' | 'pause' | 'back' | 'stinger' | 'win' | 'shh' | 'drum' | 'shuttle';
export function sfx(name: Sfx, delayMs = 0) {
  if (!getPrefs().sound) return;
  const c = ac(); if (!c || c.state !== 'running') return;
  const t = c.currentTime + delayMs / 1000;
  switch (name) {
    case 'slide': noise(t, 0.16, 2600, 0.8, 0.25, 'bandpass', 1200); break;
    case 'slap': noise(t, 0.09, 1800, 0.7, 0.55); tone(t, 0.08, 140, 0.25, 'sine', 70); break;
    case 'flip': noise(t, 0.05, 4200, 2, 0.35); break;
    case 'chime': [784, 988, 1175].forEach((f, i) => tone(t + i * 0.07, 0.5, f, 0.12, 'triangle')); break;
    case 'bonk': tone(t, 0.25, 320, 0.3, 'sine', 120); tone(t, 0.12, 640, 0.08, 'square', 300); break;
    case 'plop': tone(t, 0.12, 500, 0.22, 'sine', 180); break;
    case 'dice': for (let i = 0; i < 7; i++) noise(t + i * 0.07 + Math.random() * 0.03, 0.04, 2200 + Math.random() * 1500, 3, 0.3 - i * 0.03); break;
    case 'riffle': for (let i = 0; i < 14; i++) noise(t + i * 0.035, 0.03, 3500, 2, 0.18); break;
    case 'whoosh': noise(t, 0.35, 400, 1.2, 0.2, 'bandpass', 2400); break;
    case 'fanfare': [523, 659, 784, 1046].forEach((f, i) => tone(t + i * 0.12, 0.6, f, 0.13, 'triangle')); break;
    case 'win': [659, 784, 988].forEach((f, i) => tone(t + i * 0.09, 0.45, f, 0.13, 'triangle')); break;
    case 'tick': tone(t, 0.12, 1320, 0.08, 'sine'); break;
    case 'pause': tone(t, 0.4, 440, 0.1, 'sine', 330); break;
    case 'back': tone(t, 0.18, 660, 0.1); tone(t + 0.12, 0.3, 990, 0.1); break;
    case 'stinger': tone(t, 0.2, 1500, 0.08, 'triangle', 2400); noise(t, 0.2, 3000, 1, 0.1, 'bandpass', 6000); break;
    case 'shh': noise(t, 0.4, 6000, 0.6, 0.12, 'highpass'); tone(t + 0.05, 0.4, 1760, 0.05); break;
    case 'drum': tone(t, 0.3, 110, 0.4, 'sine', 50); noise(t, 0.06, 900, 1, 0.2); break;
    case 'shuttle': noise(t, 0.05, 3000, 4, 0.25); noise(t + 0.06, 0.4, 1200, 0.9, 0.08, 'bandpass', 3000); break;
  }
}

/** Optional soft room tone (kettle hum + faint crackle). Off by default. */
export function syncAmbience() {
  const want = getPrefs().sound && getPrefs().ambience;
  if (!want) { ambience?.stop(); ambience = null; return; }
  const c = ac(); if (!c || ambience || c.state !== 'running') return;
  const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
  const g = c.createGain(); g.gain.value = 0.035;
  const hum = c.createOscillator(); hum.frequency.value = 110; const hg = c.createGain(); hg.gain.value = 0.006;
  src.connect(f).connect(g).connect(master!); hum.connect(hg).connect(master!);
  src.start(); hum.start();
  ambience = { stop() { src.stop(); hum.stop(); } };
}
