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

await p.goto(base + '#/practice');
await adv(300, 33.333);
await p.locator('.seg').nth(0).locator('button').nth(2).click(); // 3 bots (4 players)
await p.locator('.seg').nth(2).locator('button').nth(0).click(); // 4 cards
await p.locator('.seg').nth(4).locator('button').nth(2).click(); // Fast bot speed so bots play briskly!
await p.locator('button.act.primary').last().click();

for (let k = 0; k < 20; k++) {
  await adv(120, 40);
  await p.waitForTimeout(350);
}

for (let k = 0; k < 60; k++) {
  await adv(200, 33.333);
  const ph = await p.evaluate(() => window.__ml?.view?.phase ?? '');
  if (ph === 'START_ROLL') {
    await p.evaluate(() => window.__ml?.intent({ t: 'ROLL_DIE' }));
  }
  if (ph === 'PEEK' || ph === 'PLAY') {
    await adv(300, 33.333);
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
// - Orange Waiter in 'full' outfit (Bellhop Pillbox Cap + Black Vest + White Shirt + Bow Tie + Apron)
//   walking continuously with 3-bone stepping legs along the outer stone patio (0.04 -> 0.98) and
//   pouring tea into each player's cup one by one!
// - Complete PEEK via engine intents so the game transitions into live PLAY with bots drawing & swapping!
// ====================================================================================================
const mySlots = await p.evaluate(() => {
  const v = window.__ml?.view;
  const me = v?.you ?? 0;
  return (v?.round?.areas?.[me] ?? []).map((s) => s.id);
});

for (let i = 0; i < 170; i++) {
  const wProg = 0.04 + (i / 169) * 0.94;
  await p.evaluate((pr) => {
    window.__mlWaiter?.trigger('refill', { outfit: 'full', progress: pr });
  }, wProg);

  if (i === 2 && mySlots[0]) {
    await p.evaluate((id) => window.__ml?.intent({ t: 'PEEK_PICK', slot: id }), mySlots[0]);
  }
  if (i === 18 && mySlots[1]) {
    await p.evaluate((id) => window.__ml?.intent({ t: 'PEEK_PICK', slot: id }), mySlots[1]);
  }
  if (i === 36) {
    await p.evaluate(() => window.__ml?.intent({ t: 'PEEK_DONE' }));
  }

  const key =
    i === 30 ? '01-no-log-waiter-stepping-walk-full-outfit' :
    i === 56 ? '02-waiter-pouring-cup2-and-opponent-peek-reach' :
    i === 92 ? '03-waiter-walking-arc-and-badminton-jump-smash' :
    i === 106 ? '04-waiter-pouring-cup3-and-badminton-net-lunge' : null;
  await snapOne(key);
}

// ====================================================================================================
// Act 2 (Frames 170..339, 5.67s):
// - Waiter returns from doorway wearing 'chef' outfit (White Chef Toque + Double-Breasted Chef Coat)
//   and walks a continuous outer-patio tour (0.02 -> 0.98) with zero teleportation!
// - Active PLAY phase: bots on Seat 1 (Orange guy), Seat 2 (Ammar), and Seat 3 (Mint) plus Seat 0
//   draw cards from the center deck, hold cards in their 3D hands, scan their card slots with their
//   free hand, and perform two-handed card swaps and throws!
// ====================================================================================================
for (let i = 0; i < 170; i++) {
  const wProg = 0.02 + (i / 169) * 0.96;
  await p.evaluate((pr) => {
    window.__mlWaiter?.trigger('refill', { outfit: 'chef', progress: pr });
  }, wProg);

  if (i % 6 === 0) {
    await p.evaluate((step) => {
      const s = window.__ml;
      const v = s?.view;
      const r = v?.round;
      if (!s || !v || !r) return;
      if (v.phase === 'PEEK') {
        s.intent({ t: 'PEEK_DONE' });
        return;
      }
      if (v.phase !== 'PLAY') return;
      const me = v.you ?? 0;
      
      const a = r.active;
      if (a?.k === 'power' && a.owner === me) {
        if (a.power === 'J') s.intent({ t: 'JACK_SKIP' });
        else if (a.power === 'Q') s.intent({ t: 'QUEEN_SKIP', confirm: true });
        else if (a.power === '10') s.intent({ t: 'TEN_GIVE', to: (me + 1) % 4 });
        return;
      }
      if (r.current === me && !a) {
        if (!r.drawn) {
          s.intent({ t: 'DRAW' });
        } else if (r.drawn.by === me) {
          const myArea = (r.areas[me] ?? []).filter((x) => !x.empty);
          if (step % 18 === 6 && myArea.length > 0) {
            s.send({ type: 'HOVER', slot: myArea[0].id });
          } else if (step % 18 === 12 && myArea.length > 1) {
            s.send({ type: 'HOVER', slot: myArea[1].id });
          } else if (myArea.length > 0) {
            s.intent({ t: 'SWAP', slot: myArea[0].id });
          } else {
            s.intent({ t: 'THROW' });
          }
        }
      }
    }, i);
  }

  const key =
    i === 30 ? '05-waiter-new-outfit-chef-toque-and-table-draw' :
    i === 68 ? '06-opponent-holding-card-scanning-slots' :
    i === 120 ? '07-waiter-new-outfit-fez-suit-and-two-hand-swap' : null;
  await snapOne(key);
}

// ====================================================================================================
// Act 3 (Frames 340..509, 5.67s):
// - Trigger whole-body emotes (win, cheer, slam) showing 3-bone seated leg kicking/stamping and 4-bone
//   arm + white cartoon glove motion across Seat 1 (Orange guy), Seat 2 (Ammar), and Seat 3 (Mint),
//   while the Waiter enters from the doorway in 'tuxedo' (Silk Top Hat + Tuxedo) and walks continuously
//   along the outer stone patio (0.04 -> 0.88) to hang the Gold Medal around Seat 2 (Ammar)'s neck!
// ====================================================================================================
await p.evaluate(() => {
  window.__mlEmote?.trigger(1, 'win', { duration: 5800 });
  window.__mlEmote?.trigger(2, 'cheer', { duration: 5800 });
  window.__mlEmote?.trigger(3, 'slam', { duration: 5800 });
});

for (let i = 0; i < 170; i++) {
  const mProg = 0.04 + (i / 169) * 0.84;
  await p.evaluate((pr) => {
    window.__mlWaiter?.trigger('medal', { outfit: 'tuxedo', winner: 2, loser: 1, progress: pr });
  }, mProg);

  const key =
    i === 32 ? '08-waiter-splash-bandana-and-seated-leg-kicks' :
    i === 110 ? '09-pepper-choco-sugar-3bone-legs-and-tuxedo-tophat-medal' : null;
  await snapOne(key);
}

console.log('Recorded total showcase frames:', frameIdx);
await b.close();
