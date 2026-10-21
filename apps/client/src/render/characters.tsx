// Original placeholder characters (§14.6): Biscuit (bear), Mint (cat), Pepper (owl) and Tango (a round orange
// critter). 2D busts with a few expressions. A separate layer, so rigged 3D characters can replace them later.
import { memo, useId } from 'react';

export type Mood = 'idle' | 'happy' | 'sad' | 'away' | 'think' | 'surprised';
export const CHARACTER_IDS = ['biscuit', 'mint', 'pepper', 'tango'] as const;
export const SEAT_COLORS = ['#e8892f', '#5da9e9', '#7bd389', '#e2b23c'];

function Eyes({ mood, x1, x2, y, r = 4, color = '#2b1d14' }: { mood: Mood; x1: number; x2: number; y: number; r?: number; color?: string }) {
  if (mood === 'away') return <g stroke={color} strokeWidth="2.4" fill="none" strokeLinecap="round"><path d={`M${x1 - 5} ${y} q5 4 10 0`} /><path d={`M${x2 - 5} ${y} q5 4 10 0`} /></g>;
  if (mood === 'happy') return <g stroke={color} strokeWidth="2.6" fill="none" strokeLinecap="round"><path d={`M${x1 - 5} ${y + 2} q5 -7 10 0`} /><path d={`M${x2 - 5} ${y + 2} q5 -7 10 0`} /></g>;
  const rr = mood === 'surprised' ? r + 1.6 : r;
  return (
    <g>
      <circle cx={x1} cy={y} r={rr} fill={color} /><circle cx={x2} cy={y} r={rr} fill={color} />
      <circle cx={x1 + 1.3} cy={y - 1.4} r={1.3} fill="#fff" /><circle cx={x2 + 1.3} cy={y - 1.4} r={1.3} fill="#fff" />
      {mood === 'sad' && <g stroke={color} strokeWidth="2" strokeLinecap="round"><path d={`M${x1 - 6} ${y - 8} l9 3`} /><path d={`M${x2 + 6} ${y - 8} l-9 3`} /></g>}
      {mood === 'think' && <path d={`M${x2 - 6} ${y - 9} l10 -2`} stroke={color} strokeWidth="2" strokeLinecap="round" />}
    </g>
  );
}
function Mouth({ mood, x, y, color = '#5a2f1c' }: { mood: Mood; x: number; y: number; color?: string }) {
  if (mood === 'happy') return <path d={`M${x - 9} ${y - 1} q9 11 18 0 z`} fill={color} />;
  if (mood === 'sad') return <path d={`M${x - 7} ${y + 4} q7 -7 14 0`} stroke={color} strokeWidth="2.4" fill="none" strokeLinecap="round" />;
  if (mood === 'surprised') return <ellipse cx={x} cy={y + 2} rx="4.5" ry="5.5" fill={color} />;
  if (mood === 'away') return <path d={`M${x - 4} ${y + 1} h8`} stroke={color} strokeWidth="2" strokeLinecap="round" />;
  return <path d={`M${x - 6} ${y} q6 5 12 0`} stroke={color} strokeWidth="2.4" fill="none" strokeLinecap="round" />;
}

