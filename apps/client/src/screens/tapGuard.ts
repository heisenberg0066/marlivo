// Pure tap-guard rules (unit tested): not game timers, only protection against a finger that keeps tapping.
/** UI tap guards (not game timers): a button that just appeared ignores taps for a moment, so a finger still
 *  tapping "Match" or "Draw" cannot hit the "Stop" or "Throw" button that replaces it. */
export const BUTTON_ARM_MS = 350;
export const TAP_BOUNCE_MS = 280;
/** Taps on the action bar closer together than BUTTON_ARM_MS form one "streak" (a finger hammering).
 *  A button accepts a tap once it has been on screen for BUTTON_ARM_MS, and only from a streak that began after it
 *  appeared: a finger that was hammering "Draw" never falls through to the "Throw" that replaced it, but someone
 *  tapping a button that was already there gets it at once. */
export function armed(bornAt: number, streakStart: number, now: number) {
  return now - bornAt >= BUTTON_ARM_MS && streakStart >= bornAt;
}
export function nextStreak(streakStart: number, prevTap: number, now: number) {
  return now - prevTap >= BUTTON_ARM_MS ? now : streakStart;
}
