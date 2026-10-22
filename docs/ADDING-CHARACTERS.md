# Adding real 3D characters to MarLivo

The 3D table (Settings → Table → 3D) shows a figure for every player: Biscuit (bear), Mint (cat), Pepper (owl),
**Orange guy** (internal id `tango`, Ammar's orange creature), **Ammar** (a stylised chibi of Ammar's own cartoon
avatar) and a plain "Guest" pawn. Orange guy and Ammar are full procedural models in
`apps/client/src/render3d/Hero.tsx` (with idle / think / celebrate / sad motion from `rig.ts`); the others are simpler
built-in figures. You can swap any of them for a real figure **without touching code**: you add a `.glb` file and
change one line of JSON. Preview any figure on its own at `#/lab?id=ammar&pose=stand&mood=happy`.

A brand-new character id also needs: an entry in `CHARACTERS` (`packages/engine/src/engine.ts`), in `CHARACTER_IDS`
plus a 2D bust in `apps/client/src/render/characters.tsx`, and `char.<id>` names in `i18n/en.json` and `fr.json`.
In Practice the player picks who sits at the table; lobby bots get the first character nobody uses yet.

## 1. Make or get the figure

- Format: **glTF binary (`.glb`)**. Blender: *File → Export → glTF 2.0*, format "glTF Binary".
- Low-poly, ideally **under 15 000 triangles** and **under 2 MB** (it has to run on phones).
  One texture of 1024×1024 or smaller is plenty.
- Pose: a seated figure, facing **+Z** (towards the camera in Blender's front view). If it faces another way,
  use `rotationY` below instead of re-exporting.
- Size and position do not matter: the game scales the figure to the right height and sits it on the chair.
- Only use figures you made or that are free to use (for example CC0). Do not model a real person from a photo.

## 2. Optional animations

Put animation clips in the same `.glb`. The game looks for these names (first match wins):

| Mood | Clip names tried |
|---|---|
| idle | `Idle`, `idle`, `Breathing` |
| think (his turn, matching) | `Think`, `think`, `Thinking` |
| happy (wins a round) | `Celebrate`, `celebrate`, `Happy`, `Cheer` |
| sad (penalty) | `Sad`, `sad`, `Defeated` |
| surprised | `Surprised`, `surprised` |
| away (disconnected) | `Sleep`, `sleep`, `Away` |

Other names work too if you list them under `clips` in the manifest. Missing clips fall back to `idle`, and with
no clips at all the figure gets a gentle built-in sway.

## 3. Drop it in

1. Copy the file to `apps/client/public/assets/characters/`, e.g. `tango.glb`.
2. Open `apps/client/public/assets/characters/manifest.json` and set `"model"` for that character:

```json
"tango": { "name": { "en": "Orange guy", "fr": "Le gars orange" }, "model": "tango.glb", "placeholder": "orange", "pickable": true,
           "height": 1.05, "baseY": -0.62, "rotationY": 0,
           "clips": { "happy": "Dance" } }
```

3. Commit and push. GitHub Actions redeploys the site; the figure appears for everyone who picked Orange guy.

Fields: `model` (file next to the manifest, or a full URL; `null` = placeholder), `height` (default 1.05),
`baseY` (feet height, default -0.62 = on the chair), `rotationY` (degrees), `clips` (mood → clip name).
If the file is missing or broken the placeholder is used and a warning is printed in the browser console, so a
bad file never breaks a game.

## 4. A brand-new character (e.g. Ammar's own)

Replacing one of the existing four needs no code. A **new** pickable id (say `ammar`) also needs its name in the
2D character list (`CHARACTER_IDS` in `apps/client/src/render/characters.tsx`, plus `char.ammar` in the two
language files) so it shows up in the lobby picker. Until then you can simply put Ammar's figure on one of the
existing ids.

## 5. Check it

`pnpm dev`, open Settings → Table → 3D, start a practice game and pick that character for a bot or
yourself. Frame rate is shown to tests as `window.__ml3d.fps`.
