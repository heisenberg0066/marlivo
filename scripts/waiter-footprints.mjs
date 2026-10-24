// Measures the real floor footprints of the seated groups and of the waiter (pouring) from skinned vertices.
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const base = process.env.BASE ?? 'http://127.0.0.1:4192/marlivo/';
const players = Number(process.env.PLAYERS ?? 4), at = Number(process.env.AT ?? 9.5);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
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
let c = await p.evaluate(() => window.__mlWaiter?.state().clock ?? 0);
while (c < at - 0.02) { await adv(Math.min(1000, (at - c) * 1000), 100); c = await p.evaluate(() => window.__mlWaiter.state().clock); }
const fp = await p.evaluate(() => ({ fp: window.__mlWaiter.footprints(), st: window.__mlWaiter.state(), names: (window.__ml?.view?.seats ?? []).map((s) => s.characterId ?? s.name ?? null) }));
writeFileSync(process.env.OUT ?? '/workspace/sb/waiter/footprints.json', JSON.stringify(fp, null, 1));
console.log(JSON.stringify({ names: fp.names, tag: fp.st.tag, seats: Object.fromEntries(Object.entries(fp.fp.seats).map(([k, v]) => [k, v && v.max])), waiter: fp.fp.waiter?.max }));
await b.close();
