// Records a smooth 9-second (180 frames @ 20 fps) H.264 showcase clip in the Golden garden terrace using the
// deterministic virtual clock (marlivo.animstep=1).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.env.BASE ?? 'http://127.0.0.1:8812/marlivo/';
const out = process.env.OUT ?? '/tmp/showcase_frames';
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
await p.locator('.seg').nth(0).locator('button').nth(2).click(); // 3 bots (4 players: Biscuit, Orange guy, Ammar, Mint)
await p.locator('.seg').nth(2).locator('button').nth(0).click(); // 4 cards
await p.locator('button.act.primary').last().click();

// Wait 28s real time while stepping virtual clock so all 3D character + garden + waiter + badminton GLBs load
for (let k = 0; k < 28; k++) {
  await adv(150, 75);
  await p.waitForTimeout(950);
}

// Roll die and step until PEEK phase starts (bots begin peeking their own cards!)
for (let k = 0; k < 45; k++) {
  await adv(200, 50);
  const ph = await p.evaluate(() => window.__ml?.view?.phase ?? '');
  if (ph === 'START_ROLL') await btn(/Roll/);
  if (ph === 'PEEK') {
    await adv(900, 50);
    break;
  }
}

let frameIdx = 0;
const snapOne = async () => {
  const fn = `${out}/f${String(frameIdx++).padStart(4, '0')}.jpg`;
  await p.screenshot({ path: fn, type: 'jpeg', quality: 85, timeout: 120000 });
  await adv(50, 50);
};

// Act 1 (Frames 0..44, 2.25s): Player first-person hand peek + Opponents hand-reached peek-own + Waiter pouring tea (W2)
const sel = await p.evaluate(() => window.__ml3dHook?.selectable ?? []);
if (sel.length) {
  const xy0 = await p.evaluate((id) => window.__ml3dHook?.slot(id), sel[0]);
  if (xy0) await p.mouse.click(xy0.x, xy0.y);
}
for (let i = 0; i < 45; i++) {
  const wProg = 0.175 + (i / 45) * 0.035; // Waiter at pause stop pouring amber tea into cup
  await p.evaluate((pr) => {
    window.__mlWaiter?.trigger('refill', { outfit: 'tuxedo', progress: pr });
  }, wProg);
  if (i === 18 && sel.length > 1) {
    const xy1 = await p.evaluate((id) => window.__ml3dHook?.slot(id), sel[1]);
    if (xy1) await p.mouse.click(xy1.x, xy1.y);
  }
  if (i === 36) await btn(/Memori/);
  await snapOne();
}
await p.evaluate(() => window.__mlWaiter?.stop());

// Act 2 (Frames 45..109, 3.25s): Opponent hand-carried draw & swap/throw + Player first-person draw & throw
for (let i = 0; i < 65; i++) {
  if (i % 8 === 0) {
    const st = await p.evaluate(() => {
      const v = window.__ml?.view; const r = v?.round;
      return { ph: v?.phase, cur: r?.current, you: v?.you, drawn: r?.drawn?.by, active: r?.active?.k };
    });
    if (st.ph === 'PEEK') await btn(/Memori/);
    else if (st.ph === 'PLAY' && st.cur === st.you && !st.active) {
      if (st.drawn === st.you) await btn(/Throw/);
      else {
        const dxy = await p.evaluate(() => window.__ml3dHook?.deck());
        if (dxy) await p.mouse.click(dxy.x, dxy.y);
      }
    }
  }
  await snapOne();
}

// Act 3 (Frames 110..179, 3.5s): Waiter water splash (W4) + Loser sputter & table-slam + Winner cheer/boo + Medal (W5)
await p.evaluate(() => {
  window.__mlEmote?.trigger(2, 'win', { duration: 3400 });   // Ammar: victory pump + clap -> cheeky boo!
  window.__mlEmote?.trigger(3, 'slam', { duration: 3200 });  // Mint: sad slump + 3 table-rim slams + teacup bounce!
  window.__mlEmote?.trigger(0, 'wave', { duration: 2500 });  // Player: first-person hand wave!
});
for (let i = 0; i < 70; i++) {
  if (i < 42) {
    // W4 roundEnd: splash water on loser (seat 1 Orange guy -> triggers sputter!) then clap for winner
    const wProg = 0.25 + (i / 42) * 0.50;
    await p.evaluate((pr) => {
      window.__mlWaiter?.trigger('roundEnd', { outfit: 'full', winner: 2, loser: 1, progress: pr });
    }, wProg);
  } else {
    // W5 medal: carry red velvet cushion & crown winner with gold medal + gold confetti
    const mProg = 0.36 + ((i - 42) / 28) * 0.40;
    await p.evaluate((pr) => {
      window.__mlWaiter?.trigger('medal', { outfit: 'tuxedo', winner: 2, loser: 1, progress: pr });
    }, mProg);
  }
  await snapOne();
}

console.log('Recorded showcase frames:', frameIdx);
await b.close();
