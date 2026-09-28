# terry.moodybeachmaine.com

Playful original 8-bit beach game: **Terry** the crab collects sea glass.

- **Promote only to:** `F:\website\terry.moodybeachmaine.com`
- **Do not** deploy to apex `F:\website\moodybeachmaine.com` (Canonicus rental brochure).

## Play

- Mouse / pointer follow, WASD, or touch
- Each sea glass = **1¢**; HUD shows cents
- Waves sweep almost full-screen; a hit bounces Terry down-beach and drops 1¢ glass back (if score > 0)
- Finale at **lifetime 10¢ collected** (survives HUD resets / wave drops): fart cloud → Terry flies off → seagull deposits her back → play on (loops every 10¢)

## Dev

```bash
npm install
npm run test:gate
npm run serve
```

Original pixel art only — original art only — no third-party characters.
