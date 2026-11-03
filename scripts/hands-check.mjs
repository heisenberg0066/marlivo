// Arms/hands check for the sculpted-hand characters: a practice game with OPPS as bot opponents (and ME as the
// player), screenshots every INT ms after the first roll (idle + the opening peeks = card plays), plus per-frame arm
// metrics from the live actors: elbow angle, hand height above the table top, hand distance from the table centre.
// Usage: [BASE=...] [OPPS=livo,ammar,tango] [ME=biscuit] [GFX=high] [SIZE=laptop|phone|big] [N=8] [INT=1500]
//        node scripts/hands-check.mjs <outDir> [tag]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.env.BASE ?? 'http://localhost:4173/marlivo/';
const out = process.argv[2] ?? '/tmp/hands'; const tag = process.argv[3] ?? 'run'; mkdirSync(out, { recursive: true });
const opps = (process.env.OPPS ?? 'livo,ammar,tango').split(','); const me = process.env.ME ?? 'biscuit';
const sizes = { phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, laptop: { viewport: { width: 1280, height: 720 } }, big: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 } };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
const sz = { ...sizes[process.env.SIZE ?? 'laptop'] }; if (process.env.DSF) sz.deviceScaleFactor = Number(process.env.DSF);
const ctx = await b.newContext(sz);
await ctx.addInitScript(([g, c]) => { localStorage.setItem('marlivo.prefs', JSON.stringify({ name: 'Ammar', characterId: c, speed: 'normal', sound: false, renderer: '3d', graphics: g })); localStorage.setItem('marlivo.lang', 'en'); }, [process.env.GFX ?? 'high', me]);
const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
await p.goto(base + '#/practice'); await p.waitForTimeout(800);
await p.locator('.seg').nth(0).locator('button').nth(opps.length - 1).click();
for (let i = 0; i < opps.length; i++) await p.locator(`.opp-row[data-opp="${i}"] button[data-char="${opps[i]}"]`).click();
await p.locator('button.act.primary').last().click();
await p.waitForTimeout(Number(process.env.LOAD_MS ?? 30000));
const metrics = []; let skipped = true; let peeked = false;
const N = Number(process.env.N ?? 8), INT = Number(process.env.INT ?? 1500);
for (let k = 0; k < N; k++) {
  await p.waitForTimeout(k === 0 ? Number(process.env.FIRST ?? 1500) : INT);
  if (!peeked && await p.getByText(/to peek/).count()) {
    const vp = p.viewportSize(); // tap two of my own cards (bottom centre of the table)
    for (const [fx, fy] of [[0.455, 0.69], [0.5, 0.69]]) await p.mouse.click(vp.width * fx, vp.height * fy).catch(() => {});
    peeked = true;
  }
  if (await p.getByText(/Tap (a|one of your) card/).count()) { const vp = p.viewportSize(); await p.mouse.click(vp.width * 0.5, vp.height * 0.69).catch(() => {}); }
  // keep the game moving (roll, skip the peek, draw + throw on our turn) so the bots play cards
  for (const re of [/^Yes$/, /Roll!/, /^Skip$/, /^Draw$/, /^Throw$/, /Memorized|Done/]) {
    if (re.source === '^Skip$' && skipped) continue;
    const bt = p.getByRole('button', { name: re }); if (await bt.count()) { await bt.first().click({ force: true, timeout: 2000 }).catch(() => {}); if (re.source === '^Yes$') skipped = true; break; }
  }
  await p.screenshot({ path: `${out}/${tag}-${String(k).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 85, timeout: 120000 });
  metrics.push(await p.evaluate(() => {
    const reg = window.__mlEmote?.actors; if (!reg) return null; const o = [];
    for (const a of reg.values()) {
      if (!a.arms) continue; const r = { seat: a.seat, id: a.id };
      for (const sd of ['L', 'R']) {
        const c = a.arms[sd]; if (!c) continue;
        const S = c.up.getWorldPosition(new c.up.position.constructor()), E = c.fore.getWorldPosition(new c.up.position.constructor()), H = (c.curl ?? c.hand).getWorldPosition(new c.up.position.constructor());
        const u = S.clone().sub(E).normalize(), v = H.clone().sub(E).normalize();
        const tip = (c.curl ?? c.hand).localToWorld(new c.up.position.constructor(0, -0.045, 0)); const cm = a.cmd?.arm?.[sd];
        const cam = window.__mlCamObj; let scr = null; if (cam) { const q = H.clone().project(cam); const cv = [...document.querySelectorAll('canvas')].sort((x, y) => y.clientWidth * y.clientHeight - x.clientWidth * x.clientHeight)[0]; const R = cv ? cv.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight }; scr = [+(R.left + (q.x * 0.5 + 0.5) * R.width).toFixed(0), +(R.top + (-q.y * 0.5 + 0.5) * R.height).toFixed(0)]; }
        r[sd] = { scr, tipY: +tip.y.toFixed(3), tipR: +Math.hypot(tip.x, tip.z).toFixed(3), act: cm ? (cm.hold ? 'hold' : 'reach') + (+cm.w).toFixed(2) : '', elbow: +(Math.acos(Math.max(-1, Math.min(1, u.dot(v)))) * 180 / Math.PI).toFixed(0), handY: +H.y.toFixed(3), handR: +Math.hypot(H.x, H.z).toFixed(3), elbY: +E.y.toFixed(3) };
      }
      o.push(r);
    }
    return o;
  }));
}
writeFileSync(`${out}/${tag}-metrics.json`, JSON.stringify(metrics));
for (const id of new Set(opps)) {
  const rows = metrics.flat().filter((r) => r && r.id === id);
  const el = rows.flatMap((r) => [r.L?.elbow, r.R?.elbow]).filter((x) => x !== undefined);
  const hy = rows.flatMap((r) => [r.L?.handY, r.R?.handY]).filter((x) => x !== undefined);
  const tips = rows.flatMap((r) => [r.L, r.R]).filter((x) => x && x.tipR < 0.97).map((x) => x.tipY);
  console.log(tag, id, 'fingertip Y over the table min', tips.length ? Math.min(...tips) : '-', 'active frames', rows.filter((r) => (r.L?.act || r.R?.act)).length);
  console.log(tag, id, 'elbow deg min/med/max', Math.min(...el), el.sort((a, b) => a - b)[el.length >> 1], Math.max(...el), 'handY min/max', Math.min(...hy), Math.max(...hy));
}
console.log(tag, errs.length ? 'ERRORS\n' + errs.join('\n') : 'no page errors');
await b.close();
