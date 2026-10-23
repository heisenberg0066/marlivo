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
