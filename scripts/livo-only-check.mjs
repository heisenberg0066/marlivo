// v0.11 check: Livo has one look (the chibi beanie build). With a stale saved adult outfit (prefs.outfits.livo) the
// Home, Practice and Lobby screens show no outfit picker, Livo's bust is livo.webp, the game loads livo.glb / livo-low.glb
// only (never livo_<outfit>*), and the table shows her. Usage: [BASE=...] [STALE=streetwear] node scripts/livo-only-check.mjs <outDir>
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const base = process.env.BASE ?? 'http://localhost:4173/marlivo/';
const out = process.argv[2] ?? '/tmp/livo-only'; mkdirSync(out, { recursive: true });
const stale = process.env.STALE ?? 'streetwear';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [], reqs = [];
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(([o]) => { if (!localStorage.getItem('marlivo.prefs')) localStorage.setItem('marlivo.prefs', JSON.stringify({ name: 'Ammar', characterId: 'livo', outfits: { livo: o }, sound: false, renderer: '3d', graphics: 'high' })); localStorage.setItem('marlivo.lang', 'en'); }, [stale]);
const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
p.on('request', (r) => { const u = r.url(); if (/livo[^/]*\.(glb|webp)/.test(u)) reqs.push(u.split('/').pop().split('?')[0]); });
const pickers = async (where) => { const n = await p.locator('.outfits, .outfit-row, button.outfit').count(); console.log(where, 'outfit picker elements', n); if (n) errs.push('outfit picker visible on ' + where); };
await p.goto(base + '#/'); await p.waitForTimeout(2500);
await pickers('home');
console.log('home selected', await p.locator('.home .chars button.char.on').getAttribute('aria-label'));
console.log('livo bust href', await p.locator('.home .chars button.char.on image').getAttribute('href'));
await p.screenshot({ path: `${out}/home-livo.jpg`, type: 'jpeg', quality: 88 });
await p.locator('.home .chars').screenshot({ path: `${out}/home-livo-crop.jpg`, type: 'jpeg', quality: 92 });
await p.goto(base + '#/practice'); await p.waitForTimeout(1500);
await pickers('practice');
await p.locator('.opp-row[data-opp="0"] button[data-char="livo"]').click().catch(() => {});
await p.screenshot({ path: `${out}/practice.jpg`, type: 'jpeg', quality: 85, fullPage: true });
// test tools on -> the room stays in the Lobby
await p.locator('label.row', { hasText: /test/i }).locator('input[type=checkbox]').check();
await p.locator('button.act.primary').last().click(); await p.waitForTimeout(4000);
await pickers('lobby');
await p.screenshot({ path: `${out}/lobby.jpg`, type: 'jpeg', quality: 85, fullPage: true });
// a normal practice game with a Livo bot opponent (me as Biscuit so Livo sits across the table; her stale outfit pref stays)
await p.evaluate(() => { const q = JSON.parse(localStorage.getItem('marlivo.prefs') || '{}'); q.characterId = 'biscuit'; localStorage.setItem('marlivo.prefs', JSON.stringify(q)); });
await p.goto(base + '#/practice'); await p.waitForTimeout(1500);
await p.locator('label.row', { hasText: /test/i }).locator('input[type=checkbox]').uncheck();
await p.locator('.opp-row[data-opp="0"] button[data-char="livo"]').click().catch(() => {});
await p.locator('button.act.primary').last().click();
await p.waitForTimeout(Number(process.env.LOAD_MS ?? 30000));
await p.screenshot({ path: `${out}/table-livo.jpg`, type: 'jpeg', quality: 88 });
console.log('saved prefs outfits', JSON.stringify(await p.evaluate(() => JSON.parse(localStorage.getItem('marlivo.prefs') || '{}').outfits)));
console.log('livo assets requested', JSON.stringify([...new Set(reqs)]));
if (reqs.some((u) => /livo_/.test(u))) errs.push('adult outfit asset requested');
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no page errors');
await b.close();
