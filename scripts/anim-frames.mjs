// Frame-accurate animation capture of the 3D table. The page runs on the app's virtual clock (debug/vclock.ts,
// localStorage marlivo.animstep=1), so every saved frame is exactly STEP ms of game time after the previous one,
// however slow software WebGL is. Plays the human seat simply and records each wanted event as a frame sequence.
// Usage: node scripts/anim-frames.mjs laptop|phone <bots 1-3> <events to record> <outDir> [high|low]
//   env: ONLY=DREW,THROWN,...  STEP=50  LEN=1600  LOADMS=30000  SPEED=normal|fast  SEAT=any|me|bots
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.env.BASE ?? 'http://localhost:4173/marlivo/';
const which = process.argv[2] ?? 'laptop'; const bots = Number(process.argv[3] ?? 3); const want = Number(process.argv[4] ?? 4);
const out = process.argv[5] ?? '/tmp/anim'; const gfx = process.argv[6] ?? 'high'; mkdirSync(out, { recursive: true });
const STEP = Number(process.env.STEP ?? 50), LEN = Number(process.env.LEN ?? 1600), SEAT = process.env.SEAT ?? 'any';
const only = (process.env.ONLY ?? 'DREW,THROWN,SWAPPED,PENALTY_DEALT,TEN_GIVEN,JACK_SWAPPED,QUEEN_PEEKED,PEEK_PICKED').split(',');
const sizes = { phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, laptop: { viewport: { width: 1280, height: 720 } } };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext(sizes[which]);
await ctx.addInitScript(([g, sp]) => { localStorage.setItem('marlivo.animstep', '1'); localStorage.setItem('marlivo.prefs', JSON.stringify({ name: 'Ammar', characterId: 'ammar', speed: sp, sound: false, renderer: '3d', graphics: g, confirmSwap: false })); localStorage.setItem('marlivo.lang', 'en'); }, [gfx, process.env.SPEED ?? 'normal']);
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
const race = (pr, ms, v) => Promise.race([pr, new Promise((r) => setTimeout(() => r(v), ms))]);
const adv = async (ms, fr = 1000 / 60) => {
  const r = await race(p.evaluate(([a, f]) => window.__mlAdvance(a, f), [ms, fr]), 120000, 'TIMEOUT'); // software WebGL can take seconds per frame (shader compiles, glow passes)
  if (r === 'TIMEOUT') { console.log('advance hung', ms, fr, JSON.stringify(await race(p.evaluate(() => [window.__mlNow?.(), window.__ml?.view?.phase]), 5000, 'eval hung'))); await p.screenshot({ path: out + '/hung.jpg' }).catch(() => {}); process.exit(2); }
  return r;
};
const tap = async (xy) => { if (!xy) return; if (which === 'phone') await p.touchscreen.tap(xy.x, xy.y); else await p.mouse.click(xy.x, xy.y); };
const btn = async (re) => { const l = p.locator('.actions button.act, .overlay .panel button', { hasText: re }); if (await l.count()) { await l.first().click({ force: true, timeout: 1500, noWaitAfter: true }).catch(() => {}); return true; } return false; };
await p.goto(base + '#/practice'); await adv(300);
await p.locator('.seg').nth(0).locator('button').nth(bots - 1).click();
await p.locator('button.act.primary').last().click();
for (let k = 0; k < Number(process.env.LOADMS ?? 30000); k += 1000) { await adv(200, 100); await p.waitForTimeout(800); }
const state = () => p.evaluate(() => { const v = window.__ml?.view; const r = v?.round; return { n: (v?.log ?? []).length, you: v?.you, phase: v?.phase, cur: r?.current, drawn: r?.drawn?.by, active: r?.active?.k, owner: r?.active?.owner, aseat: r?.active?.seat, peekSlot: r?.active?.peekSlot, buttons: [...document.querySelectorAll('.actions button.act')].map((x) => x.textContent), sel: window.__ml3dHook?.selectable ?? [] }; });
let seenN = (await state()).n, rec = 0; const t0 = Date.now(); const idx = [];
while (rec < want && Date.now() - t0 < Number(process.env.MAXMS ?? 900000)) {
  await adv(200, 100);
  const st = await state();
  const mine = (id) => id.startsWith(`p${st.you + 1}-`);
  if (st.phase === 'START_ROLL') await btn(/Roll/);
  else if (st.phase === 'PEEK') { const s = st.sel; if (s.length) { await tap(await p.evaluate((i) => window.__ml3dHook.slot(i), s[0])); await adv(400, 50); } else await btn(/Memori/); }
  else if (st.phase === 'ROUND_END') { const nb = p.locator('.end-panel button.primary'); if (await nb.count()) await nb.click({ force: true, noWaitAfter: true }).catch(() => {}); }
  else if (st.phase === 'PLAY') {
    if (st.active === 'power' && st.owner === st.you) { if (!(await btn(/Skip|Done|OK/))) await btn(/→/); }
    else if (st.active === 'attempt' && st.aseat === st.you) { await btn(/Stop/); await adv(300, 50); await btn(/Yes|OK|Stop/); }
    else if (st.active === 'finish') await btn(/Skip|No|Pass|Later/);
    else if (st.cur === st.you && !st.active) { if (st.drawn === st.you) await btn(/Throw/); else await tap(await p.evaluate(() => window.__ml3dHook?.deck())); }
  }
  const ev = await p.evaluate((n) => (window.__ml?.view?.log ?? []).slice(n).map((e) => ({ t: e.t, seat: e.p?.seat ?? e.p?.by ?? e.p?.to })), seenN);
  if (!ev.length) continue;
  seenN += ev.length;
  const hit = ev.find((e) => only.includes(e.t) && (SEAT === 'any' || (SEAT === 'me') === (e.seat === st.you)));
  if (!hit) continue;
  const name = `${String(rec).padStart(2, '0')}-${hit.t}-s${hit.seat}${hit.seat === st.you ? 'me' : ''}`;
  const dir = `${out}/${name}`; mkdirSync(dir, { recursive: true });
  for (let t = 0; t <= LEN; t += STEP) { await p.screenshot({ path: `${dir}/f${String(t).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 72, timeout: 180000 }); await adv(STEP, STEP); } // one render per saved frame: animations are time-based
  idx.push(name); console.log('recorded', name); rec++;
}
writeFileSync(`${out}/index.json`, JSON.stringify(idx));
await b.close();