function Biscuit({ mood }: { mood: Mood }) {
  return (
    <g>
      <path d="M14 140 Q14 96 60 92 Q106 96 106 140 Z" fill="#d9a43a" />
      <path d="M52 94 L60 140 L68 94 Z" fill="#f3e2b8" />
      {[104, 116, 128].map((y) => <circle key={y} cx="60" cy={y} r="2.4" fill="#8a5a1c" />)}
      <circle cx="30" cy="34" r="13" fill="#8a5a36" /><circle cx="90" cy="34" r="13" fill="#8a5a36" />
      <circle cx="30" cy="34" r="6.5" fill="#d9a57a" /><circle cx="90" cy="34" r="6.5" fill="#d9a57a" />
      <ellipse cx="60" cy="60" rx="38" ry="35" fill="#9a6a42" />
      <ellipse cx="60" cy="72" rx="18" ry="13" fill="#e8c49a" />
      <ellipse cx="60" cy="66" rx="6" ry="4.4" fill="#3b2116" />
      <Eyes mood={mood} x1={45} x2={75} y={54} />
      <Mouth mood={mood} x={60} y={76} />
      {mood === 'happy' && <g fill="#f39a8a" opacity=".6"><circle cx="36" cy="68" r="5" /><circle cx="84" cy="68" r="5" /></g>}
    </g>
  );
}
function Mint({ mood }: { mood: Mood }) {
  return (
    <g>
      <path d="M16 140 Q16 98 60 94 Q104 98 104 140 Z" fill="#8f979c" />
      <path d="M26 100 Q60 116 94 100 L96 112 Q60 128 24 112 Z" fill="#4f9a6a" />
      <path d="M78 110 l8 26 l10 -4 l-8 -24 z" fill="#3f8a5a" />
      <path d="M26 44 L32 10 L50 30 Z" fill="#a8b0b5" /><path d="M94 44 L88 10 L70 30 Z" fill="#a8b0b5" />
      <path d="M32 36 L34 18 L44 30 Z" fill="#e7b4b4" /><path d="M88 36 L86 18 L76 30 Z" fill="#e7b4b4" />
      <ellipse cx="60" cy="60" rx="38" ry="34" fill="#b3bbc0" />
      <ellipse cx="60" cy="74" rx="14" ry="10" fill="#e9eef0" />
      <path d="M57 69 h6 l-3 3.5 z" fill="#d98a8a" />
      <g stroke="#6d757a" strokeWidth="1.2"><path d="M30 72 h-16 M30 76 h-15 M90 72 h16 M90 76 h15" /></g>
      <Eyes mood={mood} x1={45} x2={75} y={56} color="#2e3a30" />
      <g fill="none" stroke="#5a3e2b" strokeWidth="2.6"><circle cx="45" cy="56" r="10" /><circle cx="75" cy="56" r="10" /><path d="M55 56 h10" /></g>
      <Mouth mood={mood} x={60} y={79} color="#6b3a3a" />
    </g>
  );
}
function Pepper({ mood }: { mood: Mood }) {
  return (
    <g>
      <path d="M20 140 Q18 100 60 96 Q102 100 100 140 Z" fill="#e07a2f" />
      <path d="M38 140 Q38 108 60 106 Q82 108 82 140 Z" fill="#f6c58f" />
      <path d="M14 120 Q22 98 36 104 L32 140 Z" fill="#c8641f" /><path d="M106 120 Q98 98 84 104 L88 140 Z" fill="#c8641f" />
      <ellipse cx="60" cy="62" rx="40" ry="36" fill="#ec8a36" />
      <path d="M22 40 Q40 6 98 40 Q96 24 60 18 Q24 24 22 40 Z" fill="#c93c32" />
      <path d="M20 42 Q60 26 100 42 L100 48 Q60 34 20 48 Z" fill="#a52d26" />
      <circle cx="60" cy="14" r="7" fill="#f6ebd9" />
      <circle cx="44" cy="62" r="14" fill="#fbe3c4" /><circle cx="76" cy="62" r="14" fill="#fbe3c4" />
      <Eyes mood={mood} x1={44} x2={76} y={62} r={5.5} />
      <path d="M54 74 L66 74 L60 86 Z" fill="#e2b23c" stroke="#a87a1c" strokeWidth="1" />
      {mood === 'happy' && <path d="M50 92 q10 6 20 0" stroke="#7a3f22" strokeWidth="2.4" fill="none" strokeLinecap="round" />}
      {mood === 'sad' && <path d="M52 94 q8 -5 16 0" stroke="#7a3f22" strokeWidth="2.4" fill="none" strokeLinecap="round" />}
    </g>
  );
}
function Tango({ mood }: { mood: Mood }) {
  return (
    <g>
      <path d="M18 140 Q18 100 60 98 Q102 100 102 140 Z" fill="#7a4a2a" />
      <path d="M30 104 Q60 120 90 104 L90 140 L30 140 Z" fill="#5b3420" />
      <circle cx="60" cy="64" r="40" fill="#f39a2e" />
      <g fill="#e8892f" opacity=".7">{[0, 1, 2, 3, 4, 5].map((i) => <circle key={i} cx={34 + i * 10} cy={44 + (i % 2) * 6} r="2" />)}</g>
      <path d="M60 24 q-2 -12 6 -18" stroke="#4f7a32" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M64 12 q14 -10 22 2 q-12 6 -22 -2 z" fill="#6aa13f" />
      <Eyes mood={mood} x1={46} x2={74} y={60} r={4.6} />
      <Mouth mood={mood} x={60} y={80} />
      <g fill="#f6b35e"><circle cx="38" cy="74" r="5" /><circle cx="82" cy="74" r="5" /></g>
    </g>
  );
}

