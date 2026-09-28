# terry.moodybeachmaine.com

Playful original 8-bit beach game: **Terry** the crab collects sea glass.

- **Promote only to:** `F:\website\terry.moodybeachmaine.com`
- **Do not** deploy to apex `F:\website\moodybeachmaine.com` (Canonicus rental brochure).

## Play

- Mouse / pointer follow, WASD / arrows, or touch
- Each sea glass = **1¢**; HUD shows held cents (`currentCents`)
- Waves knock Terry to the **bottom** (boing SFX) and drop 1¢ glass back (held score −1) if she has any
- Sea glass spawns at **varying beach heights**; advancing waves push ~20% of glass further down
- Finale when **held total reaches 10¢**: fart cloud → Terry flies off → seagull (caw) drops her at bottom → held resets to 0 → loop

## Dev

```bash
npm install
npm run test:gate
npm run serve
```

Original pixel art only — original art only — no third-party characters.
