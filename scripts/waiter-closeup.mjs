// Close-up check of the waiter's walk on the deterministic virtual clock: follows him with a side camera (__mlCam)
// and saves a frame every STEP ms. env: OUT, FROM (s), TO (s), STEP (ms), PLAYERS, CAM=side|front|game|top
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.env.BASE ?? 'http://127.0.0.1:4192/marlivo/';
const out = process.env.OUT ?? '/workspace/sb/waiter/closeup';
const players = Number(process.env.PLAYERS ?? 4);
const from = Number(process.env.FROM ?? 4), to = Number(process.env.TO ?? 7), step = Number(process.env.STEP ?? 100);
const cam = process.env.CAM ?? 'side';
mkdirSync(out, { recursive: true });
const GL = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: GL });
const ctx = await b.newContext({ viewport: { width: Number(process.env.VW ?? 960), height: Number(process.env.VH ?? 600) } });
await ctx.addInitScript(() => {
  localStorage.setItem('marlivo.animstep', '1');
  localStorage.setItem('marlivo.prefs', JSON.stringify({ name: 'Ammar', speed: 'normal', sound: false, renderer: '3d', scene: 'golden', graphics: 'high', camera: 'seat', confirmSwap: false }));
  localStorage.setItem('marlivo.lang', 'en');
});
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const adv = (ms, fr = 33.333) => p.evaluate(([a, f]) => window.__mlAdvance(a, f), [ms, fr]);
await p.goto(base + '#/practice');
await adv(300);
await p.locator('.seg').nth(0).locator('button').nth(players - 2).click();
await p.locator('.seg').nth(2).locator('button').nth(0).click();
await p.locator('button.act.primary').last().click();
for (let k = 0; k < 12; k++) { await adv(100, 50); await p.waitForTimeout(300); }
for (let k = 0; k < 60 && !(await p.evaluate(() => !!window.__mlWaiter)); k++) { await adv(100, 50); await p.waitForTimeout(300); }
// waiter clock starts with the canvas; advance until his clock reaches FROM
const clk = () => p.evaluate(() => window.__mlWaiter?.state().clock ?? 0);
let c = await clk();
while (c < from - 0.05) { await adv(Math.min(1000, (from - c) * 1000), 50); c = await clk(); }
const log = [];
let i = 0;
while (c < to) {
  const s = await p.evaluate(() => window.__mlWaiter.state());
  if (cam === 'top') { await p.evaluate(() => { window.__mlCam = { pos: [0, 6.2, 0.9], target: [0, -0.75, -0.05], fov: 44 }; }); await adv(1, 1); }
  else if (cam !== 'game' && s.pos) {
    const yaw = s.yaw; let side = cam === 'side' ? Math.PI / 2 : 0;
    // side view from the outside of the ring (the table would hide his legs from the inside)
    if (cam === 'side' && Math.hypot(s.pos[0] + Math.sin(yaw + side), s.pos[2] + Math.cos(yaw + side)) < Math.hypot(s.pos[0], s.pos[2])) side = -side;
    const dx = Math.sin(yaw + side), dz = Math.cos(yaw + side);
    await p.evaluate(([px, pz, dx, dz]) => { window.__mlCam = { pos: [px + dx * 1.35, -0.3, pz + dz * 1.35], target: [px, -0.36, pz], fov: 56 }; }, [s.pos[0], s.pos[2], dx, dz]);
    await adv(1, 1);
  }
  const s2 = await p.evaluate(() => window.__mlWaiter.state());
  log.push(s2);
  await p.screenshot({ path: `${out}/c${String(i).padStart(3, '0')}-t${s2.clock.toFixed(2)}.jpg`, type: 'jpeg', quality: 85 });
  i++;
  if (step > 300) { await adv(step - 150, 250); await adv(150, 33.333); } else await adv(step, Math.min(step, 33.333));
  c = await clk();
}
writeFileSync(`${out}/log.json`, JSON.stringify(log, null, 0));
console.log('frames', i);
await b.close();
