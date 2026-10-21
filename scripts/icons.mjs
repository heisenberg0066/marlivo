// Renders the PWA PNG icons from public/icon.svg with headless Chrome.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const svg = readFileSync(new URL('../apps/client/public/icon.svg', import.meta.url), 'utf8');
const b = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage();
for (const [size, name, pad] of [[180, 'icon-180.png', 0], [192, 'icon-192.png', 0], [512, 'icon-512.png', 0], [512, 'icon-512-maskable.png', 60]]) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<html><body style="margin:0;background:#22110a"><div style="width:${size}px;height:${size}px;display:grid;place-items:center">${svg.replace('<svg', `<svg width="${size - pad * 2}" height="${size - pad * 2}"`)}</div></body></html>`);
  await p.screenshot({ path: new URL('../apps/client/public/' + name, import.meta.url).pathname });
}
await b.close();
console.log('icons ok');
