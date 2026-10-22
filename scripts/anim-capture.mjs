// Records the 3D table during play as a frame sequence (CDP screencast) for animation review.
// Usage: node scripts/anim-capture.mjs laptop|phone <bots 1-3> <seconds> <outDir> [high|low]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.env.BASE ?? 'http://localhost:4173/marlivo/';
const which = process.argv[2] ?? 'laptop'; const bots = Number(process.argv[3] ?? 3); const secs = Number(process.argv[4] ?? 20);
const out = process.argv[5] ?? '/tmp/anim'; const gfx = process.argv[6] ?? 'high'; mkdirSync(out, { recursive: true });
const sizes = { phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, laptop: { viewport: { width: 1280, height: 720 } } };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext(sizes[which]);
await ctx.addInitScript(([g, sp]) => { localStorage.setItem('marlivo.prefs', JSON.stringify({ name: 'Ammar', characterId: 'ammar', speed: sp, sound: false, renderer: '3d', graphics: g })); localStorage.setItem('marlivo.lang', 'en'); }, [gfx, process.env.SPEED ?? 'normal']);
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(base + '#/practice'); await p.waitForTimeout(500);
await p.locator('.seg').nth(0).locator('button').nth(bots - 1).click();
await p.locator('button.act.primary').last().click();
await p.waitForTimeout(Number(process.env.LOADMS ?? 30000)); // models load
const roll = p.locator('.actions button.act', { hasText: /Roll/ }); if (await roll.count()) await roll.first().click();
const cdp = await ctx.newCDPSession(p);
const log = []; let n = 0; const t0 = Date.now();
cdp.on('Page.screencastFrame', async (f) => {
  const t = Date.now() - t0; const name = `f${String(n++).padStart(4, '0')}.jpg`;
  writeFileSync(`${out}/${name}`, Buffer.from(f.data, 'base64')); log.push({ name, t });
  try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 });
// the human seat: draw and keep (swap into slot 1) when it is my turn, so my own draw/peek also shows
const evs = [];
const end = Date.now() + secs * 1000;
while (Date.now() < end) {
  await p.waitForTimeout(250);
  const st = await p.evaluate(() => { const v = window.__ml?.view; const r = v?.round; return { t: (v?.log ?? []).slice(-1)[0]?.t, my: r && r.current === v.you && v.phase === 'PLAY' && !r.drawn && !r.active, phase: v?.phase }; });
  evs.push({ t: Date.now() - t0, ev: st.t });
  if (st.my) { const xy = await p.evaluate(() => window.__ml3dHook?.deck()); if (xy) await p.mouse.click(xy.x, xy.y); }
  else { const btn = p.locator('.actions button.act', { hasText: /Throw|Discard|Skip|Pass|Ready|Continue|OK|Roll/ }); if (await btn.count()) await btn.first().click().catch(() => {}); }
}
await cdp.send('Page.stopScreencast');
writeFileSync(`${out}/frames.json`, JSON.stringify({ frames: log, events: evs }));
console.log('frames', n, 'in', ((Date.now() - t0) / 1000).toFixed(1), 's');
await b.close();
