// Records a 17-second (510 frames @ 30 fps, 1280x720) H.264 verification showcase in the Golden-Hour Garden Terrace
// using the deterministic virtual clock (marlivo.animstep=1), plus extracts high-res keyframe images.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.env.BASE ?? 'http://127.0.0.1:4192/marlivo/';
const out = process.env.OUT ?? '/tmp/showcase_frames_1080';
const keyDir = '/workspace/sb/keyframes';
mkdirSync(out, { recursive: true });
mkdirSync(keyDir, { recursive: true });

const GL = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: GL });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => {
  localStorage.setItem('marlivo.animstep', '1');
  localStorage.setItem('marlivo.prefs', JSON.stringify({
    name: 'Biscuit', characterId: 'biscuit', speed: 'normal', sound: false,
    renderer: '3d', scene: 'golden', graphics: 'high', camera: 'seat', confirmSwap: false
  }));
  localStorage.setItem('marlivo.lang', 'en');
});

const p = await ctx.newPage();
const adv = (ms, fr = 33.333) => p.evaluate(([a, f]) => window.__mlAdvance(a, f), [ms, fr]);
const btn = async (re) => {
  const l = p.locator('.actions button.act', { hasText: re });
  if (await l.count()) { await l.first().click({ force: true, timeout: 1500, noWaitAfter: true }).catch(() => {}); return true; }
  return false;
};

await p.goto(base + '#/practice');
await adv(300, 33.333);
await p.locator('.seg').nth(0).locator('button').nth(2).click(); // 3 bots (4 players)
await p.locator('.seg').nth(2).locator('button').nth(0).click(); // 4 cards
await p.locator('button.act.primary').last().click();

for (let k = 0; k < 22; k++) {
  await adv(120, 40);
  await p.waitForTimeout(750);
}

for (let k = 0; k < 45; k++) {
  await adv(200, 33.333);
  const ph = await p.evaluate(() => window.__ml?.view?.phase ?? '');
  if (ph === 'START_ROLL') await btn(/Roll/);
  if (ph === 'PEEK') {
    await adv(600, 33.333);
    break;
  }
}

let frameIdx = 0;
const snapOne = async (keyName = null) => {
  await adv(33.333, 33.333);
  const fn = `${out}/f${String(frameIdx++).padStart(4, '0')}.jpg`;
  await p.screenshot({ path: fn, type: 'jpeg', quality: 88, timeout: 120000 });
  if (keyName) {
    await p.screenshot({ path: `${keyDir}/${keyName}.png`, type: 'png', timeout: 120000 });
    console.log('Saved keyframe:', keyName);
  }
};

// ====================================================================================================
// Act 1 (Frames 0..169, 5.67s):
// - Real game HUD (NO 📜 Log button!)
// - Orange Waiter in 'full' outfit (Waiter Pillbox Cap + Black Vest + White Apron) walking with 3-bone
//   stepping legs around the table and pouring tea into each player's cup one by one!
// - Table characters (Orange guy, Ammar, Mint) + local player FP hand performing whole-body forward
//   reaches with shoulder coil and bracing off-hand during PEEK & early PLAY!
// ====================================================================================================
const sel = await p.evaluate(() => window.__ml3dHook?.selectable ?? []);
if (sel.length) {
  const xy0 = await p.evaluate((id) => window.__ml3dHook?.slot(id), sel[0]);
  if (xy0) await p.mouse.click(xy0.x, xy0.y);
}
for (let i = 0; i < 170; i++) {
  const wProg = 0.06 + (i / 170) * 0.88;
  await p.evaluate((pr) => {
    window.__mlWaiter?.trigger('refill', { outfit: 'full', progress: pr });
  }, wProg);

  if (i === 25 && sel.length > 1) {
    const xy1 = await p.evaluate((id) => window.__ml3dHook?.slot(id), sel[1]);
    if (xy1) await p.mouse.click(xy1.x, xy1.y);
  }
  if (i === 52) await btn(/Memori/);

  // Keyframe indices mapped to exact waiter positions:
  // i=36 (wProg ~ 0.25): Waiter mid-walk with 3-bone leg stride between Seat 1 and Seat 2
  // i=58 (wProg ~ 0.36): Waiter pouring hot amber tea into Seat 2 (Ammar)'s cup + opponent peek reach
  // i=83 (wProg ~ 0.49): Waiter walking along top perimeter arc + badminton jump-smash
  // i=106 (wProg ~ 0.61): Waiter pouring hot amber tea into Seat 3 (Mint)'s cup + badminton net lunge
  const key =
    i === 36 ? '01-no-log-waiter-stepping-walk-full-outfit' :
    i === 58 ? '02-waiter-pouring-cup2-and-opponent-peek-reach' :
    i === 83 ? '03-waiter-walking-arc-and-badminton-jump-smash' :
    i === 106 ? '04-waiter-pouring-cup3-and-badminton-net-lunge' : null;
  await snapOne(key);
}

