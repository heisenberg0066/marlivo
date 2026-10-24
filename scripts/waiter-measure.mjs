// One session on the virtual clock (4 players): (1) foot slip - world-space foot motion while each foot is planted,
// sampled at 60 fps over WALK_S seconds of walking on the ring; (2) footprints + stream while pouring (each pour).
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const base = process.env.BASE ?? 'http://127.0.0.1:4192/marlivo/';
const players = Number(process.env.PLAYERS ?? 4);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 640, height: 400 } });
await ctx.addInitScript(() => {
  localStorage.setItem('marlivo.animstep', '1');
  localStorage.setItem('marlivo.prefs', JSON.stringify({ name: 'Ammar', speed: 'normal', sound: false, renderer: '3d', scene: 'golden', graphics: 'low', camera: 'seat', confirmSwap: false }));
  localStorage.setItem('marlivo.lang', 'en');
});
const p = await ctx.newPage();
const adv = (ms, fr = 100) => p.evaluate(([a, f]) => window.__mlAdvance(a, f), [ms, fr]);
await p.goto(base + '#/practice');
await adv(300);
await p.locator('.seg').nth(0).locator('button').nth(players - 2).click();
await p.locator('.seg').nth(2).locator('button').nth(0).click();
await p.locator('button.act.primary').last().click();
for (let k = 0; k < 12; k++) { await adv(100, 50); await p.waitForTimeout(300); }
const clk = () => p.evaluate(() => window.__mlWaiter.state().clock);
const goTo = async (t, fr = 100) => { let c = await clk(); while (c < t - 0.01) { await adv(Math.min(1000, (t - c) * 1000), fr); c = await clk(); } };
const plan = await p.evaluate(() => window.__mlWaiter.plan().segs.map((s) => ({ k: s.k, t0: s.t0, dur: s.dur, tag: s.tag ?? null, seat: s.seat ?? null })));
// plan clock offset: the running shift started at clock ~0 (first shift starts with the canvas)
const out = { plan, pours: [], slip: null };
// foot slip on the first long walk
const walk = plan.find((s) => s.k === 'walk' && s.dur > 6);
await goTo(walk.t0 + 1.5);
const samples = [];
for (let i = 0; i < 240; i++) { await adv(1000 / 60, 1000 / 60); samples.push(await p.evaluate(() => { const s = window.__mlWaiter.state(); return { t: s.clock, pos: s.pos, yaw: s.yaw, fL: s.footL, fR: s.footR, speed: s.speed, cyc: s.cycle, amt: s.stride }; })); }
const slip = {};
for (const f of ['fL', 'fR']) {
  const ys = samples.map((s) => s[f][1]); const minY = Math.min(...ys);
  let planted = 0, moved = 0, maxStep = 0, bodyD = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1][f], c = samples[i][f];
    if (a[1] < minY + 0.002 && c[1] < minY + 0.002) { const d = Math.hypot(c[0] - a[0], c[2] - a[2]); planted++; moved += d; maxStep = Math.max(maxStep, d); bodyD += Math.hypot(samples[i].pos[0] - samples[i - 1].pos[0], samples[i].pos[2] - samples[i - 1].pos[2]); }
  }
  slip[f] = { plantedFrames: planted, footMoved: +moved.toFixed(4), bodyMovedMeanwhile: +bodyD.toFixed(4), slipPct: +(100 * moved / Math.max(1e-6, bodyD)).toFixed(1), maxPerFrame: +maxStep.toFixed(4) };
}
const cyc = samples.map((s) => s.cyc); let wraps = 0; for (let i = 1; i < cyc.length; i++) if (cyc[i] < cyc[i - 1] - 0.5) wraps++;
slip.cyclesIn4s = wraps; slip.stepsPerSec = +(wraps * 2 / 4).toFixed(2); slip.speed = samples[120].speed;
out.slip = slip; out.samples = samples;
// pours
for (const s of plan.filter((x) => x.tag === 'pour')) {
  await goTo(s.t0 + s.dur * 0.5);
  out.pours.push(await p.evaluate(() => ({ st: window.__mlWaiter.state(), fp: window.__mlWaiter.footprints() })));
}
writeFileSync(process.env.OUT ?? '/workspace/sb/waiter/measure.json', JSON.stringify(out));
console.log(JSON.stringify(out.slip));
for (const q of out.pours) console.log('pour', q.st.tag, q.st.pos.map((v) => +v.toFixed(2)), JSON.stringify(q.st.stream));
await b.close();
