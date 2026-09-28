/**
 * Pure game logic for Terry's Beach (testable, no DOM).
 * Original 8-bit beach crab — original art only — no third-party characters.
 */

export const GLASS_CENTS = 1;
export const FINALE_CENTS = 10;
export const TERRY_RADIUS = 14;
export const GLASS_RADIUS = 8;
export const TERRY_SPEED = 160; // px/sec WASD + arrows
export const FOLLOW_SPEED = 220; // px/sec pointer follow
export const FIXED_DT = 1 / 60;

/** Sim speed multiplier (1 = normal). Used by the RAF loop so wall-clock maps to more FIXED_DT steps.
 *  100x is for automated logic/scoring verification only — not a substitute for real-time feel checks.
 */
let speedMultiplier = 1;

export function getSpeedMultiplier() {
  return speedMultiplier;
}

/**
 * Set sim speed (default 1). Clamped to (0, 1000]. Invalid → 1.
 * Prefer URL ?speed=100 or __TERRY__.setSpeedMultiplier for tests — no player-facing UI.
 */
export function setSpeedMultiplier(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) {
    speedMultiplier = 1;
    return speedMultiplier;
  }
  speedMultiplier = Math.min(1000, v);
  return speedMultiplier;
}

/** Parse ?speed= from a search string. Returns null if absent/invalid. */
export function parseSpeedFromSearch(search = '') {
  const q = String(search || '');
  const raw = q.startsWith('?') ? q.slice(1) : q;
  const params = new URLSearchParams(raw);
  if (!params.has('speed')) return null;
  const n = Number(params.get('speed'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** True when ?dev=1 (enables quiet speed hotkey). */
export function parseDevFromSearch(search = '') {
  const q = String(search || '');
  const raw = q.startsWith('?') ? q.slice(1) : q;
  return new URLSearchParams(raw).get('dev') === '1';
}

export const WAVE_PERIOD = 8; // seconds full in+out cycle
export const WET_BAND_FRAC = 0.18;
/** Peak wave reaches this fraction of canvas height (almost full screen). */
export const WAVE_MAX_DEPTH = 0.88;
/** Low-tide water edge fraction. */
export const WAVE_MIN_DEPTH = 0.08;
/** Downward bounce distance when a wave hits Terry (px) — strong knock toward bottom. */
export const WAVE_BOUNCE = 110;
/** Downward impulse velocity on wave hit (px/sec). */
export const WAVE_BOUNCE_VY = 420;
/** Seconds freshly dropped glass cannot be re-collected (touch follow fix). */
export const DROP_IMMUNE_SEC = 0.45;
/** Px above canvas bottom for playable crab rest (wave bounce + seagull drop-off). */
export const BOTTOM_PLAYABLE_MARGIN = 8;
/** Seagull multi-caw burst size (2–3 spaced plays) — arrival AND after drop. */
export const SEAGULL_CAW_COUNT = 3;
/** Seconds between spaced seagull caws within a burst. */
export const SEAGULL_CAW_SPACING = 0.28;
/** Pixel seagull poop radius (falling + ground stain). */
export const POOP_RADIUS = 5;
/** Fall speed for exit poop (px/sec) — really slow so Terry can intercept. */
export const POOP_FALL_VY = 42;
/** Lateral speed for angled poop (px/sec); lands offset, not straight under bird. */
export const POOP_LATERAL_VX = 48;
/** Minimum horizontal miss/land offset reference (legacy + tests). */
export const POOP_MISS_OFFSET = 32;
/** Exit poop drop window: fraction of straight-up off-screen progress. */
export const POOP_DROP_PROGRESS_MIN = 0.25;
export const POOP_DROP_PROGRESS_MAX = 0.75;
/** Straight-up exit velocity (vy negative, vx ≈ 0). */
export const SEAGULL_EXIT_VY = -140;
export const SEAGULL_EXIT_VX = 0;
/** Y above which seagull is considered off-screen on vertical exit. */
export const SEAGULL_OFFSCREEN_Y = -60;
/** Seagull drop-off X: canvas horizontal center. */
export function dropOffX(w) {
  return w / 2;
}
/** Seagull drop-off / bottom-playable Y: h - terryR - BOTTOM_PLAYABLE_MARGIN. */
export function dropOffY(h, terryR) {
  return h - terryR - BOTTOM_PLAYABLE_MARGIN;
}

/**
 * Near-miss / lateral side helper (-1 left / +1 right; default random).
 */
export function poopSide(side = null) {
  return side == null ? (Math.random() < 0.5 ? -1 : 1) : (side < 0 ? -1 : 1);
}

/**
 * Near-miss poop X beside a reference (not centered).
 * side: -1 left / +1 right; default random.
 */
export function poopMissX(terryX, w, side = null) {
  const s = poopSide(side);
  const x = terryX + s * POOP_MISS_OFFSET;
  return Math.max(POOP_RADIUS + 2, Math.min(w - POOP_RADIUS - 2, x));
}

/**
 * Progress 0..1 of seagull straight-up exit (drop Y → off-screen).
 */
export function seagullExitProgress(g, offY = SEAGULL_OFFSCREEN_Y) {
  const start = typeof g.exitStartY === 'number' ? g.exitStartY : g.y;
  const total = start - offY;
  if (!(total > 0)) return 1;
  return Math.max(0, Math.min(1, (start - g.y) / total));
}

/** Randomize poop drop within 25%–75% of exit progress. */
export function randomPoopDropProgress() {
  return POOP_DROP_PROGRESS_MIN + Math.random() * (POOP_DROP_PROGRESS_MAX - POOP_DROP_PROGRESS_MIN);
}

/**
 * Spawn falling angled poop from seagull during vertical exit.
 * Lateral vx so it lands offset (not straight under bird). Falls slowly.
 */
export function spawnExitPoop(state, side = null) {
  const g = state.seagull;
  const s = poopSide(side);
  const x = g ? g.x : dropOffX(state.w);
  const y = g ? g.y + 6 : Math.max(POOP_RADIUS, 40);
  const poop = {
    id: state.nextPoopId++,
    x,
    y,
    r: POOP_RADIUS,
    vx: s * POOP_LATERAL_VX,
    vy: POOP_FALL_VY,
    /** falling | ground */
    phase: 'falling',
  };
  state.poops.push(poop);
  return poop;
}

/** @deprecated alias — exit-window spawn is preferred; kept for harness/tests. */
export function spawnDropPoop(state, side = null) {
  return spawnExitPoop(state, side);
}

/** True when water edge covers a ground stain (wave wash). */
export function waterCoversPoop(waterY, poop) {
  return waterY >= poop.y - poop.r;
}

/** Clear poop stuck on Terry (fart-finale leave — NOT seagull pickup). */
export function clearTerryPoopStuck(state) {
  state.poopStuck = false;
}

/** Start a multi-caw burst (arrival or after-drop). Returns first-caw event flag. */
export function startSeagullCawBurst(g) {
  g.cawsPlayed = 1;
  g.nextCawAt = SEAGULL_CAW_SPACING;
  g.cawClock = 0;
  return true;
}

/** Advance spaced multi-caw within a burst. Mutates g; returns true if a caw fires. */
export function tickSeagullCawBurst(g, dt) {
  if (typeof g.cawsPlayed !== 'number') {
    g.cawsPlayed = 0;
    g.nextCawAt = 0;
    g.cawClock = 0;
  }
  g.cawClock = (g.cawClock || 0) + dt;
  if (g.cawsPlayed < SEAGULL_CAW_COUNT && g.cawClock >= g.nextCawAt) {
    g.cawsPlayed += 1;
    g.nextCawAt = g.cawsPlayed * SEAGULL_CAW_SPACING;
    return true;
  }
  return false;
}
/** Minimum px below waterline for catchable beach spawn. */
export const GLASS_SPAWN_BELOW_WATER = 24;
/** Fraction of beach depth (water→bottom) used for random glass height sprinkle. */
export const GLASS_HEIGHT_SPAN = 0.72;
/** When waves advance, this fraction of existing glass is nudged further down. */
export const WAVE_GLASS_PUSH_FRAC = 0.2;
/** Px to push glass further down-beach when carried by a wave. */
export const WAVE_GLASS_PUSH_PX = 18;

/** @deprecated alias kept for clarity in docs */
export const GLASS_POINTS = GLASS_CENTS;
export const FART_THRESHOLD = FINALE_CENTS;

/** Wave phase 0..1: 0=fully out, 0.5=fully in, 1=fully out */
export function wavePhase(t, period = WAVE_PERIOD) {
  const u = ((t % period) + period) % period;
  return u / period;
}

/** Water edge Y as fraction of canvas height (top = water). Higher = more water. */
export function waterEdgeY(phase, h) {
  // Cosine: 0 and 1 → min depth, 0.5 → almost full-screen max depth
  const depth =
    WAVE_MIN_DEPTH +
    (WAVE_MAX_DEPTH - WAVE_MIN_DEPTH) * (0.5 - 0.5 * Math.cos(phase * Math.PI * 2));
  return depth * h;
}

export function wetSandBand(waterY, h) {
  const band = WET_BAND_FRAC * h;
  return { top: waterY, bottom: Math.min(h - 16, waterY + band) };
}

export function createGlass(x, y, id, opts = {}) {
  return {
    id,
    x,
    y,
    r: GLASS_RADIUS,
    hue: 160 + Math.floor(Math.random() * 80),
    collected: false,
    /** If set, glass cannot be collected until state.time reaches this. */
    immuneUntil: opts.immuneUntil ?? 0,
  };
}

/** True when glass center is under the water surface (toward water / smaller Y). */
export function isGlassSubmerged(g, waterY) {
  return g.y < waterY;
}

/** Drop spawn Y near crab / beach — catchable, not forced to waterline only. */
export function glassSpawnYAtWaterline(waterY, h) {
  const y = waterY + GLASS_SPAWN_BELOW_WATER;
  return Math.min((h ?? 1e9) - 24, Math.max(0, y));
}

/**
 * Random beach Y across varying depths (not only waterline).
 * Range: just below waterline → deep beach so glass is catchable at many heights.
 */
export function randomGlassBeachY(waterY, h) {
  const minY = waterY + GLASS_SPAWN_BELOW_WATER;
  const maxY = Math.min(h - 24, waterY + Math.max(GLASS_SPAWN_BELOW_WATER + 8, h * GLASS_HEIGHT_SPAN));
  const lo = Math.min(minY, maxY);
  const hi = Math.max(minY, maxY);
  return lo + Math.random() * (hi - lo);
}

export function spawnGlassInWetBand(waterY, w, h, count, nextId) {
  const items = [];
  let id = nextId;
  for (let i = 0; i < count; i++) {
    const x = 24 + Math.random() * (w - 48);
    const y = randomGlassBeachY(waterY, h);
    items.push(createGlass(x, y, id++));
  }
  return { items, nextId: id };
}

/**
 * As waves roll down, nudge ~WAVE_GLASS_PUSH_FRAC of active glass further down-screen.
 * Returns how many pieces were pushed.
 */
export function pushGlassWithWave(state, pushFrac = WAVE_GLASS_PUSH_FRAC, pushPx = WAVE_GLASS_PUSH_PX) {
  const active = state.glass.filter((g) => !g.collected);
  if (active.length === 0) return 0;
  let pushed = 0;
  for (const g of active) {
    if (Math.random() < pushFrac) {
      g.y = Math.min(state.h - 24, g.y + pushPx + Math.random() * pushPx);
      pushed += 1;
    }
  }
  return pushed;
}

export function overlaps(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const rr = ar + br;
  return dx * dx + dy * dy <= rr * rr;
}

/** True when the water edge overlaps the crab body. */
export function waveOverlapsCrab(waterY, terry) {
  return waterY >= terry.y - terry.r;
}

export function createState(w, h) {
  const waterY = waterEdgeY(0, h);
  const spawn = spawnGlassInWetBand(waterY, w, h, 8, 1);
  return {
    w,
    h,
    /** Held / running cents shown on HUD — +1 pickup, −1 wave drop; seagull at ≥ FINALE_CENTS. */
    currentCents: 0,
    /** Mirror of currentCents for HUD / legacy callers. */
    score: 0,
    terry: { x: w / 2, y: h * 0.72, vx: 0, vy: 0, r: TERRY_RADIUS },
    glass: spawn.items,
    nextGlassId: spawn.nextId,
    time: 0,
    wavePhase: 0,
    lastWaterY: waterY,
    prevWaterY: waterY,
    waveHitThisCycle: false,
    glassPushedThisCycle: false,
    mode: 'play', // play | farting | flying | seagull | returning
    fartTimer: 0,
    fartClouds: [],
    seagull: null, // { x, y, vx, vy, phase: 'enter'|'carry'|'exit', cawsPlayed, nextCawAt }
    /** Falling / ground poop stains (washable by wave). */
    poops: [],
    nextPoopId: 1,
    /** Poop stuck on crab until fart-finale leave (not cleared on seagull pickup). */
    poopStuck: false,
    keys: {
      w: false,
      a: false,
      s: false,
      d: false,
      arrowup: false,
      arrowdown: false,
      arrowleft: false,
      arrowright: false,
    },
    /** 'mouse' = follow crosshairs; 'keyboard' = WASD/arrows only until mouse moves */
    inputMode: 'mouse',
    pointer: { active: false, x: w / 2, y: h * 0.72 },
    labelAlways: true,
  };
}


/** Movement vectors for WASD + arrow keys (same feel). */
export const KEY_VECTORS = {
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
  arrowup: [0, -1],
  arrowdown: [0, 1],
  arrowleft: [-1, 0],
  arrowright: [1, 0],
};

/** Net movement from held keys. Arrows match WASD. */
export function movementFromKeys(keys) {
  let mx = 0;
  let my = 0;
  if (keys.w || keys.arrowup) my -= 1;
  if (keys.s || keys.arrowdown) my += 1;
  if (keys.a || keys.arrowleft) mx -= 1;
  if (keys.d || keys.arrowright) mx += 1;
  return { mx, my };
}

/** Keyboard takes over: stop mouse/crosshair follow until mouse moves again. */
export function setKeyboardMode(state) {
  state.inputMode = 'keyboard';
  if (state.pointer) state.pointer.active = false;
}

/** Mouse/touch resume: crab follows crosshairs again. */
export function setMouseMode(state, x, y) {
  state.inputMode = 'mouse';
  if (state.pointer) {
    state.pointer.active = true;
    if (typeof x === 'number') state.pointer.x = x;
    if (typeof y === 'number') state.pointer.y = y;
  }
}


/** Keep score ↔ currentCents mirrored (held/running total). */
export function syncHeldCents(state) {
  if (typeof state.currentCents === 'number' && typeof state.score === 'number') {
    // Prefer currentCents when they diverge after a partial write
    const v = state.currentCents;
    state.score = v;
    return v;
  }
  const v = state.currentCents ?? state.score ?? 0;
  state.currentCents = v;
  state.score = v;
  return v;
}

export function setHeldCents(state, n) {
  state.currentCents = n;
  state.score = n;
  return n;
}

/**
 * Pickup: +1¢ to held/running total (currentCents).
 * Seagull/finale ONLY when held total reaches ≥ FINALE_CENTS (must have ten cents).
 */
export function collectGlass(state, glass) {
  const held = typeof state.currentCents === 'number' ? state.currentCents : (state.score ?? 0);
  if (glass.collected) {
    return {
      collected: false,
      score: held,
      currentCents: held,
      finale: false,
    };
  }
  glass.collected = true;
  const currentCents = held + GLASS_CENTS;
  const finale = currentCents >= FINALE_CENTS && state.mode === 'play';
  return { collected: true, score: currentCents, currentCents, finale };
}

/**
 * Wave knocks Terry to the BOTTOM of the screen (strong boing) and she drops
 * one 1¢ glass back onto the sand if held score > 0 — running total −1¢.
 * No seagull on wave hit (even from 9→8); seagull only after pickups reach 10.
 */
export function applyWaveHit(state) {
  // Strong knock to bottom of screen
  const bottomY = dropOffY(state.h, state.terry.r);
  state.terry.y = bottomY;
  state.terry.vy = Math.max(state.terry.vy, WAVE_BOUNCE_VY);

  // Release pointer/touch follow so mobile drag does not yank crab back onto the drop
  if (state.pointer) state.pointer.active = false;

  let dropped = false;
  const held = typeof state.currentCents === 'number' ? state.currentCents : (state.score ?? 0);
  if (held > 0) {
    setHeldCents(state, held - GLASS_CENTS);
    // Spawn near crab at bottom / beach, well beside crab, with brief collect immunity
    const side = Math.random() < 0.5 ? -1 : 1;
    const gx = Math.max(
      GLASS_RADIUS + 4,
      Math.min(
        state.w - GLASS_RADIUS - 4,
        state.terry.x + side * (state.terry.r + GLASS_RADIUS + 36),
      ),
    );
    const gy = Math.min(
      state.h - 24,
      Math.max(
        glassSpawnYAtWaterline(state.lastWaterY, state.h),
        state.terry.y - 20,
      ),
    );
    state.glass.push(
      createGlass(gx, gy, state.nextGlassId++, {
        immuneUntil: state.time + DROP_IMMUNE_SEC,
      }),
    );
    dropped = true;
  }
  return { dropped };
}

export function beginFart(state) {
  state.mode = 'farting';
  state.fartTimer = 0;
  // Held cents clear when finale starts so the next 10¢ can re-trigger
  state.currentCents = 0;
  state.score = 0;
  // Stick clears when crab leaves by farting; she returns clean (not on seagull pickup)
  clearTerryPoopStuck(state);
  state.fartClouds = [];
  for (let i = 0; i < 16; i++) {
    state.fartClouds.push({
      x: state.terry.x + (Math.random() - 0.5) * 24,
      y: state.terry.y + 12 + Math.random() * 10,
      vx: (Math.random() - 0.5) * 50,
      vy: 15 + Math.random() * 45,
      life: 0.8 + Math.random() * 1.0,
      age: 0,
      r: 12 + Math.random() * 22,
    });
  }
}

export function afterFinaleReset(state) {
  state.currentCents = 0;
  state.score = 0;
  state.mode = 'play';
  state.fartTimer = 0;
  state.fartClouds = [];
  state.seagull = null;
  state.waveHitThisCycle = false;
  state.glassPushedThisCycle = false;
  state.terry.x = state.w / 2;
  state.terry.y = state.h * 0.72;
  state.terry.vx = 0;
  state.terry.vy = 0;
  // Ground poops stay (washable); stuck already cleared on beginFart
}

/** Finish seagull exit without yanking Terry — control already unlocked on drop. */
export function finishSeagullExit(state) {
  state.seagull = null;
  state.fartTimer = 0;
  state.fartClouds = [];
  if (state.mode === 'seagull') state.mode = 'play';
}

/**
 * Fixed-timestep update. Returns events for audio/UI.
 * events: { clinks, waveWhoosh, fart, waveHit, seagull }
 */
export function update(state, dt) {
  const events = {
    clinks: 0,
    waveWhoosh: null,
    fart: false,
    waveHit: false,
    seagull: false,
    seagullCaw: false,
    poopHit: false,
    poopLand: false,
    poopWash: false,
  };
  state.time += dt;
  const prevPhase = state.wavePhase;
  state.wavePhase = wavePhase(state.time);
  const waterY = waterEdgeY(state.wavePhase, state.h);
  state.prevWaterY = state.lastWaterY;
  state.lastWaterY = waterY;

  const crossedIn = prevPhase < 0.25 && state.wavePhase >= 0.25;
  const crossedOut = prevPhase < 0.75 && state.wavePhase >= 0.75;
  if (crossedIn) events.waveWhoosh = 'in';
  if (crossedOut) events.waveWhoosh = 'out';

  // Clear per-wave hit latch once the tide is mostly out
  if (state.wavePhase >= 0.85 || state.wavePhase < 0.02) {
    state.waveHitThisCycle = false;
    state.glassPushedThisCycle = false;
  }

  // As waves roll down (advancing), push ~20% of existing glass further down
  const advancingWave = state.wavePhase > 0.1 && state.wavePhase < 0.55;
  if (advancingWave && !state.glassPushedThisCycle && state.mode === 'play') {
    pushGlassWithWave(state);
    state.glassPushedThisCycle = true;
  }

  // Deposit glass when wave finishes receding — varying heights across beach
  if (prevPhase < 0.9 && state.wavePhase >= 0.9) {
    const n = 2 + Math.floor(Math.random() * 3);
    const spawned = spawnGlassInWetBand(waterY, state.w, state.h, n, state.nextGlassId);
    state.glass.push(...spawned.items);
    state.nextGlassId = spawned.nextId;
    state.glass = state.glass.filter((g) => !g.collected).slice(-40);
  }

  if (state.mode === 'farting') {
    state.fartTimer += dt;
    for (const c of state.fartClouds) {
      c.age += dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vy -= 8 * dt;
    }
    state.fartClouds = state.fartClouds.filter((c) => c.age < c.life);
    // After big puff, crab slowly flies away
    if (state.fartTimer > 0.7) {
      state.mode = 'flying';
      state.fartTimer = 0;
      state.terry.vy = -90; // slow float up
      state.terry.vx = (Math.random() - 0.5) * 30;
    }
    return events;
  }

  if (state.mode === 'flying') {
    state.terry.x += state.terry.vx * dt;
    state.terry.y += state.terry.vy * dt;
    state.terry.vy -= 20 * dt; // keep drifting up slowly
    state.fartTimer += dt;
    // lingering fart wisps while flying
    if (state.fartTimer < 1.2 && Math.random() < 0.25) {
      state.fartClouds.push({
        x: state.terry.x,
        y: state.terry.y + 14,
        vx: (Math.random() - 0.5) * 20,
        vy: 30 + Math.random() * 20,
        life: 0.5,
        age: 0,
        r: 8 + Math.random() * 12,
      });
    }
    for (const c of state.fartClouds) {
      c.age += dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
    }
    state.fartClouds = state.fartClouds.filter((c) => c.age < c.life);

    if (state.terry.y < -50 || state.fartTimer > 3.2) {
      // Seagull appears to deposit crab back at bottom
      state.mode = 'seagull';
      state.fartTimer = 0;
      state.fartClouds = [];
      // Do NOT clear poopStuck here — stick lasts until fart-finale leave
      state.seagull = {
        x: -40,
        y: 40,
        vx: 120,
        vy: 0,
        phase: 'enter',
        bob: 0,
        cawsPlayed: 0,
        nextCawAt: 0,
        cawClock: 0,
        poopDropped: false,
        poopDropAt: 1,
        exitStartY: null,
      };
      state.terry.x = -60;
      state.terry.y = 70;
      events.seagull = true;
      // Multi-caw burst #1: when seagull SHOWS UP (arrival)
      events.seagullCaw = startSeagullCawBurst(state.seagull);
    }
    return events;
  }

  if (state.mode === 'seagull') {
    const g = state.seagull;
    state.fartTimer += dt;
    g.bob += dt * 6;
    // Arrival multi-caw burst while enter/carry
    if (tickSeagullCawBurst(g, dt)) events.seagullCaw = true;
    if (g.phase === 'enter') {
      g.x += g.vx * dt;
      g.y = 40 + Math.sin(g.bob) * 8;
      // Carry crab under seagull
      state.terry.x = g.x;
      state.terry.y = g.y + 28;
      const targetX = dropOffX(state.w);
      if (g.x >= targetX - 8) {
        g.phase = 'carry';
        // Aim descent at bottom-center so drop stays on-screen (esp. mobile)
        const landX = dropOffX(state.w);
        const landY = dropOffY(state.h, state.terry.r);
        const terryY = g.y + 28;
        const dur = Math.max((landY - terryY) / 90, FIXED_DT);
        g.vy = 90; // keep existing descent speed feel
        g.vx = (landX - g.x) / dur;
      }
    } else if (g.phase === 'carry') {
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      state.terry.x = g.x;
      state.terry.y = g.y + 28;
      // Drop crab at BOTTOM CENTER of the screen
      const landX = dropOffX(state.w);
      const landY = dropOffY(state.h, state.terry.r);
      if (state.terry.y >= landY) {
        state.terry.x = landX;
        state.terry.y = landY;
        g.x = landX;
        g.y = landY - 28;
        g.phase = 'exit';
        // Straight UP exit (not angled): vy negative, vx ≈ 0
        g.vx = SEAGULL_EXIT_VX;
        g.vy = SEAGULL_EXIT_VY;
        g.exitStartY = g.y;
        g.poopDropped = false;
        // Harness may pre-set poopDropAt; otherwise randomize in 25–75% window
        if (!(typeof g.poopDropAt === 'number'
              && g.poopDropAt >= POOP_DROP_PROGRESS_MIN
              && g.poopDropAt <= POOP_DROP_PROGRESS_MAX)) {
          g.poopDropAt = randomPoopDropProgress();
        }
        // Multi-caw burst #2: AFTER drop-off
        events.seagullCaw = startSeagullCawBurst(g);
        // Unlock control immediately — poop drops later during vertical exit
        state.mode = 'play';
        state.terry.vx = 0;
        state.terry.vy = 0;
        // Fall through to play movement so she can move while bird exits
      }
    } else if (g.phase === 'exit') {
      // Should not linger in seagull+exit — unlock sets mode play — but keep safe
      if (tickSeagullCawBurst(g, dt)) events.seagullCaw = true;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      if (!g.poopDropped && seagullExitProgress(g) >= (g.poopDropAt ?? POOP_DROP_PROGRESS_MIN)) {
        spawnExitPoop(state);
        g.poopDropped = true;
      }
      if (g.y < SEAGULL_OFFSCREEN_Y || g.x > state.w + 60 || g.x < -60) {
        finishSeagullExit(state);
      }
      return events;
    }
    // If still carrying/entering, no player control yet
    if (state.mode === 'seagull') return events;
    // else dropped → continue into play movement below
  }

  // Seagull vertical exit + delayed angled poop while Terry is free in play mode
  if (state.mode === 'play' && state.seagull && state.seagull.phase === 'exit') {
    const g = state.seagull;
    g.bob = (g.bob || 0) + dt * 6;
    if (tickSeagullCawBurst(g, dt)) events.seagullCaw = true;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    if (!g.poopDropped && seagullExitProgress(g) >= (g.poopDropAt ?? POOP_DROP_PROGRESS_MIN)) {
      spawnExitPoop(state);
      g.poopDropped = true;
    }
    if (g.y < SEAGULL_OFFSCREEN_Y || g.x > state.w + 60 || g.x < -60) {
      finishSeagullExit(state);
    }
  }

  // Falling / ground poops: hit Terry → stick; land → stain; wave covers → wash
  if (state.poops && state.poops.length) {
    const landY = dropOffY(state.h, state.terry.r);
    const nextPoops = [];
    for (const p of state.poops) {
      if (p.phase === 'falling') {
        p.x += (p.vx || 0) * dt;
        p.y += p.vy * dt;
        // Keep on-canvas horizontally
        p.x = Math.max(p.r + 1, Math.min(state.w - p.r - 1, p.x));
        if (
          !state.poopStuck &&
          overlaps(state.terry.x, state.terry.y, state.terry.r, p.x, p.y, p.r)
        ) {
          state.poopStuck = true;
          events.poopHit = true;
          continue; // removed from ground list — stuck on crab
        }
        const groundY = Math.min(landY + 4, state.h - p.r - 2);
        if (p.y >= groundY) {
          p.y = groundY;
          p.phase = 'ground';
          p.vy = 0;
          p.vx = 0;
          events.poopLand = true;
        }
        nextPoops.push(p);
      } else if (p.phase === 'ground') {
        if (waterCoversPoop(waterY, p)) {
          events.poopWash = true;
          continue; // washed away
        }
        nextPoops.push(p);
      } else {
        nextPoops.push(p);
      }
    }
    state.poops = nextPoops;
  }

  // --- play mode movement ---
  const { mx, my } = movementFromKeys(state.keys);
  if (mx || my) {
    // Keyboard movement → leave mouse follow until mouse moves again
    if (state.inputMode !== 'keyboard') setKeyboardMode(state);
    const len = Math.hypot(mx, my) || 1;
    state.terry.vx = (mx / len) * TERRY_SPEED;
    state.terry.vy = (my / len) * TERRY_SPEED;
  } else if (state.inputMode === 'mouse' && state.pointer.active) {
    const dx = state.pointer.x - state.terry.x;
    const dy = state.pointer.y - state.terry.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 4) {
      const sp = Math.min(FOLLOW_SPEED, dist * 4);
      state.terry.vx = (dx / dist) * sp;
      state.terry.vy = (dy / dist) * sp;
    } else {
      state.terry.vx = 0;
      state.terry.vy = 0;
    }
  } else {
    state.terry.vx *= 0.85;
    state.terry.vy *= 0.85;
    if (Math.abs(state.terry.vx) < 1) state.terry.vx = 0;
    if (Math.abs(state.terry.vy) < 1) state.terry.vy = 0;
  }

  state.terry.x += state.terry.vx * dt;
  state.terry.y += state.terry.vy * dt;

  // Full beach range — waves may sweep over Terry (no hard "always below water" clamp)
  state.terry.x = Math.max(state.terry.r, Math.min(state.w - state.terry.r, state.terry.x));
  state.terry.y = Math.max(state.terry.r + 8, Math.min(state.h - state.terry.r - 8, state.terry.y));

  // Wave hit: advancing tide overlaps crab → bounce to bottom + drop 1¢ if held > 0
  const advancing = state.wavePhase > 0.02 && state.wavePhase < 0.55;
  if (advancing && waveOverlapsCrab(waterY, state.terry) && !state.waveHitThisCycle) {
    state.waveHitThisCycle = true;
    applyWaveHit(state);
    events.waveHit = true;
  } else if (waveOverlapsCrab(waterY, state.terry)) {
    // Keep her from sitting under the water column after the hit
    state.terry.y = Math.max(state.terry.y, waterY + state.terry.r + 4);
    state.terry.y = Math.min(state.terry.y, state.h - state.terry.r - 8);
  }

  for (const g of state.glass) {
    if (g.collected) continue;
    if (g.immuneUntil && state.time < g.immuneUntil) continue;
    if (overlaps(state.terry.x, state.terry.y, state.terry.r, g.x, g.y, g.r)) {
      const res = collectGlass(state, g);
      if (res.collected) {
        state.currentCents = res.currentCents;
        state.score = res.currentCents;
        events.clinks += 1;
        if (res.finale) {
          events.fart = true;
          beginFart(state);
          break;
        }
      }
    }
  }

  return events;
}

/**
 * Advance wall-clock time through the fixed-step sim at the given speed.
 * Returns aggregate events. Caps steps so a huge hitch cannot melt the CPU.
 */
export function advanceWallTime(state, wallDt, speed = getSpeedMultiplier(), maxSteps = 600) {
  const events = {
    clinks: 0,
    waveWhoosh: null,
    fart: false,
    waveHit: false,
    seagull: false,
    seagullCaw: 0,
    poopHit: false,
    poopLand: false,
    poopWash: false,
  };
  let budget = Math.max(0, wallDt) * (speed > 0 ? speed : 1);
  let steps = 0;
  while (budget >= FIXED_DT && steps < maxSteps) {
    const ev = update(state, FIXED_DT);
    events.clinks += ev.clinks;
    if (ev.waveWhoosh) events.waveWhoosh = ev.waveWhoosh;
    if (ev.fart) events.fart = true;
    if (ev.waveHit) events.waveHit = true;
    if (ev.seagull) events.seagull = true;
    if (ev.seagullCaw) events.seagullCaw += 1;
    if (ev.poopHit) events.poopHit = true;
    if (ev.poopLand) events.poopLand = true;
    if (ev.poopWash) events.poopWash = true;
    budget -= FIXED_DT;
    steps += 1;
  }
  return { events, steps, remainder: budget };
}

export function activeGlass(state) {
  return state.glass.filter((g) => !g.collected);
}

export function formatCents(score) {
  return `${score}\u00a2`;
}
