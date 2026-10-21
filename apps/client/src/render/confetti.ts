// Chocolate-wrapper confetti for a round win (Liv's touch): little foil wrappers in pumpkin/gold/chocolate tones.
import { getPrefs } from '../prefs';
const COLORS = ['#e8892f', '#f3b14a', '#7a4524', '#c9a227', '#b5651d', '#f6d27a', '#5b2e17'];
export function confetti(n = 90) {
  if (getPrefs().reduced) n = Math.min(n, 20);
  const host = document.createElement('div');
  host.className = 'confetti-host';
  document.body.appendChild(host);
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div');
    const twist = Math.random() < 0.5;
    d.className = 'wrapper' + (twist ? ' twist' : '');
    d.style.background = `linear-gradient(135deg, ${COLORS[i % COLORS.length]}, #fff7 50%, ${COLORS[(i + 3) % COLORS.length]})`;
    host.appendChild(d);
    const x0 = innerWidth / 2 + (Math.random() - 0.5) * 120, y0 = innerHeight * 0.55;
    const x1 = x0 + (Math.random() - 0.5) * innerWidth * 1.1, y1 = innerHeight + 40;
    const peak = y0 - 200 - Math.random() * innerHeight * 0.4;
    d.animate([
      { transform: `translate(${x0}px, ${y0}px) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${(x0 + x1) / 2}px, ${peak}px) rotate(${Math.random() * 720}deg) rotateY(${Math.random() * 720}deg)`, opacity: 1, offset: 0.35 },
      { transform: `translate(${x1}px, ${y1}px) rotate(${Math.random() * 1440}deg) rotateY(${Math.random() * 1440}deg)`, opacity: 0.9 },
    ], { duration: 2200 + Math.random() * 1400, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' });
  }
  setTimeout(() => host.remove(), 4000);
}
