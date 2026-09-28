/**
 * Pure game logic for Terry's Beach (testable, no DOM).
 * Original 8-bit beach crab — original art only — no third-party characters.
 */

export const GLASS_CENTS = 1;
export const FINALE_CENTS = 25;
export const TERRY_RADIUS = 14;
export const GLASS_RADIUS = 8;
export const TERRY_SPEED = 160; // px/sec WASD + arrows
export const FOLLOW_SPEED = 220; // px/sec pointer follow
export const FIXED_DT = 1 / 60;
export const WAVE_PERIOD = 8; // seconds full in+out cycle
export const WET_BAND_FRAC = 0.18;
/** Peak wave reaches this fraction of canvas height (almost full screen). */
export const WAVE_MAX_DEPTH = 0.88;
/** Low-tide water edge fraction. */
export const WAVE_MIN_DEPTH = 0.08;
/** Downward bounce distance when a wave hits Terry (px). */
export const WAVE_BOUNCE = 110;
/** Downward impulse velocity on wave hit (px/sec). */
export const WAVE_BOUNCE_VY = 280;
/** Seconds freshly dropped glass cannot be re-collected (touch follow fix). */
export const DROP_IMMUNE_SEC = 0.45;

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

/** Drop / deposit spawn Y sits on the current water surface (visible, not submerged). */
export function glassSpawnYAtWaterline(waterY, h) {
  return Math.min((h ?? 1e9) - 24, Math.max(0, waterY));
}

export function spawnGlassInWetBand(waterY, w, h, count, nextId) {
  const items = [];
  let id = nextId;
  const surfaceY = glassSpawnYAtWaterline(waterY, h);
  for (let i = 0; i < count; i++) {
    const x = 24 + Math.random() * (w - 48);
    // Spawn at waterline (± few px into sand so piece is visible, not submerged)
    const y = surfaceY + Math.random() * 6;
    items.push(createGlass(x, y, id++));
  }
  return { items, nextId: id };
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
    score: 0, // cents shown on HUD (can drop on wave hit; resets after finale)
    lifetimeCollected: 0, // cumulative ¢ collected toward finale; resets only when finale starts
    terry: { x: w / 2, y: h * 0.72, vx: 0, vy: 0, r: TERRY_RADIUS },
    glass: spawn.items,
    nextGlassId: spawn.nextId,
    time: 0,
    wavePhase: 0,
    lastWaterY: waterY,
    prevWaterY: waterY,
    waveHitThisCycle: false,
    mode: 'play', // play | farting | flying | seagull | returning
    fartTimer: 0,
    fartClouds: [],
    seagull: null, // { x, y, vx, vy, phase: 'enter'|'carry'|'exit' }
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

export function collectGlass(state, glass) {
  if (glass.collected) {
    return {
      collected: false,
      score: state.score,
      lifetimeCollected: state.lifetimeCollected,
      finale: false,
    };
  }
  glass.collected = true;
  const score = state.score + GLASS_CENTS;
  const lifetimeCollected = state.lifetimeCollected + GLASS_CENTS;
  const finale = lifetimeCollected >= FINALE_CENTS && state.mode === 'play';
  return { collected: true, score, lifetimeCollected, finale };
}

/**
 * Wave knocks Terry down-beach and she drops one 1¢ glass back onto the sand
 * if she has any on the HUD score. Lifetime total is NOT decremented.
 */
export function applyWaveHit(state) {
  const waterY = state.lastWaterY;
  state.terry.y = Math.min(
    state.h - state.terry.r - 8,
    Math.max(state.terry.y + WAVE_BOUNCE, waterY + state.terry.r + 28),
  );
  state.terry.vy = Math.max(state.terry.vy, WAVE_BOUNCE_VY);

  // Release pointer/touch follow so mobile drag does not yank crab back onto the drop
  if (state.pointer) state.pointer.active = false;

  let dropped = false;
  if (state.score > 0) {
    state.score -= GLASS_CENTS;
    // Spawn at waterline, well beside crab, with brief collect immunity (touch path)
    const side = Math.random() < 0.5 ? -1 : 1;
    const gx = Math.max(
      GLASS_RADIUS + 4,
      Math.min(
        state.w - GLASS_RADIUS - 4,
        state.terry.x + side * (state.terry.r + GLASS_RADIUS + 36),
      ),
    );
    const gy = glassSpawnYAtWaterline(waterY, state.h);
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
  // Reset lifetime so the next 25¢ collected can fire finale again
  state.lifetimeCollected = 0;
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
  state.score = 0;
  // lifetimeCollected already cleared when finale began
  state.mode = 'play';
  state.fartTimer = 0;
  state.fartClouds = [];
  state.seagull = null;
  state.waveHitThisCycle = false;
  state.terry.x = state.w / 2;
  state.terry.y = state.h * 0.72;
  state.terry.vx = 0;
  state.terry.vy = 0;
}

/**
 * Fixed-timestep update. Returns events for audio/UI.
 * events: { clinks: number, waveWhoosh: 'in'|'out'|null, fart: bool, waveHit: bool }
 */
export function update(state, dt) {
  const events = { clinks: 0, waveWhoosh: null, fart: false, waveHit: false };
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
  }

  // Deposit glass when wave finishes receding
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
      // Seagull appears to deposit crab back
      state.mode = 'seagull';
      state.fartTimer = 0;
      state.fartClouds = [];
      state.seagull = {
        x: -40,
        y: 40,
        vx: 120,
        vy: 0,
        phase: 'enter',
        bob: 0,
      };
      state.terry.x = -60;
      state.terry.y = 70;
    }
    return events;
  }

  if (state.mode === 'seagull') {
    const g = state.seagull;
    state.fartTimer += dt;
    g.bob += dt * 6;
    if (g.phase === 'enter') {
      g.x += g.vx * dt;
      g.y = 40 + Math.sin(g.bob) * 8;
      // Carry crab under seagull
      state.terry.x = g.x;
      state.terry.y = g.y + 28;
      const targetX = state.w / 2;
      if (g.x >= targetX - 8) {
        g.phase = 'carry';
        g.vx = 40;
        g.vy = 70;
      }
    } else if (g.phase === 'carry') {
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      state.terry.x = g.x;
      state.terry.y = g.y + 28;
      const landY = state.h * 0.72;
      if (state.terry.y >= landY) {
        state.terry.y = landY;
        g.phase = 'exit';
        g.vx = 160;
        g.vy = -80;
      }
    } else if (g.phase === 'exit') {
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      if (g.x > state.w + 60 || g.y < -60) {
        afterFinaleReset(state);
      }
    }
    return events;
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

  // Wave hit: advancing tide overlaps crab → bounce down + drop 1¢ glass if score > 0
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
        state.score = res.score;
        state.lifetimeCollected = res.lifetimeCollected;
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

export function activeGlass(state) {
  return state.glass.filter((g) => !g.collected);
}

export function formatCents(score) {
  return `${score}\u00a2`;
}
