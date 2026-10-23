// Deterministic animation capture (dev/test only). With localStorage 'marlivo.animstep' = '1' the page runs on a
// virtual clock: performance.now, Date.now, timers and requestAnimationFrame only move when the test calls
// window.__mlAdvance(ms, frameMs). Every frame of every animation (director timers, 3D sprites, the r3f loop)
// is then exactly reproducible, however slow software WebGL is. Off by default: never active for players.
type Cb = (...a: unknown[]) => void;
const on = (() => { try { return localStorage.getItem('marlivo.animstep') === '1'; } catch { return false; } })();
if (on) {
  (globalThis as unknown as { __mlOrigTimeout: typeof setTimeout }).__mlOrigTimeout = setTimeout.bind(window);
  const realPerf = performance.now.bind(performance), realDate = Date.now;
  const perf0 = realPerf(), date0 = realDate();
  let now = 0; // virtual ms since start
  let seq = 1;
  const timers = new Map<number, { at: number; cb: Cb; args: unknown[]; every: number | null }>();
  let rafs = new Map<number, FrameRequestCallback>();
  performance.now = () => perf0 + now;
  Date.now = () => date0 + now;
  const w = window as unknown as Record<string, unknown>;
  // timers fire >= 1 ms later (like real clamping), so setTimeout(0) chains cannot spin inside one frame
  w.setTimeout = ((cb: Cb, ms = 0, ...args: unknown[]) => { const id = seq++; timers.set(id, { at: now + Math.max(1, Number(ms) || 0), cb, args, every: null }); return id; }) as unknown;
  w.setInterval = ((cb: Cb, ms = 0, ...args: unknown[]) => { const id = seq++; const e = Math.max(4, Number(ms) || 0); timers.set(id, { at: now + e, cb, args, every: e }); return id; }) as unknown;
  w.clearTimeout = w.clearInterval = ((id: number) => { timers.delete(id); }) as unknown;
  w.requestAnimationFrame = ((cb: FrameRequestCallback) => { const id = seq++; rafs.set(id, cb); return id; }) as unknown;
  w.cancelAnimationFrame = ((id: number) => { rafs.delete(id); }) as unknown;
  const runTimers = (until: number) => {
    for (let guard = 0; guard < 10000; guard++) {
      let best: number | null = null, bt = Infinity;
      for (const [id, t] of timers) if (t.at <= until && t.at < bt) { bt = t.at; best = id; }
      if (best === null) return;
      const t = timers.get(best)!;
      now = Math.max(now, t.at);
      if (t.every) t.at += t.every; else timers.delete(best);
      try { t.cb(...t.args); } catch (e) { console.error(e); }
    }
  };
  const frame = () => {
    const q = rafs; rafs = new Map();
    for (const cb of q.values()) { try { cb(perf0 + now); } catch (e) { console.error(e); } }
  };
  /** Advances virtual time by ms, running timers in order and one animation frame every frameMs. */
  w.__mlAdvance = async (ms: number, frameMs = 1000 / 60) => {
    const end = now + ms;
    while (now < end - 1e-6) {
      if (w.__mlStop) { w.__mlStop = false; break; } // a capture hook asked to stop right here
      const next = Math.min(end, now + frameMs);
      runTimers(next); now = next; frame();
      await Promise.resolve(); await new Promise((r) => (window as unknown as { __mlRealTimeout: typeof setTimeout }).__mlRealTimeout(r, 0)); // let promises + React commit
    }
    return now;
  };
  w.__mlRealTimeout = realSetTimeout;
  w.__mlNow = () => now;
  void realDate;
}
// the real setTimeout, captured before the patch (module scope runs first)
function realSetTimeout(cb: () => void, ms: number) { return (globalThis as unknown as { __mlOrigTimeout: typeof setTimeout }).__mlOrigTimeout(cb, ms); }
export {};
