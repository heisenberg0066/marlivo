# Archived: Livo adult outfits (v0.9–v0.10)

Dropped in v0.11 (Ammar: the chibi beanie build from 417eb6d is Livo's only look again). Kept for history only; nothing in
the client loads these files.

- `livo_<outfit>.glb` / `-low.glb`, `portraits/livo_<outfit>.webp`: the last builds (v0.10 faces, commit ce50beb).
- `manifest_outfits.json`: the former `characters.livo.outfits` manifest block.
- The per-outfit EYE_SPEC / BODY_SPECS / FP_PALETTE / SVG colours and the picker labels live on the git branch
  `livo-adult-outfits` (= main at 27c2528). The outfit mechanism itself (OUTFITS, figure keys, picker, seat `outfit`)
  is still in the code; a character only gets the picker and `id@outfit` figure keys when it has 2+ outfits.
