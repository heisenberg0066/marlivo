// Headless end-to-end check: plays a whole solo match vs bots through the real UI (clicks only), records which
// rules/animations were exercised, and saves screenshots. Usage: node scripts/e2e-solo.mjs phone|laptop en|fr
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const base = process.env.BASE ?? 'http://localhost:4173/marlivo/';
const which = process.argv[2] ?? 'phone';
const lang = process.argv[3] ?? 'en';
const out = process.env.OUT ?? 'docs/screenshots';
const maxMs = Number(process.env.MAXMS ?? 600000);
mkdirSync(out, { recursive: true });
const sizes = { phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, laptop: { viewport: { width: 1366, height: 768 } } };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext(sizes[which]);
await ctx.addInitScript(([l]) => {
  if (!localStorage.getItem('marlivo.prefs')) localStorage.setItem('marlivo.prefs', JSON.stringify({ name: 'Ammar', speed: 'fast', sound: false }));
  localStorage.setItem('marlivo.lang', l);
}, [lang]);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror ' + e.stack));
p.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text()); });
const shot = async (name) => { await p.screenshot({ path: `${out}/${which}-${lang}-${name}.png` }); };
const shotsDone = new Set();
const once = async (key) => { if (shotsDone.has(key)) return; shotsDone.add(key); await shot(key); };

await p.goto(base + '#/');
await p.waitForTimeout(1200);
await once('home');
await p.goto(base + '#/howto'); await p.waitForTimeout(600); await once('howto');
await p.goto(base + '#/practice'); await p.waitForTimeout(300);
await once('practice');
// 2 bots, normal, 4 cards, target 2, fast bots
await p.locator('.seg').nth(0).locator('button').nth(1).click();
await p.locator('.seg').nth(2).locator('button').nth(0).click();
await p.locator('.seg').nth(3).locator('button').nth(1).click();
await p.locator('.seg').nth(4).locator('button').nth(2).click();
await p.locator('.seg').nth(5).locator('button').nth(1).click(); // memory helper: own cards (the e2e player uses it to play sensibly)
await p.locator('button.act.primary').last().click();

