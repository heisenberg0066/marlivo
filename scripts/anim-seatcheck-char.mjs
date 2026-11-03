// Every-seat check for one character: puts CHAR (default livo) in every opponent seat (2/3/4 players x High/Low)
// and, with ME=1, plays as CHAR too (first-person hand). Screenshots after the model load and some bot play.
// OUTFIT=<id> (v0.9): the outfit for CHAR (prefs.outfits; practice bots wear the player's chosen outfit too).
// Usage: CHAR=livo [OUTFIT=denim] node scripts/anim-seatcheck-char.mjs laptop|phone <outDir>
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const base = process.env.BASE ?? 'http://localhost:4173/marlivo/';
const ch = process.env.CHAR ?? 'livo'; const me = process.env.ME ? ch : 'biscuit';
const which = process.argv[2] ?? 'laptop'; const out = process.argv[3] ?? '/tmp/seat';
const tag = process.env.OUTFIT ? '-' + process.env.OUTFIT : ''; mkdirSync(out, { recursive: true });
const sizes = { phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, laptop: { viewport: { width: 1280, height: 720 } }, big: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 } };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
const gfxs = (process.env.GFX ?? 'high,low').split(',');
const botsList = (process.env.BOTS ?? '1,2,3').split(',').map(Number);
for (const gfx of gfxs) {
  await Promise.all(botsList.map(async (bots) => {
    const ctx = await b.newContext(sizes[which]);
    await ctx.addInitScript(([g, c, ch0, o]) => { localStorage.setItem('marlivo.prefs', JSON.stringify({ name: 'Ammar', characterId: c, speed: 'normal', sound: false, renderer: '3d', graphics: g, outfits: o ? { [ch0]: o } : {} })); localStorage.setItem('marlivo.lang', 'en'); }, [gfx, me, ch, process.env.OUTFIT ?? '']);
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`${gfx}/${bots}: ${e.message}`));
    await p.goto(base + '#/practice'); await p.waitForTimeout(800);
    await p.locator('.seg').nth(0).locator('button').nth(bots - 1).click();
    if (me !== ch) for (let i = 0; i < bots; i++) await p.locator(`.opp-row[data-opp="${i}"] button[data-char="${ch}"]`).click();
    await p.locator('button.act.primary').last().click();
    await p.waitForTimeout(Number(process.env.LOAD_MS ?? 30000));
    const roll = p.locator('.actions button.act', { hasText: /Roll/ }); if (await roll.count()) await roll.first().click({ force: true });
    await p.waitForTimeout(Number(process.env.PLAY_MS ?? 7000));
    await p.screenshot({ path: `${out}/${which}${tag}-${gfx}-${bots + 1}p${process.env.ME ? '-me' : ''}.jpg`, type: 'jpeg', quality: 80, timeout: 120000 });
    if (process.env.SECOND) { await p.waitForTimeout(Number(process.env.SECOND)); await p.screenshot({ path: `${out}/${which}${tag}-${gfx}-${bots + 1}p${process.env.ME ? '-me' : ''}-b.jpg`, type: 'jpeg', quality: 80, timeout: 120000 }); }
    await ctx.close();
  }));
}
console.log(which, errs.length ? 'ERRORS\n' + errs.join('\n') : 'no page errors');
await b.close();
