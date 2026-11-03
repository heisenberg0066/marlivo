// v0.9 outfit picker check: Home + Practice pickers (Livo), choice persisted in localStorage, then a practice game with
// a Livo bot wearing the chosen outfit. Usage: [BASE=...] node scripts/outfit-ui-check.mjs <outDir> [outfit]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const base = process.env.BASE ?? 'http://localhost:4173/marlivo/';
const out = process.argv[2] ?? '/tmp/outfit-ui'; const want = process.argv[3] ?? 'denim'; mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => { if (!localStorage.getItem('marlivo.prefs')) localStorage.setItem('marlivo.prefs', JSON.stringify({ name: 'Ammar', characterId: 'biscuit', sound: false, renderer: '3d', graphics: 'high' })); localStorage.setItem('marlivo.lang', 'en'); });
const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
await p.goto(base + '#/'); await p.waitForTimeout(1500);
if (await p.locator('.outfits').count()) errs.push('outfit picker shown for a character without outfits');
await p.locator('.home .chars button.char').nth(7).click(); await p.waitForTimeout(800);
const n = await p.locator('.outfits button.outfit').count(); console.log('home outfit buttons', n);
await p.screenshot({ path: `${out}/home-picker.jpg`, type: 'jpeg', quality: 85 });
await p.locator(`.outfits button[data-outfit="${want}"]`).click(); await p.waitForTimeout(500);
const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('marlivo.prefs') || '{}').outfits);
console.log('saved', JSON.stringify(saved));
await p.locator('.outfits').screenshot({ path: `${out}/home-picker-crop.jpg`, type: 'jpeg', quality: 90 });
await p.goto(base + '#/practice'); await p.waitForTimeout(1200);
console.log('practice outfit buttons', await p.locator('.outfits button.outfit').count(), 'checked', await p.locator('.outfits button.outfit[aria-checked="true"]').getAttribute('data-outfit'));
await p.locator('.opp-row[data-opp="0"] button[data-char="livo"]').click();
await p.screenshot({ path: `${out}/practice-picker.jpg`, type: 'jpeg', quality: 85, fullPage: true });
await p.locator('button.act.primary').last().click();
await p.waitForTimeout(Number(process.env.LOAD_MS ?? 25000));
await p.screenshot({ path: `${out}/game-${want}.jpg`, type: 'jpeg', quality: 85 });
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no page errors');
await b.close();
