// Every-seat look at the 3D scenes: node scripts/scene-shots.mjs
// env: BASE (default local preview), SCENES=golden,picnic,dusk,classic  PLAYERS=2,3,4  GFX=high,low  DEV=laptop,phone
//      WAIT=ms to let the models load (30000 for full check)  CARDS=4  JOBS=3  OUT=dir
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const base = process.env.BASE ?? 'http://localhost:4190/marlivo/';
const out = process.env.OUT ?? '/workspace/sb/scene/shots'; mkdirSync(out, { recursive: true });
const list = (k, d) => (process.env[k] ?? d).split(',').filter(Boolean);
const scenes = list('SCENES', 'golden'), players = list('PLAYERS', '2,3,4').map(Number), gfx = list('GFX', 'high,low'), devs = list('DEV', 'laptop,phone');
const wait = Number(process.env.WAIT ?? 15000);
const cardsIdx = Math.max(0, Number(process.env.CARDS ?? 4) - 4);
const jobs = Number(process.env.JOBS ?? 3);
const GL = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const sizes = { phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, laptop: { viewport: { width: 1366, height: 768 } } };

const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: GL });
const tasks = [];
for (const scene of scenes) for (const dev of devs) for (const g of gfx) for (const n of players) tasks.push({ scene, dev, g, n });

async function runOne({ scene, dev, g, n }) {
  const ctx = await b.newContext(sizes[dev]);
  await ctx.addInitScript(([scene, g, cam]) => {
    localStorage.setItem('marlivo.prefs', JSON.stringify({ name: 'Ammar', speed: 'fast', sound: false, renderer: '3d', scene, graphics: g, camera: cam }));
    localStorage.setItem('marlivo.lang', 'en');
  }, [scene, g, process.env.CAM ?? 'seat']);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await p.goto(base + '#/practice'); await p.waitForTimeout(600);
  await p.locator('.seg').nth(0).locator('button').nth(n - 2).click();
  await p.locator('.seg').nth(2).locator('button').nth(cardsIdx).click();
  await p.locator('button.act.primary').last().click();
  // Wait for 3D table to mount and roll the die until cards are dealt (PEEK or PLAY phase)
  const t0 = Date.now();
  while (Date.now() - t0 < 45000) {
    await p.waitForTimeout(600);
    const phase = await p.evaluate(() => window.__ml?.view?.phase ?? '');
    if (phase === 'PEEK' || phase === 'PLAY') break;
    const roll = p.locator('.actions button.act', { hasText: /Roll|Lancer/ });
    if (await roll.count()) await roll.first().click().catch(() => {});
  }
  await p.waitForTimeout(wait);
  await p.waitForFunction(() => !document.querySelector('.fly-card'), null, { timeout: 15000 }).catch(() => {});
  const name = `${scene}-${dev}-${g}-${n}p${process.env.CAM === 'top' ? '-top' : ''}`;
  await p.screenshot({ path: `${out}/${name}.png` });
  const st = await p.evaluate(() => ({ ...window.__ml3d, ...window.__mlScene, phase: window.__ml?.view?.phase }));
  console.log(name, JSON.stringify(st), errs.length ? 'ERR ' + errs.slice(0, 2).join(' | ') : '');
  await ctx.close();
}

for (let i = 0; i < tasks.length; i += jobs) {
  await Promise.all(tasks.slice(i, i + jobs).map(runOne));
}
await b.close();