export const CharacterBust = memo(function CharacterBust({ id, mood = 'idle', color, size = 90, className = '' }: { id: string; mood?: Mood; color?: string; size?: number; className?: string }) {
  const Comp = id === 'mint' ? Mint : id === 'pepper' ? Pepper : id === 'tango' ? Tango : Biscuit;
  return (
    <svg viewBox="0 0 120 140" width={size} height={size * 140 / 120} className={`char-bust mood-${mood} ${className}`} aria-hidden>
      {color && <ellipse cx="60" cy="136" rx="52" ry="8" fill={color} opacity=".55" />}
      <g className="char-body"><Comp mood={mood} /></g>
      {mood === 'away' && <text x="96" y="22" fontSize="18" fill="#f6ebd9" fontFamily="Fredoka, system-ui" className="zzz">z<tspan dy="-8" fontSize="13">z</tspan></text>}
    </svg>
  );
});

// ---------- flags (drawn to the official proportions) ----------
export function FlagFrance({ w = 36 }: { w?: number }) {
  const h = w * 2 / 3;
  return <svg width={w} height={h} viewBox="0 0 3 2" className="flag" aria-label="France"><rect width="1" height="2" fill="#0055A4" /><rect x="1" width="1" height="2" fill="#FFFFFF" /><rect x="2" width="1" height="2" fill="#EF4135" /></svg>;
}
export function FlagPalestine({ w = 36 }: { w?: number }) {
  const h = w / 2;
  // 1:2, three equal horizontal stripes (black, white, green), red triangle at the hoist reaching one third of the length.
  return <svg width={w} height={h} viewBox="0 0 6 3" className="flag" aria-label="Palestine"><rect width="6" height="1" fill="#000000" /><rect y="1" width="6" height="1" fill="#FFFFFF" /><rect y="2" width="6" height="1" fill="#007A3D" /><path d="M0 0 L2 1.5 L0 3 Z" fill="#CE1126" /></svg>;
}
export function FlagSweden({ w = 36 }: { w?: number }) {
  const h = w * 10 / 16;
  // 16:10, cross arms 2 wide; vertical arm starts at 5 (5:2:9), horizontal at 4 (4:2:4).
  return <svg width={w} height={h} viewBox="0 0 16 10" className="flag" aria-label="Sweden"><rect width="16" height="10" fill="#006AA7" /><rect x="5" width="2" height="10" fill="#FECC02" /><rect y="4" width="16" height="2" fill="#FECC02" /></svg>;
}
export function Bunting({ count = 9 }: { count?: number }) {
  const flags = [FlagFrance, FlagPalestine, FlagSweden];
  return (
    <div className="bunting" aria-hidden>
      <svg className="bunting-string" viewBox="0 0 100 10" preserveAspectRatio="none"><path d="M0 1 Q50 9 100 1" stroke="#c9a15b" strokeWidth=".6" fill="none" /></svg>
      {Array.from({ length: count }, (_, i) => { const F = flags[i % 3]!; const x = (i + 0.5) / count; const sag = 4 * x * (1 - x); return <span key={i} className="bunting-flag" style={{ left: `${x * 100}%`, top: `${sag * 26}px`, transform: `translateX(-50%) rotate(${(x - 0.5) * -14}deg)`, animationDelay: `${i * 0.3}s` }}><F w={30} /></span>; })}
    </div>
  );
}

