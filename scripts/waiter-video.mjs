// Records the waiter walking round the table and pouring, on the deterministic virtual clock (marlivo.animstep=1),
// in the normal game camera: FRAMES frames at FPS from waiter clock FROM. Encode with ffmpeg afterwards.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const base = process.env.BASE ?? 'http://127.0.0.1:4192/marlivo/';
const out = process.env.OUT ?? '/tmp/waiter_video_frames';
const players = Number(process.env.PLAYERS ?? 4);
const from = Number(process.env.FROM ?? 3.5), fps = Number(process.env.FPS ?? 30), frames = Number(process.env.FRAMES ?? 750);
mkdirSync(out, { recursive: true });
// CAM=game keeps the seat camera; CAM=over lifts it so his legs show above the table rim
const cam = process.env.CAM ?? 'over';
const GL = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: GL });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => {
  localStorage.setItem('marlivo.animstep', '1');
  localStorage.setItem('marlivo.prefs', JSON.stringify({ name: 'Ammar', speed: 'normal', sound: false, renderer: '3d', scene: 'golden', graphics: 'high', camera: 'seat', confirmSwap: false }));
  localStorage.setItem('marlivo.lang', 'en');
});
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const adv = (ms, fr = 1000 / fps) => p.evaluate(([a, f]) => window.__mlAdvance(a, f), [ms, fr]);
await p.goto(base + '#/practice');
await adv(300);
await p.locator('.seg').nth(0).locator('button').nth(players - 2).click();
await p.locator('.seg').nth(2).locator('button').nth(0).click();
await p.locator('button.act.primary').last().click();
for (let k = 0; k < 12; k++) { await adv(100, 50); await p.waitForTimeout(300); }
if (cam === 'over') await p.evaluate(() => { window.__mlCam = { pos: [-2.55, 1.35, -3.15], target: [0.1, -0.5, 0.1], fov: 56 }; });
if (cam === 'pours') await p.evaluate(() => { window.__mlCam = { pos: [0, 1.25, 2.3], target: [0, -0.25, -0.8], fov: 62 }; });
if (process.env.STILL) { for (let left = Number(process.env.STILL_MS ?? 500); left > 0; left -= 1000) await adv(Math.min(1000, left), 100); await adv(100, 33.3); await p.screenshot({ path: process.env.STILL, timeout: 120000 }); await b.close(); process.exit(0); }
const clk = () => p.evaluate(() => window.__mlWaiter?.state().clock ?? 0);
let c = await clk();
while (c < from - 0.02) { await adv(Math.min(500, (from - c) * 1000), 50); c = await clk(); }
// CAM=follow: raised 3/4 view that follows him from outside the ring (table and players behind him)
const follow = async () => {
  const s = await p.evaluate(() => window.__mlWaiter.state());
  if (!s.pos) return;
  const r = Math.hypot(s.pos[0], s.pos[2]) || 1, ox = s.pos[0] / r, oz = s.pos[2] / r;
  // a little round the ring behind him too, so the view is 3/4 rather than straight on
  const yx = Math.sin(s.yaw), yz = Math.cos(s.yaw);
  await p.evaluate(([px, pz, ox, oz, yx, yz]) => { window.__mlCam = { pos: [px + ox * 1.9 - yx * 0.9, 0.75, pz + oz * 1.9 - yz * 0.9], target: [px * 0.8, -0.35, pz * 0.8], fov: 50 }; }, [s.pos[0], s.pos[2], ox, oz, yx, yz]);
};
for (let i = 0; i < frames; i++) {
  if (cam === 'follow') { await follow(); await adv(1, 1); }
  if (i % 15 === 0) await p.evaluate(() => { const s = window.__ml, v = s?.view; if (!s || !v) return; if (v.phase === 'START_ROLL') s.intent({ t: 'ROLL_DIE' }); if (v.phase === 'PEEK') { const me = v.you ?? 0; for (const x of (v.round?.areas?.[me] ?? []).slice(0, 2)) s.intent({ t: 'PEEK_PICK', slot: x.id }); s.intent({ t: 'PEEK_DONE' }); } });
  await p.screenshot({ path: `${out}/f${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 90, timeout: 120000 });
  await adv(1000 / fps - (cam === 'follow' ? 1 : 0));
  if (i % 50 === 0) console.log('frame', i, 'clock', (await clk()).toFixed(2));
}
await b.close();
console.log('done');
