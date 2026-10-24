import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

mkdirSync('/workspace/sb', { recursive: true });

// Build a 3x3 contact sheet from the 9 keyframes at /workspace/sb/keyframes/*.png
execSync(
  `ffmpeg -y -pattern_type glob -i '/workspace/sb/keyframes/*.png' -vf "scale=640:360,tile=3x3:padding=8:margin=8:color=0x1a0e08" -frames:v 1 /workspace/sb/marlivo-keyframes-contact-sheet.png`,
  { stdio: 'inherit' }
);

// Also extract high-res close-up crops of the Waiter & Background Badminton Court from keyframes 03, 04, and 05
execSync(
  `ffmpeg -y -i /workspace/sb/keyframes/03-waiter-walking-arc-and-badminton-jump-smash.png -vf "crop=720:420:280:30,scale=1280:746" /workspace/sb/closeup-waiter-and-badminton-jumpsmash.png`,
  { stdio: 'inherit' }
);
execSync(
  `ffmpeg -y -i /workspace/sb/keyframes/04-waiter-pouring-cup3-and-badminton-net-lunge.png -vf "crop=760:440:260:30,scale=1280:741" /workspace/sb/closeup-waiter-pouring-and-badminton-lunge.png`,
  { stdio: 'inherit' }
);

// Also generate 2x2 and 5-panel comparison grids: keyframes-comparison-1-to-4.png and keyframes-comparison-5-to-9.png
execSync(
  `ffmpeg -y -i /workspace/sb/keyframes/01-no-log-waiter-stepping-walk-full-outfit.png -i /workspace/sb/keyframes/02-waiter-pouring-cup2-and-opponent-peek-reach.png -i /workspace/sb/keyframes/03-waiter-walking-arc-and-badminton-jump-smash.png -i /workspace/sb/keyframes/04-waiter-pouring-cup3-and-badminton-net-lunge.png -filter_complex "[0:v][1:v][2:v][3:v]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0[v]" -map "[v]" -frames:v 1 -update 1 /workspace/sb/keyframes-comparison-1-to-4.png`,
  { stdio: 'inherit' }
);
execSync(
  `ffmpeg -y -i /workspace/sb/keyframes/05-waiter-new-outfit-chef-toque-and-table-draw.png -i /workspace/sb/keyframes/06-opponent-holding-card-scanning-slots.png -i /workspace/sb/keyframes/07-waiter-new-outfit-fez-suit-and-two-hand-swap.png -i /workspace/sb/keyframes/08-waiter-splash-bandana-and-seated-leg-kicks.png -i /workspace/sb/keyframes/09-pepper-choco-sugar-3bone-legs-and-tuxedo-tophat-medal.png -filter_complex "[0:v][1:v][2:v][3:v][4:v]xstack=inputs=5:layout=0_0|w0_0|0_h0|w0_h0|0_h0+h2[v]" -map "[v]" -frames:v 1 -update 1 /workspace/sb/keyframes-comparison-5-to-9.png`,
  { stdio: 'inherit' }
);