// ---------- decor ----------
export function Pumpkin({ w = 40, hue = 0 }: { w?: number; hue?: number }) {
  return (
    <svg width={w} height={w * 0.8} viewBox="0 0 50 40" className="pumpkin" style={{ filter: hue ? `hue-rotate(${hue}deg)` : undefined }} aria-hidden>
      <ellipse cx="15" cy="24" rx="12" ry="14" fill="#d9772a" /><ellipse cx="35" cy="24" rx="12" ry="14" fill="#d9772a" />
      <ellipse cx="25" cy="24" rx="11" ry="15" fill="#f09a3e" /><ellipse cx="25" cy="24" rx="5" ry="14" fill="#e8892f" />
      <path d="M25 10 q-1 -6 4 -9" stroke="#5b7f3a" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M28 5 q8 -4 11 3 q-7 1 -11 -3z" fill="#6aa13f" />
    </svg>
  );
}
export function Shuttlecock({ w = 22, className = '' }: { w?: number; className?: string }) {
  return (
    <svg width={w} height={w * 1.3} viewBox="0 0 20 26" className={`shuttle ${className}`} aria-hidden>
      <path d="M3 2 L17 2 L13 18 L7 18 Z" fill="#fffaf0" stroke="#d8c7a6" strokeWidth=".8" />
      <path d="M6 2 L8.5 18 M10 2 V18 M14 2 L11.5 18" stroke="#d8c7a6" strokeWidth=".6" />
      <rect x="6" y="17" width="8" height="2" fill="#c9a15b" />
      <ellipse cx="10" cy="22" rx="4" ry="3.6" fill="#e8892f" />
    </svg>
  );
}
export function Racket({ w = 26, rot = 0 }: { w?: number; rot?: number }) {
  return (
    <svg width={w} height={w * 2.6} viewBox="0 0 20 52" style={{ transform: `rotate(${rot}deg)` }} className="racket" aria-hidden>
      <ellipse cx="10" cy="11" rx="8" ry="10" fill="none" stroke="#e8892f" strokeWidth="2" />
      <g stroke="#f6ebd9" strokeWidth=".4"><path d="M4 5 V17 M7 2.5 V20 M10 1.5 V21 M13 2.5 V20 M16 5 V17 M3 8 H17 M2.5 11 H17.5 M3 14 H17" /></g>
      <rect x="9" y="21" width="2" height="18" fill="#c9a15b" /><rect x="8" y="38" width="4" height="13" rx="2" fill="#5a2f1c" />
    </svg>
  );
}
export function ChocolateBowl({ w = 60 }: { w?: number }) {
  return (
    <svg width={w} height={w * 0.6} viewBox="0 0 60 36" className="choco-bowl" aria-hidden>
      <ellipse cx="30" cy="16" rx="26" ry="7" fill="#3b2116" />
      {[[16, 12, '#e2b23c'], [26, 9, '#c0392b'], [36, 12, '#e8892f'], [44, 14, '#7a4a2a'], [22, 15, '#5a2f1c'], [32, 15, '#c9a15b']].map(([x, y, c], i) => (
        <g key={i}><rect x={Number(x) - 4} y={Number(y) - 3} width="8" height="6" rx="1.5" fill={String(c)} /><path d={`M${Number(x) - 4} ${y} l-3 -2 v4 z M${Number(x) + 4} ${y} l3 -2 v4 z`} fill={String(c)} /></g>
      ))}
      <path d="M4 16 Q30 46 56 16 Z" fill="#c9a15b" /><path d="M8 18 Q30 40 52 18" stroke="#a87a1c" strokeWidth="1" fill="none" />
    </svg>
  );
}
export function TeaGlass({ w = 22 }: { w?: number }) {
  return (
    <span className="tea" style={{ width: w }}>
      <span className="steam" /><span className="steam s2" />
      <svg width={w} height={w * 1.35} viewBox="0 0 20 27" aria-hidden>
        <path d="M3 3 Q2 14 5 24 L15 24 Q18 14 17 3 Z" fill="#b5531f" opacity=".85" stroke="#f6ebd9" strokeWidth=".8" />
        <path d="M3 3 H17" stroke="#f6ebd9" strokeWidth="1" /><ellipse cx="10" cy="25.5" rx="7" ry="1.6" fill="#c9a15b" />
      </svg>
    </span>
  );
}

