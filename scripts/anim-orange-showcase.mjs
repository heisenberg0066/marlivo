import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.env.BASE ?? 'http://127.0.0.1:8812/marlivo/';
const out = process.env.OUT ?? '/tmp/orange_showcase';
mkdirSync(out, { recursive: true });

const GL = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: GL });
const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
await ctx.addInitScript(() => {
  localStorage.setItem('marlivo.animstep', '1');
  localStorage.setItem('marlivo.prefs', JSON.stringify({
    name: 'Biscuit', characterId: 'biscuit', speed: 'normal', sound: false,
    renderer: '3d', scene: 'golden', graphics: 'high', camera: 'seat', confirmSwap: false
  }));
  localStorage.setItem('marlivo.lang', 'en');
});

const p = await ctx.newPage();
const adv = (ms, fr = 50) => p.evaluate(([a, f]) => window.__mlAdvance(a, f), [ms, fr]);
const btn = async (re) => {
  const l = p.locator('.actions button.act', { hasText: re });
  if (await l.count()) { await l.first().click({ force: true, timeout: 1500, noWaitAfter: true }).catch(() => {}); return true; }
  return false;
};

await p.goto(base + '#/practice');
await adv(300, 50);
await p.locator('.seg').nth(0).locator('button').nth(2).click(); // 3 bots (4 players)
await p.locator('.seg').nth(2).locator('button').nth(0).click(); // 4 cards
await p.locator('[data-opp="0"] [data-char="tango"]').click();
await p.locator('[data-opp="1"] [data-char="tango"]').click();
await p.locator('[data-opp="2"] [data-char="ammar"]').click();
await p.locator('button.act.primary').last().click();

for (let k = 0; k < 28; k++) {
  await adv(150, 75);
  await p.waitForTimeout(950);
}

// Roll die and finish the opening peeks so we are in PLAY phase with all characters settled at the table
for (let k = 0; k < 55; k++) {
  await adv(250, 50);
  const ph = await p.evaluate(() => window.__ml?.view?.phase ?? '');
  if (ph === 'START_ROLL') await btn(/Roll/);
  else if (ph === 'PEEK') {
    const sel = await p.evaluate(() => window.__ml3dHook?.selectable ?? []);
    if (sel.length) {
      const xy = await p.evaluate((id) => window.__ml3dHook?.slot(id), sel[0]);
      if (xy) await p.mouse.click(xy.x, xy.y);
    } else {
      await btn(/Memori/);
    }
  } else if (ph === 'PLAY') {
    break;
  }
}

let frameIdx = 0;
const snapOne = async () => {
  const fn = `${out}/f${String(frameIdx++).padStart(4, '0')}.jpg`;
  await p.screenshot({ path: fn, type: 'jpeg', quality: 86, timeout: 120000 });
  await adv(50, 50);
};

// Phase 1 (Frames 0..49, 2.5s): Living relaxed idle + smooth hand-reached bot turns & overlapping arm return
for (let i = 0; i < 50; i++) {
  await snapOne();
}

// Phase 2 (Frames 50..94, 2.25s): Player & bot draw/throw/peek actions
for (let i = 0; i < 45; i++) {
  if (i % 10 === 0) {
    const st = await p.evaluate(() => {
      const v = window.__ml?.view; const r = v?.round;
      return { ph: v?.phase, cur: r?.current, you: v?.you, drawn: r?.drawn?.by, active: r?.active?.k };
    });
    if (st.ph === 'PLAY' && st.cur === st.you && !st.active) {
      if (st.drawn === st.you) await btn(/Throw/);
      else {
        const dxy = await p.evaluate(() => window.__ml3dHook?.deck());
        if (dxy) await p.mouse.click(dxy.x, dxy.y);
      }
    }
  }
  await snapOne();
}

// Phase 3 (Frames 95..139, 2.25s): Expressive mouths & reactions (Top Orange guy big open laugh, Left Orange guy shocked slam, Right Ammar wave)
await p.evaluate(() => {
  window.__mlEmote?.trigger(2, 'cheer', { duration: 2400 });
  window.__mlEmote?.trigger(1, 'slam', { duration: 2400 });
  window.__mlEmote?.trigger(3, 'wave', { duration: 2200 });
  window.__mlWaiter?.trigger('visit', { outfit: 'full', progress: 0.62 });
});
for (let i = 0; i < 45; i++) {
  await snapOne();
}

console.log('Recorded orange showcase frames:', frameIdx);
await b.close();
