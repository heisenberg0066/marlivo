// Captures the 5 Orange waiter storyboard sequences (W1–W5) across all 5 random outfit styles:
// node scripts/waiter-shots.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.env.BASE ?? 'http://localhost:4192/marlivo/';
const out = process.env.OUT ?? '/workspace/sb/scene/shots';
mkdirSync(out, { recursive: true });
const GL = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: GL });
const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } });
await ctx.addInitScript(() => {
  localStorage.setItem('marlivo.prefs', JSON.stringify({ name: 'Ammar', speed: 'fast', sound: false, renderer: '3d', scene: 'golden', graphics: 'high', camera: 'seat' }));
  localStorage.setItem('marlivo.lang', 'en');
});
const p = await ctx.newPage();
await p.goto(base + '#/practice');
await p.waitForTimeout(600);
await p.locator('.seg').nth(0).locator('button').nth(2).click(); // 4 players
await p.locator('.seg').nth(2).locator('button').nth(0).click(); // 4 cards
await p.locator('button.act.primary').last().click();

const t0 = Date.now();
while (Date.now() - t0 < 40000) {
  await p.waitForTimeout(600);
  const phase = await p.evaluate(() => window.__ml?.view?.phase ?? '');
  if (phase === 'PEEK' || phase === 'PLAY') break;
  const roll = p.locator('.actions button.act', { hasText: /Roll|Lancer/ });
  if (await roll.count()) await roll.first().click().catch(() => {});
}
await p.waitForTimeout(18000);

const shots = [
  { name: 'waiter-w1-visit-full', kind: 'visit', outfit: 'full', progress: 0.65 },
  { name: 'waiter-w2-refill-tuxedo', kind: 'refill', outfit: 'tuxedo', progress: 0.19 },
  { name: 'waiter-w3-shuffle-suit', kind: 'shuffle', outfit: 'suit', progress: 0.55 },
  { name: 'waiter-w4-splash-tie', kind: 'roundEnd', outfit: 'tie', winner: 3, loser: 1, progress: 0.36 },
  { name: 'waiter-w4-cheer-plain', kind: 'roundEnd', outfit: 'plain', winner: 3, loser: 1, progress: 0.68 },
  { name: 'waiter-w5-medal-full', kind: 'medal', outfit: 'full', winner: 1, loser: 2, progress: 0.42 },
  { name: 'waiter-w5-crowned-tuxedo', kind: 'medal', outfit: 'tuxedo', winner: 1, loser: 2, progress: 0.72 },
];

for (const s of shots) {
  await p.evaluate((cfg) => {
    window.__mlWaiter?.trigger(cfg.kind, { outfit: cfg.outfit, winner: cfg.winner, loser: cfg.loser, progress: cfg.progress });
  }, s);
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${out}/${s.name}.png` });
  console.log('captured', s.name);
}
await b.close();