const seen = new Set();
const t0 = Date.now();
let lastLogLen = 0, rounds = 0, stuck = 0, lastSig = '';
const rand = (n) => Math.floor(Math.random() * n);
while (Date.now() - t0 < maxMs) {
  await p.waitForTimeout(250);
  const st = await p.evaluate(() => {
    const s = window.__ml; const v = s?.view;
    const r = v?.round;
    const log = (v?.log ?? []).map((e) => e.t + (e.p.verdict ? ':' + e.p.verdict : '') + (e.p.power ? ':' + e.p.power : '') + (e.p.reason ? ':' + e.p.reason : '') + (e.t === 'ATTEMPT_END' ? ':' + e.p.result + ':' + (e.p.played?.length ?? 0) : ''));
    return { phase: v?.phase, you: v?.you, active: r?.active?.k, power: r?.active?.power, owner: r?.active?.owner, seat: r?.active?.seat, peekSlot: r?.active?.peekSlot, turnPlayer: r?.active?.turnPlayer,
      current: r?.current, drawnBy: r?.drawn?.by, window: r?.window?.target, log, roundNo: v?.roundNo, starterReason: r?.starterReason, scores: v?.scores, matchWinner: v?.matchWinner, busy: !!document.querySelector('.fly-card'),
      mineSlots: r ? r.areas[v.you].filter((x) => !x.empty).map((x) => ({ id: x.id, g: x.ghost?.r ?? 0, f: x.face?.r ?? 0 })) : [], drawnR: r?.drawn?.face?.r ?? 0, flipped: r?.active?.flipped ?? [], tentative: r?.active?.tentative ?? [], buttons: [...document.querySelectorAll('.actions button.act')].map((x) => x.textContent), selectable: document.querySelectorAll('.slot.selectable').length, mine: r ? r.areas[v.you]?.filter((x) => !x.empty).length : 0, tentSum: r?.active?.sum, target: r?.active?.target };
  });
  for (const l of st.log) seen.add(l.split(':').slice(0, 3).join(':'));
  if (st.starterReason) seen.add('start:' + st.starterReason);
  if (st.busy && !shotsDone.has('anim')) { await once('anim'); }
  const sig = JSON.stringify([st.phase, st.active, st.current, st.drawnBy, st.log.length, st.buttons]);
  stuck = sig === lastSig ? stuck + 1 : 0; lastSig = sig;
  if (stuck > 200) { errs.push('STUCK ' + sig); break; }
  if (st.phase === 'MATCH_END') { await p.waitForTimeout(1500); await once('match-end'); break; }
  const btn = async (re) => { const l = p.locator('.actions button.act', { hasText: re }); if (await l.count()) { await l.first().click(); return true; } return false; };
  const clickSel = async (k = 0, sel = '.slot.selectable') => { const l = p.locator(sel); const n = await l.count(); if (!n) return false; await l.nth(k % n).click({ force: true }); return true; };
  const clickSlot = async (id) => { await p.locator(`[data-slot="${id}"]`).click({ force: true }); };
  if (st.phase === 'START_ROLL') { if (await btn(/Roll|Lancer/)) { await p.waitForTimeout(350); await once('dice'); await p.waitForTimeout(1500); await once('deal-anim'); } continue; }
  if (st.phase === 'PEEK') {
    if (st.selectable && st.buttons.every((x) => !/Memori|mémoris/i.test(x))) { await p.waitForTimeout(300); await once('deal-done'); await clickSel(0); await p.waitForTimeout(300); await clickSel(0); await p.waitForTimeout(400); await once('peek'); continue; }
    await btn(/Memori|mémoris/i); continue;
  }
  if (st.phase === 'ROUND_END') {
    await p.waitForTimeout(1200);
    await once('round-end');
    const nb = p.locator('.end-panel button.primary'); if (await nb.count() && await nb.isEnabled()) { await nb.click(); rounds++; }
    continue;
  }
  if (st.phase !== 'PLAY') continue;
  // finish choice
  if (st.active === 'finish' && st.turnPlayer === st.you) { await once('finish-choice'); await btn(/Try|Tenter/); continue; }
  if (st.active === 'power' && st.owner === st.you) {
    if (st.power === 'J') { await once('jack'); await clickSel(rand(9)); await p.waitForTimeout(150); await clickSel(rand(9) + 1); await p.waitForTimeout(150); if (!(await btn(/^Swap$|^Échanger$/))) await btn(/Skip|Passer/); continue; }
    if (st.power === 'Q') { if (!st.peekSlot) { await clickSel(rand(9)); await p.waitForTimeout(400); await once('queen'); } else await btn(/Done|Terminé|OK/); continue; }
    if (st.power === '10') { await once('ten'); await btn(/→/); continue; }
  }
  if (st.active === 'attempt' && st.seat === st.you) {
    await once('attempt');
    const left = st.target - (st.tentSum ?? 0);
    const unflipped = st.mineSlots.filter((x) => !st.flipped.includes(x.id));
    const exact = unflipped.find((x) => x.g === left) ?? unflipped.find((x) => x.g && x.g < left);
    if (exact) { await clickSlot(exact.id); }
    else if (unflipped.length && Math.random() < 0.5) { await clickSlot(unflipped[rand(unflipped.length)].id); }
    else { await btn(/Give up|Abandon/); await p.waitForTimeout(200); const y = p.locator('.overlay .panel button.primary'); if (await y.count()) await y.click(); }
    await p.waitForTimeout(150);
    continue;
  }
  // window open → sometimes try matching
  const matchBtn = st.buttons.find((x) => /^(Match|Assortir)/.test(x));
  const known = st.mineSlots.filter((x) => x.g);
  const canSingle = known.some((x) => x.g === st.window);
  const canPair = known.some((x, i) => known.some((y, j) => i !== j && x.g + y.g === st.window));
  if (matchBtn && (canSingle || canPair || Math.random() < 0.06)) { await btn(/^(Match|Assortir)/); continue; }
  if (st.current === st.you && !st.active) {
    if (st.drawnBy === st.you) {
      await once('drawn');
      const unknown = st.mineSlots.filter((x) => !x.g);
      const worst = [...st.mineSlots].filter((x) => x.g).sort((a, b) => b.g - a.g)[0];
      let target = null;
      if (worst && worst.g > st.drawnR + 2) target = worst.id; else if (unknown.length && st.drawnR <= 5) target = unknown[rand(unknown.length)].id;
      if (!target) { await btn(/Throw|Défausser/); await p.waitForTimeout(140); await once('throw-anim'); }
      else { await clickSlot(target); await p.waitForTimeout(120); await once('swap-pick'); await btn(/^(Swap|Échanger) #/); await p.waitForTimeout(160); await once('swap-anim'); }
    } else if (st.buttons.some((x) => /Draw|Piocher/.test(x))) { await btn(/Draw|Piocher/); await p.waitForTimeout(150); await once('draw-anim'); }
  }
}
await p.waitForTimeout(500);
const final = await p.evaluate(() => ({ phase: window.__ml?.view?.phase, scores: window.__ml?.view?.scores, winner: window.__ml?.view?.matchWinner, rounds: window.__ml?.view?.roundNo }));
console.log(JSON.stringify({ which, lang, final, ms: Date.now() - t0, seen: [...seen].sort(), shots: [...shotsDone] }, null, 1));
if (errs.length) console.log('ERRORS:\n' + errs.join('\n'));
await b.close();
