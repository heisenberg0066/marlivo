// Monkey test (v0.7 bug hunt): during my own draws and match attempts, tap randomly and fast all over the screen
// (cards, deck, pile, opponents, background, and the spot where the button I just pressed was) and check that
// nothing closes on its own: the attempt stays open until I press Done/Stop, the drawn card stays mine until I
// press Throw/Swap. Works in 2D and 3D. Usage: R3D=1 node scripts/monkey.mjs phone|laptop
import { chromium } from 'playwright-core';
const base = process.env.BASE ?? 'http://localhost:4173/marlivo/';
const which = process.argv[2] ?? 'phone';
const r3d = !!process.env.R3D;
const rounds = Number(process.env.N ?? 6);
const sizes = { phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, laptop: { viewport: { width: 1366, height: 768 } } };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext(sizes[which]);
await ctx.addInitScript(([r]) => {
  localStorage.setItem('marlivo.prefs', JSON.stringify({ name: 'Monkey', speed: 'fast', sound: false, renderer: r ? '3d' : '2d' }));
  localStorage.setItem('marlivo.lang', 'en');
}, [r3d]);
const p = await ctx.newPage();
const errs = [];
const dbg = async (tag) => { const f = `/tmp/monkey-${tag}.png`; await p.screenshot({ path: f }); console.error(tag, JSON.stringify(await state()), JSON.stringify(await p.evaluate(() => (window.__ml.view.log ?? []).slice(-6).map((e) => e.t + ' ' + JSON.stringify(e.p).slice(0, 90)))), await p.evaluate(() => [...document.querySelectorAll('.actions button, .overlay button')].map((b) => b.textContent + (b.disabled ? '(off)' : '')).join(' | ')), f); };
let lastTrace = 0;
p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
const tap = async (x, y) => { if (sizes[which].hasTouch) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); };
const W = sizes[which].viewport.width, H = sizes[which].viewport.height;
const state = () => p.evaluate(() => {
  const v = window.__ml?.view; const r = v?.round; const a = r?.active;
  return { phase: v?.phase, you: v?.you, a: a?.k, aSeat: a?.seat, owner: a?.owner, power: a?.power, turnPlayer: a?.turnPlayer, target: a?.target, sum: a?.sum, tentative: a?.tentative ?? [], current: r?.current, drawnBy: r?.drawn?.by, window: r?.window?.target, counts: r?.counts };
});
// a random point that is not on the action bar / header / drawers (those are real buttons the player chose to press)
const randomPoint = async () => {
  for (let i = 0; i < 20; i++) {
    const x = 5 + Math.random() * (W - 10), y = 5 + Math.random() * (H - 10);
    const bad = await p.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return !!el?.closest('footer, header, .actions, .drawer-back, .overlay, .toasts, button, .end-panel'); }, [x, y]);
    if (!bad) return { x, y };
  }
  return { x: W / 2, y: H * 0.4 };
};
const btnBox = async (re) => { const l = p.locator('.actions button.act', { hasText: re }); if (!(await l.count())) return null; return await l.first().boundingBox(); };
const press = async (re) => { const bb = await btnBox(re); if (!bb) return null; const c = { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }; await tap(c.x, c.y); return c; };