/** Footer / rules-page scene: two friends with pumpkin drinks, two playing badminton behind them, flags as bunting. */
export function FriendsScene({ compact = false }: { compact?: boolean }) {
  const pid = 'sp' + useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <div className={`friends-scene ${compact ? 'compact' : ''}`} aria-hidden>
      <Bunting count={9} />
      <div className="badminton">
        <svg viewBox="0 0 300 120" className="badminton-svg">
          {/* badminton net: two posts, mesh, white top tape */}
          <g>
            <line x1="122" y1="44" x2="122" y2="112" stroke="#8a5a32" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="178" y1="44" x2="178" y2="112" stroke="#8a5a32" strokeWidth="2.5" strokeLinecap="round" />
            <rect x="122" y="46" width="56" height="24" fill="#f6ebd9" fillOpacity=".06" />
            {Array.from({ length: 9 }, (_, i) => <line key={'v' + i} x1={128 + i * 6} y1="46" x2={128 + i * 6} y2="70" stroke="#f6ebd9" strokeOpacity=".28" strokeWidth=".7" />)}
            {Array.from({ length: 4 }, (_, i) => <line key={'h' + i} x1="122" y1={52 + i * 6} x2="178" y2={52 + i * 6} stroke="#f6ebd9" strokeOpacity=".28" strokeWidth=".7" />)}
            <rect x="121" y="44" width="58" height="3" rx="1" fill="#fffaf0" />
          </g>
          <g>
            <path id={pid} d="M70 60 Q150 -10 230 60 Q150 -10 70 60" fill="none" />
            <g>
              <g transform="translate(-6 -8) scale(.6)">
                <path d="M3 2 L17 2 L13 18 L7 18 Z" fill="#fffaf0" /><ellipse cx="10" cy="22" rx="4" ry="3.6" fill="#e8892f" />
              </g>
              <animateMotion dur="2.4s" repeatCount="indefinite" rotate="auto" keyPoints="0;0.5;1" keyTimes="0;0.5;1" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1">
                <mpath href={`#${pid}`} />
              </animateMotion>
            </g>
          </g>
        </svg>
        <div className="player left"><CharacterBust id="mint" mood="happy" size={compact ? 52 : 70} /><span className="swing swing-l"><Racket w={compact ? 14 : 18} rot={-30} /></span></div>
        <div className="player right"><CharacterBust id="pepper" mood="happy" size={compact ? 52 : 70} /><span className="swing swing-r"><Racket w={compact ? 14 : 18} rot={30} /></span></div>
      </div>
      <div className="sippers">
        <div className="sipper"><CharacterBust id="biscuit" mood="happy" size={compact ? 76 : 100} /><span className="pumpkin-cup"><Pumpkin w={compact ? 34 : 44} /><span className="straw" /></span></div>
        <div className="sipper"><CharacterBust id="tango" mood="idle" size={compact ? 76 : 100} /><span className="pumpkin-cup eat"><Pumpkin w={compact ? 34 : 44} /><span className="spoon" /></span></div>
      </div>
    </div>
  );
}
