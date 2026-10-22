// Characters (§14.6): Biscuit (bear), Mint (cat), Pepper (owl), Orange guy (id 'tango', Ammar's orange creature)
// and Ammar (a chibi from his own cartoon avatar). 2D busts with a few expressions; the 3D models live in render3d.
import { memo, useId, useState } from 'react';

export type Mood = 'idle' | 'happy' | 'sad' | 'away' | 'think' | 'surprised';
export const CHARACTER_IDS = ['biscuit', 'mint', 'pepper', 'tango', 'ammar', 'choco', 'sugar'] as const;
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
/** Orange guy — Ammar's orange-peel creature: one big round orange body, bulging blue eyes, a bulbous nose,
 *  a wide flat open mouth, thin skin-coloured arms with three fingers and stubby legs. */
function Tango({ mood }: { mood: Mood }) {
  const id = useId().replace(/:/g, '');
  const wide = mood === 'happy' || mood === 'surprised';
  const closed = mood === 'away' || mood === 'happy';
  const look = mood === 'think' ? [3, -2.5] : mood === 'sad' ? [0, 2] : [-0.5, 0.5];
  const eye = (cx: number) => (
    <g>
      <ellipse cx={cx} cy="52" rx="10.5" ry="10.5" fill="#c56a2c" />
      <circle cx={cx} cy="52" r="9.2" fill="#f7f5f2" />
      {closed ? <path d={mood === 'happy' ? `M${cx - 8} 54 q8 -8 16 0` : `M${cx - 8} 52 h16`} stroke="#7a3b14" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        : <g><circle cx={cx + look[0]} cy={52 + look[1]} r={mood === 'surprised' ? 4.2 : 5.2} fill="#4f74bd" /><circle cx={cx + look[0]} cy={52 + look[1]} r={mood === 'surprised' ? 1.8 : 2.6} fill="#141414" /><circle cx={cx + look[0] - 1.8} cy={50 + look[1]} r="1.3" fill="#fff" /></g>}
      {mood === 'away' && <path d={`M${cx - 9.5} 50 q9.5 -9 19 0 v2 h-19 z`} fill="#e38c49" />}
      {mood === 'sad' && <path d={`M${cx - 10} 44 q10 -4 20 2`} stroke="#b7612a" strokeWidth="2.4" fill="none" strokeLinecap="round" />}
    </g>
  );
  return (
    <g>
      <defs>
        <radialGradient id={'og' + id} cx="42%" cy="36%" r="70%"><stop offset="0" stopColor="#f6b071" /><stop offset=".6" stopColor="#e8914b" /><stop offset="1" stopColor="#c4672b" /></radialGradient>
        <linearGradient id={'ol' + id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f2bd93" /><stop offset="1" stopColor="#e7a676" /></linearGradient>
      </defs>
      {/* arms reaching out and down, three long fingers each */}
      <g fill="none" stroke={`url(#ol${id})`} strokeLinecap="round">
        <path d="M24 84 Q10 82 6 96 Q4 104 3 112" strokeWidth="7" /><path d="M96 84 Q110 82 114 96 Q116 104 117 112" strokeWidth="7" />
        <path d="M3 112 l-3 8 M3 112 l1 9 M3 112 l5 7" strokeWidth="2.6" /><path d="M117 112 l3 8 M117 112 l-1 9 M117 112 l-5 7" strokeWidth="2.6" />
      </g>
      {/* stubby legs */}
      <path d="M38 112 Q34 128 36 140 L52 140 Q54 124 54 112 Z" fill={`url(#ol${id})`} /><path d="M82 112 Q86 128 84 140 L68 140 Q66 124 66 112 Z" fill={`url(#ol${id})`} />
      {/* the orange itself */}
      <path d="M60 10 C86 10 104 34 104 66 C104 98 86 120 60 120 C34 120 16 98 16 66 C16 34 34 10 60 10 Z" fill={`url(#og${id})`} />
      <g fill="#c8702f" opacity=".35">{[[38, 30], [52, 22], [70, 24], [84, 34], [30, 74], [90, 78], [44, 104], [76, 106], [60, 112], [26, 56], [94, 54]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.3" />)}</g>
      <ellipse cx="46" cy="30" rx="13" ry="7" fill="#fff" opacity=".16" transform="rotate(-20 46 30)" />
      {eye(46)}{eye(74)}
      {/* bulbous nose */}
      <path d="M57 60 Q55 70 52 74 Q50 80 56 81 Q60 83 64 81 Q70 80 68 74 Q65 70 63 60 Z" fill="#df8645" />
      <ellipse cx="57" cy="72" rx="3" ry="4" fill="#f2a464" opacity=".7" />
      <g fill="#8e461a" opacity=".7"><ellipse cx="56" cy="80" rx="1.6" ry="1" /><ellipse cx="64" cy="80" rx="1.6" ry="1" /></g>
      {/* wide flat mouth with a soft lip */}
      {mood === 'sad'
        ? <path d="M44 98 Q60 88 76 98" stroke="#7d3814" strokeWidth="3.2" fill="none" strokeLinecap="round" />
        : <g><ellipse cx="60" cy="92" rx={wide ? 20 : 18} ry={wide ? 7 : 3.8} fill="#d47c3d" /><ellipse cx="60" cy="92" rx={wide ? 17.5 : 15.5} ry={wide ? 5.4 : 2.2} fill="#5a1f0c" />
          {wide && <ellipse cx="60" cy="95" rx="7" ry="2" fill="#b4473a" />}</g>}
    </g>
  );
}

/** Ammar — a stylised chibi drawn from Ammar's own cartoon avatar (not a photo): dark curly hair with a short fade,
 *  round gold glasses, moustache and short beard, silver chain, black t-shirt with backpack straps. */
function Ammar({ mood }: { mood: Mood }) {
  const id = useId().replace(/:/g, '');
  const skin = '#ebb48f', skinD = '#d29874', hair = '#2a1a10', hairHi = '#4b301d';
  const look = mood === 'think' ? [2.4, -1.6] : mood === 'sad' ? [0, 1.5] : [0, 0];
  const eye = (cx: number) => mood === 'happy'
    ? <path d={`M${cx - 6} 66 q6 -7 12 0`} stroke="#2b1a10" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    : mood === 'away' ? <path d={`M${cx - 6} 65 q6 4 12 0`} stroke="#2b1a10" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    : <g><ellipse cx={cx} cy="65" rx="6.4" ry={mood === 'surprised' ? 7 : 6} fill="#fff" />
        <circle cx={cx + look[0]} cy={65 + look[1]} r="4.6" fill="#4a2a16" /><circle cx={cx + look[0]} cy={65 + look[1]} r="2.2" fill="#140a05" />
        <circle cx={cx + look[0] + 1.6} cy={63 + look[1]} r="1.4" fill="#fff" /><path d={`M${cx - 7} 61 q7 -4 14 0`} stroke="#2b1a10" strokeWidth="1.6" fill="none" /></g>;
  const curls: [number, number, number][] = [[30, 40, 8], [38, 30, 9], [48, 24, 9], [60, 21, 10], [72, 23, 9], [82, 29, 9], [90, 38, 8], [42, 38, 8], [55, 33, 8], [67, 33, 8], [79, 38, 7], [34, 48, 6], [86, 46, 6], [50, 16, 7], [64, 13, 7], [77, 17, 6], [44, 46, 5], [58, 43, 6], [71, 44, 5]];
  return (
    <g>
      <defs>
        <radialGradient id={'af' + id} cx="45%" cy="40%" r="65%"><stop offset="0" stopColor="#f4c4a2" /><stop offset="1" stopColor={skin} /></radialGradient>
      </defs>
      {/* black tee, backpack straps, neck, silver chain */}
      <path d="M12 140 Q14 112 34 106 L50 102 L70 102 L86 106 Q106 112 108 140 Z" fill="#1b1b1e" />
      <path d="M50 102 Q60 110 70 102" fill="#121214" stroke="#2a2a2e" strokeWidth="1.5" />
      <path d="M30 108 Q26 124 28 140" stroke="#2c2c31" strokeWidth="6" fill="none" /><path d="M90 108 Q94 124 92 140" stroke="#2c2c31" strokeWidth="6" fill="none" />
      <rect x="53" y="92" width="14" height="13" rx="5" fill={skinD} />
      <path d="M50 104 Q60 120 70 104" stroke="#dfe3e8" strokeWidth="1.6" fill="none" strokeDasharray="2.2 1.2" />
      {/* ears + head with a narrow chin */}
      <ellipse cx="29" cy="68" rx="5" ry="7.5" fill={skinD} /><ellipse cx="91" cy="68" rx="5" ry="7.5" fill={skinD} />
      <path d="M60 30 C80 30 92 44 92 64 C92 82 80 98 60 100 C40 98 28 82 28 64 C28 44 40 30 60 30 Z" fill={`url(#af${id})`} />
      {/* short fade on the sides */}
      <path d="M29 62 Q28 44 40 36 L42 48 Q33 52 32 64 Z" fill="#6a4a38" opacity=".75" /><path d="M91 62 Q92 44 80 36 L78 48 Q87 52 88 64 Z" fill="#6a4a38" opacity=".75" />
      {/* short beard along the jaw + chin */}
      <path d="M31 72 Q34 92 60 100 Q86 92 89 72 Q86 90 60 95 Q34 90 31 72 Z" fill="#7a5644" opacity=".55" />
      <path d="M56 94 Q60 99 64 94 L63 92 Q60 94 57 92 Z" fill="#3b261a" />
      {/* curly hair */}
      <g>{curls.map(([x, y, r], i) => <g key={i}><circle cx={x} cy={y} r={r} fill={hair} /><circle cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.45} fill={hairHi} opacity=".8" /></g>)}</g>
      {/* thick brows */}
      <path d={mood === 'sad' ? 'M38 55 Q44 51 52 54' : mood === 'think' ? 'M38 54 Q45 49 52 53' : 'M38 54 Q45 51 52 54'} stroke={hair} strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d={mood === 'sad' ? 'M68 54 Q76 51 82 55' : mood === 'think' ? 'M68 51 Q75 46 82 50' : 'M68 54 Q75 51 82 54'} stroke={hair} strokeWidth="4" fill="none" strokeLinecap="round" />
      {eye(45)}{eye(75)}
      {/* round gold glasses */}
      <g fill="#fff" fillOpacity=".12" stroke="#c9ad74" strokeWidth="1.8"><circle cx="45" cy="65" r="12" /><circle cx="75" cy="65" r="12" /></g>
      <path d="M57 63 Q60 60 63 63 M33 63 L29 62 M87 63 L91 62" stroke="#c9ad74" strokeWidth="1.8" fill="none" />
      {/* nose, moustache, mouth */}
      <path d="M58 72 Q57 79 60 81 Q63 79 62 72" fill={skinD} opacity=".8" />
      <path d="M50 86 Q55 82 60 84 Q65 82 70 86 Q65 85 60 86.5 Q55 85 50 86 Z" fill="#2e1c12" />
      <Mouth mood={mood} x={60} y={89.5} color="#7a3a2a" />
    </g>
  );
}

/** Portraits rendered from the 3D models (Blender, see tools/character-pipeline); the SVG busts stay as fallback art. */
const PORTRAITS: Record<string, string> = { tango: 'tango.webp', ammar: 'ammar.webp', biscuit: 'biscuit.webp', mint: 'mint.webp', pepper: 'pepper.webp', choco: 'choco.webp', sugar: 'sugar.webp' };
const portraitUrl = (id: string) => (import.meta.env?.BASE_URL ?? '/') + 'assets/characters/portraits/' + PORTRAITS[id];
function Portrait({ id, mood }: { id: string; mood: Mood }) {
  const [ok, setOk] = useState(true);
  const Svg = id === 'ammar' ? Ammar : id === 'tango' ? Tango : id === 'mint' ? Mint : id === 'pepper' ? Pepper : Biscuit;
  if (!ok) return <Svg mood={mood} />;
  return <image href={portraitUrl(id)} x="0" y="0" width="120" height="140" preserveAspectRatio="xMidYMax meet" onError={() => setOk(false)} />;
}

export const CharacterBust = memo(function CharacterBust({ id, mood = 'idle', color, size = 90, className = '' }: { id: string; mood?: Mood; color?: string; size?: number; className?: string }) {
  if (PORTRAITS[id]) return (
    <svg viewBox="0 0 120 140" width={size} height={size * 140 / 120} className={`char-bust mood-${mood} ${className}`} aria-hidden>
      {color && <ellipse cx="60" cy="136" rx="52" ry="8" fill={color} opacity=".55" />}
      <g className="char-body"><Portrait id={id} mood={mood} /></g>
      {mood === 'away' && <text x="96" y="22" fontSize="18" fill="#f6ebd9" fontFamily="Fredoka, system-ui" className="zzz">z<tspan dy="-8" fontSize="13">z</tspan></text>}
    </svg>
  );
  const Comp = id === 'mint' ? Mint : id === 'pepper' ? Pepper : id === 'tango' ? Tango : id === 'ammar' ? Ammar : Biscuit;
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

/** Footer / rules-page scene, from Ammar's approved sketch (v5): Ammar and Tango on a bench sipping from pumpkin
 *  cups, a box of chocolates on a little table, Biscuit and Mint playing badminton, Pepper on the shelf, and the
 *  France / Palestine / Sweden bunting. Shown whole (never cropped) and scaled to fit the space it is given. */
export function FriendsScene({ compact = false }: { compact?: boolean }) {
  const base = import.meta.env.BASE_URL;
  return (
    <div className={`friends-scene ${compact ? 'compact' : ''}`}>
      <img
        src={`${base}scene/friends-1280.webp`}
        srcSet={`${base}scene/friends-760.webp 760w, ${base}scene/friends-1280.webp 1280w`}
        sizes="(max-width: 800px) 100vw, 1100px"
        width={1280} height={719} decoding="async" draggable={false}
        alt="Ammar and Tango sipping from pumpkin cups next to a box of chocolates, while Biscuit and Mint play badminton under French, Palestinian and Swedish flags"
      />
    </div>
  );
}
