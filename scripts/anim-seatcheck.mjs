// Every-seat check for the 3D figures: 2/3/4 players x High/Low on one viewport; screenshots after 30 s model load
// and bot play. Usage: node scripts/anim-seatcheck.mjs laptop|phone <outDir>
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const base = process.env.BASE ?? 'http://localhost:4173/marlivo/';
const which = process.argv[2] ?? 'laptop'; const out = process.argv[3] ?? '/tmp/seat'; mkdirSync(out, { recursive: true });
const sizes = { phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, laptop: { viewport: { width: 1280, height: 720 } } };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
for (const gfx of ['high', 'low']) {
  await Promise.all([1, 2, 3].map(async (bots) => {
    const ctx = await b.newContext(sizes[which]);
    await ctx.addInitScript((g) => { localStorage.setItem('marlivo.prefs', JSON.stringify({ name: 'Ammar', characterId: 'ammar', speed: 'normal', sound: false, renderer: '3d', graphics: g })); localStorage.setItem('marlivo.lang', 'en'); }, gfx);
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`${gfx}/${bots}: ${e.message}`));
    await p.goto(base + '#/practice'); await p.waitForTimeout(800);
    await p.locator('.seg').nth(0).locator('button').nth(bots - 1).click();
    await p.locator('button.act.primary').last().click();
    await p.waitForTimeout(30000);
    const roll = p.locator('.actions button.act', { hasText: /Roll/ }); if (await roll.count()) await roll.first().click({ force: true });
    await p.waitForTimeout(7000);
    await p.screenshot({ path: `${out}/${which}-${gfx}-${bots + 1}p.jpg`, type: 'jpeg', quality: 75, timeout: 120000 });
    await ctx.close();
  }));
}
console.log(which, errs.length ? 'ERRORS\n' + errs.join('\n') : 'no page errors');
await b.close();
