// Frame-accurate animation capture of the 3D table: fake clock (Playwright page.clock) so every frame is exactly
// STEP ms of game time apart, however slow software WebGL is. Plays the human seat simply (skip peeks, draw, throw)
// and records every animated event (bot or human) as its own frame sequence.
// Usage: node scripts/anim-frames.mjs laptop|phone <bots 1-3> <events to record> <outDir> [high|low]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.env.BASE ?? 'http://localhost:4173/marlivo/';
const which = process.argv[2] ?? 'laptop'; const bots = Number(process.argv[3] ?? 3); const want = Number(process.argv[4] ?? 4);
const out = process.argv[5] ?? '/tmp/anim'; const gfx = process.argv[6] ?? 'high'; mkdirSync(out, { recursive: true });
const STEP = Number(process.env.STEP ?? 50), LEN = Number(process.env.LEN ?? 1800);
const only = (process.env.ONLY ?? 'DREW,THROWN,SWAPPED,PENALTY_DEALT,TEN_GIVEN,JACK_SWAPPED,QUEEN_PEEKED,PEEKED').split(',');
const sizes = { phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, laptop: { viewport: { width: 1280, height: 720 } } };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext(sizes[which]);
await ctx.addInitScript(([g, sp]) => { localStorage.setItem('marlivo.prefs', JSON.stringify({ name: 'Ammar', characterId: 'ammar', speed: sp, sound: false, renderer: '3d', graphics: g, confirmSwap: false })); localStorage.setItem('marlivo.lang', 'en'); }, [gfx, process.env.SPEED ?? 'normal']);
const T00 = Date.now(); const p = await ctx.newPage();
await p.clock.install();
await p.clock.pauseAt(Date.now() + 1000);
const tick = async (ms) => { for (let k = 0; k < ms; k += 100) await p.clock.runFor(Math.min(100, ms - k)); };
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(base + '#/practice'); await tick(500);
await p.locator('.seg').nth(0).locator('button').nth(bots - 1).click();
await p.locator('button.act.primary').last().click();
for (let k = 0; k < Number(process.env.LOADMS ?? 30000); k += 1000) { await tick(200); await p.waitForTimeout(800); }
const click = async (re) => { const l = p.locator('.actions button.act, .modal button, dialog button', { hasText: re }); if (await l.count()) { await l.first().click({ timeout: 2000, noWaitAfter: true }).catch(() => {}); return true; } return false; };
await click(/Roll/); console.log("rolled", Date.now() - T00); await p.screenshot({ path: out + "/start.jpg" });
const state = () => Promise.race([new Promise((_, j) => setTimeout(() => j(new Error("eval timeout")), 20000)), p.evaluate(() => { const v = window.__ml?.view; const r = v?.round; return { n: (v?.log ?? []).length, last: (v?.log ?? []).slice(-3).map((e) => e.t), my: !!(r && r.current === v.you && v.phase === 'PLAY' && !r.drawn && !r.active), held: !!(r && r.drawn?.by === v.you), phase: v?.phase, seat: r?.current }; })]);
let rec = 0, seenN = (await state()).n; const t0 = Date.now();
while (rec < want && Date.now() - t0 < 600000) {
  await tick(150);
  const st = await state();
  if (st.my) { const xy = await p.evaluate(() => window.__ml3dHook?.deck()); if (xy) await p.mouse.click(xy.x, xy.y); }
  else if (st.held) { await click(/Throw|Discard/); }
  else { await click(/^Skip$|^Yes$|Continue|Ready|Next/); }
  // a new animated event? freeze time and step through it frame by frame
  const ev = await p.evaluate((n) => (window.__ml?.view?.log ?? []).slice(n).map((e) => e.t + ':' + (e.p?.seat ?? '')), seenN);
  if (!ev.length) continue;
  seenN += ev.length;
  const hit = ev.find((e) => only.includes(e.split(':')[0]));
  if (!hit) continue;
  const dir = `${out}/${String(rec).padStart(2, '0')}-${hit.replace(':', '-s')}`; mkdirSync(dir, { recursive: true });
  for (let t = 0; t <= LEN; t += STEP) { await p.screenshot({ path: `${dir}/f${String(t).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 75 }); await p.clock.runFor(STEP); }
  console.log('recorded', dir); rec++;
}
await b.close();
