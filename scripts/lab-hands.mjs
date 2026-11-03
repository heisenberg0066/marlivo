// Lab close-ups of every character's hands (#/lab, standing idle): per id x graphics (high/low) x yaw, crops
// around both hand bones (window.__labHands probe). Usage: [BASE] [IDS] [YAWS=0,0.7] node scripts/lab-hands.mjs <outDir>
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const base = process.env.BASE ?? 'http://localhost:4173/marlivo/';
const out = process.argv[2] ?? '/tmp/labhands'; mkdirSync(out, { recursive: true });
const ids = (process.env.IDS ?? 'tango,biscuit,mint,pepper,choco,sugar,livo,ammar').split(',');
const yaws = (process.env.YAWS ?? '0,0.7').split(',');
const VW = 1400, HALF = Number(process.env.HALF ?? 120);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
for (const gfx of (process.env.GFX ?? 'high,low').split(',')) {
  const ctx = await b.newContext({ viewport: { width: VW, height: VW } });
  await ctx.addInitScript((g) => { localStorage.setItem('marlivo.prefs', JSON.stringify({ name: 'Ammar', characterId: 'biscuit', sound: false, renderer: '3d', graphics: g })); localStorage.setItem('marlivo.lang', 'en'); }, gfx);
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`${gfx}: ${e.message}`)); p.on('console', (m) => { if (/fingers/.test(m.text())) errs.push(m.text()); });
  for (const id of ids) for (const yaw of yaws) {
    await p.goto(`${base}#/lab?id=${id}&pose=stand&yaw=${yaw}&zoom=2&cy=0.1&bg=5a6068`); await p.reload(); await p.waitForTimeout(Number(process.env.WAIT ?? 6000));
    const hs = await p.evaluate(() => window.__labHands ?? []);
    for (const h of hs) {
      const x = Math.max(0, Math.min(VW - 2 * HALF, h.x - HALF)), y = Math.max(0, Math.min(VW - 2 * HALF, h.y - HALF * 0.8));
      await p.screenshot({ path: `${out}/${id}-${gfx}-y${yaw}-${h.name.slice(3, 4)}.jpg`, type: 'jpeg', quality: 88, clip: { x, y, width: 2 * HALF, height: 2 * HALF } });
    }
    if (!hs.length) errs.push(`${id}/${gfx}: no hand probe`);
  }
  await ctx.close();
}
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no page errors');
await b.close();