await p.goto(base + '#/practice'); await p.waitForTimeout(400);
await p.locator('.seg').nth(0).locator('button').nth(0).click(); // 1 bot
await p.locator('.seg').nth(2).locator('button').nth(0).click(); // 4 cards
await p.locator('.seg').nth(3).locator('button').nth(4).click(); // target 7 (a long match)
await p.locator('.seg').nth(4).locator('button').nth(1).click(); // bots normal speed
await p.locator('button.act.primary').last().click();
let draws = 0, attempts = 0, taps = 0, failures = [];
const t0 = Date.now();
while (Date.now() - t0 < 360000 && (draws < rounds || attempts < rounds)) {
  await p.waitForTimeout(200);
  const s = await state();
  if (Date.now() - lastTrace > 15000) { lastTrace = Date.now(); await dbg('trace'); }
  if (s.phase === 'START_ROLL') { await press(/Roll/); continue; }
  if (s.phase === 'PEEK') { if (!(await press(/Memori/))) { const l = p.locator('.slot.selectable'); if (await l.count()) await l.first().click({ force: true }); else { const h = await p.evaluate(() => window.__ml3dHook); if (h?.selectable?.length) { const xy = await p.evaluate((id) => window.__ml3dHook.slot(id), h.selectable[0]); if (xy) await tap(xy.x, xy.y); } } } continue; }
  if (s.phase === 'ROUND_END' || s.phase === 'MATCH_END') { const nb = p.locator('.end-panel button.primary'); if (await nb.count()) await nb.first().click().catch(() => {}); if (s.phase === 'MATCH_END') break; continue; }
  if (s.phase !== 'PLAY') continue;
  const yes = async () => { await p.waitForTimeout(450); const y = p.locator('.overlay .panel button.primary'); if (await y.count()) await y.click(); };
  if (s.a === 'power' && s.owner === s.you) { if (s.power === '10') await press(/→/); else if (await press(/Skip/)) await yes(); else await press(/Done/); continue; }
  if (s.a === 'finish' && s.turnPlayer === s.you) { await press(/Let/); continue; }
  if (s.a === 'attempt' && s.aSeat === s.you) { await press(/Stop/); await yes(); continue; }
  // 1) open a match attempt, then hammer the screen
  if (s.window && attempts < rounds && s.a !== 'attempt' && s.drawnBy !== s.you && (s.counts?.[s.you] ?? 0) > 1) {
    const at = await press(/^Match/);
    if (!at) continue;
    await p.waitForTimeout(30);
    const sm = await state(); if (sm.a !== 'attempt' || sm.aSeat !== sm.you) continue;
    for (let k = 0; k < 4; k++) { await tap(at.x, at.y); taps++; await p.waitForTimeout(60); } // finger keeps tapping where Match was
    let s2 = await state();
    if (s2.a !== 'attempt' || s2.aSeat !== s2.you) { if (s2.a === null && !s2.window) continue; /* the window closed before my claim (someone else acted) */ }
    if (s2.a === 'attempt' && s2.aSeat === s2.you) {
      attempts++;
      for (let k = 0; k < 25; k++) { const q = await randomPoint(); await tap(q.x, q.y); taps++; await p.waitForTimeout(40 + Math.random() * 120); }
      s2 = await state();
      if (s2.a !== 'attempt' || s2.aSeat !== s2.you) { failures.push(`attempt ${attempts} closed by itself (now ${s2.a})`); await dbg('closed' + attempts); }
      else {
        if (s2.tentative.length && s2.sum === s2.target) { await p.waitForTimeout(400); await press(/Done/); }
        else { await press(/Stop/); await p.waitForTimeout(300); const y = p.locator('.overlay .panel button.primary'); if (await y.count()) { await p.waitForTimeout(500); await y.click(); } }
        await p.waitForTimeout(400);
        const s3 = await state(); if (s3.a === 'attempt' && s3.aSeat === s3.you) { failures.push(`attempt ${attempts}: Done/Stop did not end it`); await dbg('notended' + attempts); }
      }
    }
    continue;
  }
  if (s.current === s.you && !s.a) {
    if (s.drawnBy !== s.you) {
      const at = await press(/^Draw/);
      if (!at) continue;
      await p.waitForTimeout(30);
      const sd = await state(); if (sd.drawnBy !== sd.you) continue; // the tap landed inside the new-button guard; try again
      for (let k = 0; k < 4; k++) { await tap(at.x, at.y); taps++; await p.waitForTimeout(70); } // where Draw was, Throw now is
      draws++;
      for (let k = 0; k < 20; k++) {
        const q = await randomPoint();
        // stray taps everywhere except my own cards (a tap there is a real choice: select for swap)
        const mine = await p.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); const sl = el?.closest('[data-slot]'); return !!sl && sl.getAttribute('data-slot').startsWith('S' + (window.__ml.view.you + 1) + '-'); }, [q.x, q.y]);
        if (mine) continue;
        if (r3d) { const near = await p.evaluate(([x, y]) => { const v = window.__ml.view; const h = window.__ml3dHook; return v.round.areas[v.you].some((sl) => { const c = h.slot(sl.id); return c && Math.hypot(c.x - x, c.y - y) < 60; }); }, [q.x, q.y]); if (near) continue; }
        await tap(q.x, q.y); taps++; await p.waitForTimeout(40 + Math.random() * 100);
      }
      const s2 = await state();
      if (s2.drawnBy !== s2.you) { failures.push(`draw ${draws} closed by itself`); await dbg('drawclosed' + draws); }
      else await press(/^Throw/);
      await p.waitForTimeout(300);
    }
  }
}
console.log(JSON.stringify({ which, r3d, draws, attempts, taps, failures, errs: errs.slice(0, 5) }));
await b.close();
process.exit(failures.length || errs.length ? 1 : 0);
