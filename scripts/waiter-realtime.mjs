// Real-time (no virtual clock) waiter probe: starts a local practice game with bots, takes a screenshot every
// INTERVAL ms for DURATION ms and logs the waiter's world position / job from window.__mlWaiter.state().
// env: PLAYERS=2|3|4 VW VH GFX=high|low DURATION INTERVAL OUT BASE
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.env.BASE ?? 'http://127.0.0.1:4192/marlivo/';
const players = Number(process.env.PLAYERS ?? 4);
const vw = Number(process.env.VW ?? 1280), vh = Number(process.env.VH ?? 800);
const gfx = process.env.GFX ?? 'high';
const duration = Number(process.env.DURATION ?? 150000), interval = Number(process.env.INTERVAL ?? 3000);
const out = process.env.OUT ?? `/workspace/sb/waiter/rt-${players}p-${vw}x${vh}-${gfx}`;
mkdirSync(out, { recursive: true });
const GL = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: GL });
const ctx = await b.newContext({ viewport: { width: vw, height: vh }, isMobile: vw < 600, hasTouch: vw < 600 });
await ctx.addInitScript(([g]) => {
  localStorage.removeItem('marlivo.animstep');
  localStorage.setItem('marlivo.prefs', JSON.stringify({ name: 'Ammar', speed: 'normal', sound: false, renderer: '3d', scene: 'golden', graphics: g, camera: 'seat', confirmSwap: false }));
  localStorage.setItem('marlivo.lang', 'en');
}, [gfx]);
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto(base + '#/practice');
await p.waitForTimeout(1500);
await p.locator('.seg').nth(0).locator('button').nth(players - 2).click();
await p.locator('.seg').nth(2).locator('button').nth(0).click();
await p.locator('button.act.primary').last().click();
// sample the waiter 5x per second inside the page (real time)
await p.evaluate(() => {
  const w = window; w.__wlog = [];
  const t0 = performance.now();
  setInterval(() => {
    const s = w.__mlWaiter?.state?.();
    if (!s) return;
    w.__wlog.push({ t: +((performance.now() - t0) / 1000).toFixed(2), pos: s.pos?.map((x) => +x.toFixed(3)) ?? null, yaw: +(s.yaw ?? 0).toFixed(2), kind: s.job?.kind ?? null, outfit: s.job?.outfit ?? null, vis: s.visible ?? null, mode: s.mode ?? null, speed: s.speed ?? null, stride: s.stride ?? null, tag: s.tag ?? null, on: s.onScreen ?? null, fL: s.footL, fR: s.footR });
  }, 200);
});
const t0 = Date.now(); let i = 0;
while (Date.now() - t0 < duration) {
  const ph = await p.evaluate(() => window.__ml?.view?.phase ?? '');
  if (ph === 'ROUND_END' || ph === 'SCORING') await p.evaluate(() => window.__ml?.intent({ t: 'NEXT_ROUND' })).catch(() => {});
  if (ph === 'START_ROLL') await p.evaluate(() => window.__ml?.intent({ t: 'ROLL_DIE' })).catch(() => {});
  if (ph === 'PEEK') await p.evaluate(() => { const s = window.__ml, v = s?.view; const me = v?.you ?? 0; const ids = (v?.round?.areas?.[me] ?? []).map((x) => x.id); for (const id of ids.slice(0, 2)) s.intent({ t: 'PEEK_PICK', slot: id }); s.intent({ t: 'PEEK_DONE' }); }).catch(() => {});
  // keep the human seat playing so the bots keep going: draw then discard
  await p.evaluate(() => { const s = window.__ml, v = s?.view, r = v?.round; if (!s || !v || !r || v.phase !== 'PLAY') return; const me = v.you ?? 0; const a = r.active; if (a && a.k === 'power' && a.owner === me) { if (a.power === 'J') s.intent({ t: 'JACK_SKIP' }); else if (a.power === 'Q') s.intent({ t: 'QUEEN_SKIP', confirm: true }); else if (a.power === '10') s.intent({ t: 'TEN_GIVE', to: (me + 1) % v.seats.length }); return; } if (r.current === me && !a) { if (!r.drawn) s.intent({ t: 'DRAW' }); else if (r.drawn.by === me) s.intent({ t: 'THROW' }); } }).catch(() => {});
  const ts = ((Date.now() - t0) / 1000).toFixed(0).padStart(3, '0');
  await p.screenshot({ path: `${out}/s${String(i).padStart(3, '0')}-t${ts}.jpg`, type: 'jpeg', quality: 80, timeout: 60000 });
  i++;
  const wait = t0 + i * interval - Date.now();
  if (wait > 0) await p.waitForTimeout(wait);
}
const log = await p.evaluate(() => window.__wlog);
writeFileSync(`${out}/waiter-log.json`, JSON.stringify(log));
const fps = await p.evaluate(() => new Promise((r) => { let n = 0; const s = performance.now(); const f = () => { n++; if (performance.now() - s < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
console.log('shots', i, 'log', log.length, 'fps', fps);
await b.close();
