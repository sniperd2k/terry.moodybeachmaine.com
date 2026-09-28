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

## Speed mode (tests only)

Sim speed defaults to **1x** (normal play). For automated logic/scoring checks you can run at **100x**:

- URL: `?speed=100` (e.g. `http://127.0.0.1:4177/?speed=100`)
- Harness: `window.__TERRY__.setSpeedMultiplier(100)` / `getSpeedMultiplier()`
- Quiet hotkey (only with `?dev=1`): press `0` to toggle 1x ↔ 100x

**100x is for logic/scoring verification only — not a substitute for real-time feel checks.** There is no on-screen speed button for players. Physics, waves, glass, seagull, and scoring all use the same `FIXED_DT` steps; the multiplier only maps wall-clock time to more steps per frame.
