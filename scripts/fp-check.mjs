// First-person hand check: practice game as ME, peeks two cards (peek hand), then keeps playing (held/move hands);
// fast screenshots of the lower half of the screen where the first-person hand appears.
// Usage: [ME=tango] [GFX=high] [N=24] [INT=250] node scripts/fp-check.mjs <outDir> [tag]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const base = process.env.BASE ?? 'http://localhost:4173/marlivo/';
const out = process.argv[2] ?? '/tmp/fp'; const tag = process.argv[3] ?? 'fp'; mkdirSync(out, { recursive: true });
const me = process.env.ME ?? 'tango';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
await ctx.addInitScript(([g, c]) => { localStorage.setItem('marlivo.prefs', JSON.stringify({ name: 'Ammar', characterId: c, speed: 'normal', sound: false, renderer: '3d', graphics: g })); localStorage.setItem('marlivo.lang', 'en'); }, [process.env.GFX ?? 'high', me]);
const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
await p.goto(base + '#/practice'); await p.waitForTimeout(800);
await p.locator('.seg').nth(0).locator('button').nth(0).click();
await p.locator(`.opp-row[data-opp="0"] button[data-char="${process.env.OPP ?? 'livo'}"]`).click();
await p.locator('button.act.primary').last().click();
await p.waitForTimeout(Number(process.env.LOAD_MS ?? 25000));
const N = Number(process.env.N ?? 24), INT = Number(process.env.INT ?? 250);
let clicks = 0; let k = 0;
for (let i = 0; i < N * 4 && k < N; i++) {
  await p.waitForTimeout(INT);
  const vp = p.viewportSize();
  if (await p.getByText(/to peek/).count() && clicks < 2) { const fx = clicks ? 0.5 : 0.455; await p.mouse.click(vp.width * fx, vp.height * 0.69).catch(() => {}); clicks++; await p.waitForTimeout(350); }
  else if (await p.getByText(/Tap (a|one of your) card/).count()) { await p.mouse.click(vp.width * 0.5, vp.height * 0.69).catch(() => {}); await p.waitForTimeout(300); }
  else for (const re of [/Roll!/, /^Draw$/, /^Throw$/, /Memorized|Done/]) { const bt = p.getByRole('button', { name: re }); if (await bt.count()) { await bt.first().click({ force: true, timeout: 2000 }).catch(() => {}); await p.waitForTimeout(re.source === '^Draw$' ? 900 : 350); break; } }
  const vis = await p.evaluate(() => { const f = window.__mlFp?.(); return f ? Object.entries(f).filter(([, r]) => r && r.visible && r.parent).map(([n]) => n).join(',') : '?'; });
  if (vis && vis !== '?' || i % 6 === 0) { await p.screenshot({ path: `${out}/${tag}-${String(k).padStart(2, '0')}-${vis || 'none'}.jpg`, type: 'jpeg', quality: 85, clip: { x: 340, y: 330, width: 600, height: 340 } }); k++; }
}
console.log(tag, me, errs.length ? 'PAGE ERRORS ' + [...new Set(errs)].slice(0, 3).join(' | ') : 'no page errors');
await b.close();
