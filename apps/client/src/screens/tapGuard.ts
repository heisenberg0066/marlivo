// Pure tap-guard rules (unit tested): not game timers, only protection against a finger that keeps tapping.
/** UI tap guards (not game timers): a button that just appeared ignores taps for a moment, so a finger still
 *  tapping "Match" or "Draw" cannot hit the "Stop" or "Throw" button that replaces it. */
export const BUTTON_ARM_MS = 350;
export const TAP_BOUNCE_MS = 280;
/** A tap is accepted when the button has been on screen for BUTTON_ARM_MS and, if the finger was already tapping
 *  the bar after it appeared, after a quiet gap of BUTTON_ARM_MS (so hammering never "falls through"). */
export function armed(bornAt: number, prevTapAt: number, now: number) {
  return now - bornAt >= BUTTON_ARM_MS && (prevTapAt < bornAt || now - prevTapAt >= BUTTON_ARM_MS);
}