// ====================================================================================================
// Act 2 (Frames 170..339, 5.67s):
// - Waiter returns from break wearing a DIFFERENT outfit ('chef' Tall White Chef Toque + Chef Coat,
//   then 'suit' Burgundy Fez Hat + Navy Suit)!
// - Table gameplay: opponent draw with two-handed card inspection, active slot-scanning while holding
//   a drawn card, two-handed card swap, and local player persistent 3D first-person hand holding drawn card!
// ====================================================================================================
for (let i = 0; i < 170; i++) {
  const outfit = i < 85 ? 'chef' : 'suit';
  const localI = i < 85 ? i / 85 : (i - 85) / 85;
  const wProg = 0.22 + localI * 0.48;
  await p.evaluate(([outf, pr]) => {
    window.__mlWaiter?.trigger('refill', { outfit: outf, progress: pr });
  }, [outfit, wProg]);

  if (i % 10 === 0) {
    const st = await p.evaluate(() => {
      const v = window.__ml?.view; const r = v?.round;
      return { ph: v?.phase, cur: r?.current, you: v?.you, drawn: r?.drawn?.by, active: r?.active?.k };
    });
    if (st.ph === 'PEEK') await btn(/Memori/);
    else if (st.ph === 'PLAY' && st.cur === st.you && !st.active) {
      if (st.drawn === st.you) {
        if (i > 40) await btn(/Throw/);
      } else {
        const dxy = await p.evaluate(() => window.__ml3dHook?.deck());
        if (dxy) await p.mouse.click(dxy.x, dxy.y);
      }
    }
  }

  // i=26 (wProg ~ 0.37, 'chef'): Waiter in White Chef Toque pouring at Seat 2 + table card draw
  // i=65 (wProg ~ 0.59, 'chef'): Waiter in White Chef Toque pouring at Seat 3 + opponent holding card & scanning slots
  // i=112 (wProg ~ 0.38, 'suit'): Waiter in Burgundy Fez Hat + Navy Suit pouring at Seat 2 + table action
  const key =
    i === 26 ? '05-waiter-new-outfit-chef-toque-and-table-draw' :
    i === 65 ? '06-opponent-holding-card-scanning-slots' :
    i === 112 ? '07-waiter-new-outfit-fez-suit-and-two-hand-swap' : null;
  await snapOne(key);
}

// ====================================================================================================
// Act 3 (Frames 340..509, 5.67s):
// - Showcase remaining characters (Pepper, Choco, Sugar alongside Biscuit, Orange, Ammar, Mint = all 7!)
//   with 3-bone seated leg kicking/stamping and 4-bone arm emotes!
// - Waiter water splash on loser ('tie' Crimson Vest + Bandana) & Gold Medal ceremony ('tuxedo' Top Hat)!
// ====================================================================================================
await p.evaluate(() => {
  window.__mlEmote?.trigger(2, 'win', { duration: 3600 });
  window.__mlEmote?.trigger(3, 'slam', { duration: 3400 });
  window.__mlEmote?.trigger(1, 'cheer', { duration: 3400 });
});

for (let i = 0; i < 170; i++) {
  if (i === 75) {
    await p.evaluate(() => {
      const s = window.__ml;
      if (s?.view?.seats) {
        if (s.view.seats[1]) s.view.seats[1].characterId = 'pepper';
        if (s.view.seats[2]) s.view.seats[2].characterId = 'choco';
        if (s.view.seats[3]) s.view.seats[3].characterId = 'sugar';
        s.version = (s.version || 0) + 1;
        if (s.listeners) s.listeners.forEach((fn) => fn());
      }
    });
    await p.waitForTimeout(1800);
    await p.evaluate(() => {
      window.__mlEmote?.trigger(1, 'win', { duration: 3500 });
      window.__mlEmote?.trigger(2, 'cheer', { duration: 3500 });
      window.__mlEmote?.trigger(3, 'slam', { duration: 3500 });
    });
  }

  if (i < 75) {
    const wProg = 0.22 + (i / 75) * 0.56;
    await p.evaluate((pr) => {
      window.__mlWaiter?.trigger('roundEnd', { outfit: 'tie', winner: 2, loser: 1, progress: pr });
    }, wProg);
  } else {
    const mProg = 0.28 + ((i - 75) / 95) * 0.54;
    await p.evaluate((pr) => {
      window.__mlWaiter?.trigger('medal', { outfit: 'tuxedo', winner: 2, loser: 1, progress: pr });
    }, mProg);
  }

  const key =
    i === 28 ? '08-waiter-splash-bandana-and-seated-leg-kicks' :
    i === 115 ? '09-pepper-choco-sugar-3bone-legs-and-tuxedo-tophat-medal' : null;
  await snapOne(key);
}

console.log('Recorded total showcase frames:', frameIdx);
await b.close();
