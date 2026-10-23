// Shared 3D table / seat dimensions. ONE place for the numbers the scenes, the card layout and the character
// animation (arm reach, lean to the centre pile) all depend on. See docs/SCENES.md before changing anything.
// Units: table units (a held card is 0.142 wide); the table top is y = 0, the local player sits at +z.

/** Radius of the playing surface (cloth / top). Every card stays inside TABLE_R - 0.04 (unit-tested). */
export const TABLE_R = 0.98;
/** Distance from the table centre to a seated character's root (the chair sits a little further back). */
export const SEAT_DIST = TABLE_R + 0.22;
/** Scale applied to a seated character + chair group. */
export const CHAR_SCALE = 0.85;
/** Chair offset behind the character root, in the character's local frame (before CHAR_SCALE). */
export const CHAIR_BACK = -0.12;
/** Ground (terrace / floor) height. */
export const FLOOR_Y = -0.75;
/** Centre piles: everything within this radius of the centre is kept clear of props (deck + discard + throws). */
export const CENTRE_CLEAR_R = 0.34;
/** Extra keep-clear margin around each seat's biggest card area (props never come closer). */
export const AREA_MARGIN = 0.035;

/** Table outline per scene (round = radius TABLE_R + rim; rect = half sizes). Cards always fit in TABLE_R. */
export const TABLE_SHAPES = {
  golden: { kind: 'round', rim: 0.07, cloth: 'linen' },
  picnic: { kind: 'rect', hx: 1.02, hz: 0.98, cloth: 'gingham' },
  dusk: { kind: 'rect', hx: 0.98, hz: 0.98, cloth: 'runner' },
  classic: { kind: 'round', rim: 0.12, cloth: 'felt' },
} as const;

/** Tea service sizes (props are small so they never compete with the cards). */
export const TEA = { saucerR: 0.066, cupR: 0.042, cupH: 0.05 } as const;
export const CHOCO = { w: 0.13, d: 0.06 } as const;

/** Seat-view camera for the outdoor scenes: elevation (radians above the table plane) on laptop / phone portrait,
 *  and how much of a side seat's figure the phone keeps in frame (fraction of the seat distance; all scenes). */
export const CAMERA = { laptopEl: 0.5, portraitEl: 0.86, sideKeep: 1.0, portraitSideBack: 0.42 } as const;
// portraitSideBack (radians, QA 2026-10-23): on a phone held upright the left/right players sit this much further
// round the table towards the far side, so their faces stay on the narrow screen (their cards do not move).
