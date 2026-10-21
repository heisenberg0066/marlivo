import { chromium } from 'playwright-core';
const base = process.env.BASE ?? 'http://localhost:4173/marlivo/';
const out = process.env.OUT ?? '/tmp/shots';
const which = process.argv[2] ?? 'phone';
const sizes = { phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, laptop: { viewport: { width: 1366, height: 768 } } };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext(sizes[which]);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror ' + e.stack));
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push('console ' + m.text()); });
await p.goto(base + '#/practice');
await p.waitForTimeout(400);
await p.getByText('Sit down').click();
for (let i = 0; i < 8; i++) { await p.waitForTimeout(500); }
await p.screenshot({ path: `${out}/${which}-g1.png` });
console.log(await p.evaluate(() => document.querySelector('.status-line')?.textContent));
console.log(errs.join('\n'));
await b.close();
