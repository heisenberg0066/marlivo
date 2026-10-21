// Local two-window test mode (§17.2): one tab hosts a local room, a second tab joins over BroadcastChannel.
import { chromium } from 'playwright-core';
const base = process.env.BASE ?? 'http://localhost:4173/marlivo/';
const out = process.env.OUT ?? 'docs/screenshots';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 683, height: 768 } });
await ctx.addInitScript(() => { if (!localStorage.getItem('marlivo.prefs')) localStorage.setItem('marlivo.prefs', JSON.stringify({ name: 'Ammar', speed: 'fast', sound: false })); });
const A = await ctx.newPage();
const errs = []; for (const p of [A]) p.on('pageerror', (e) => errs.push(e.message));
await A.goto(base + '#/practice?test=1'); await A.waitForTimeout(400);
await A.locator('button.act.primary').last().click();
await A.waitForTimeout(1200);
const code = await A.evaluate(() => window.__ml.code);
const B = await ctx.newPage(); B.on('pageerror', (e) => errs.push(e.message));
await B.goto(base + `#/join-local/${code}?tag=P2`);
await B.waitForTimeout(2000);
const seatsA = await A.evaluate(() => window.__ml.view.seats.filter(Boolean).map((s) => s.name + (s.isBot ? '(bot)' : '')));
await B.locator('.me-setup button.act').click(); // Ready
await A.waitForTimeout(500);
await A.locator('.me-setup button.act').click(); await A.waitForTimeout(400); console.log('seats', await A.evaluate(() => JSON.stringify(window.__ml.view.seats.map((s) => s && [s.name, s.ready, s.isBot])))); await A.locator('.host-box button.act.primary').click({ timeout: 5000 }); // Start
await A.waitForTimeout(800);
const phases = [await A.evaluate(() => window.__ml.view.phase), await B.evaluate(() => window.__ml.view?.phase)];
const bSeat = await B.evaluate(() => window.__ml.seat);
await A.screenshot({ path: `${out}/two-window-host.png` }); await B.screenshot({ path: `${out}/two-window-guest.png` });
console.log(JSON.stringify({ code, seatsA, phases, bSeat, errs }));
await b.close();
