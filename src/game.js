/**
 * Pure game logic for Terry's Beach (testable, no DOM).
 * Original 8-bit beach crab — original art only — no third-party characters.
 */

export const GLASS_CENTS = 1;
export const FINALE_CENTS = 25;
export const TERRY_RADIUS = 14;
export const GLASS_RADIUS = 8;
export const TERRY_SPEED = 160; // px/sec WASD
export const FOLLOW_SPEED = 220; // px/sec pointer follow
export const FIXED_DT = 1 / 60;
export const WAVE_PERIOD = 8; // seconds full in+out cycle
export const WET_BAND_FRAC = 0.18;

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
  const depth = 0.12 + 0.14 * (0.5 - 0.5 * Math.cos(phase * Math.PI * 2));
  return depth * h;
}

export function wetSandBand(waterY, h) {
  const band = WET_BAND_FRAC * h;
  return { top: waterY, bottom: Math.min(h * 0.55, waterY + band) };
}

export function createGlass(x, y, id) {
  return {
    id,
    x,
    y,
    r: GLASS_RADIUS,
    hue: 160 + Math.floor(Math.random() * 80),
    collected: false,
  };
}

export function spawnGlassInWetBand(waterY, w, h, count, nextId) {
  const band = wetSandBand(waterY, h);
  const items = [];
  let id = nextId;
  for (let i = 0; i < count; i++) {
    const x = 24 + Math.random() * (w - 48);
    const y = band.top + 8 + Math.random() * Math.max(8, band.bottom - band.top - 16);
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

export function createState(w, h) {
  const waterY = waterEdgeY(0, h);
  const spawn = spawnGlassInWetBand(waterY, w, h, 8, 1);
  return {
    w,
    h,
    score: 0, // cents
    terry: { x: w / 2, y: h * 0.62, vx: 0, vy: 0, r: TERRY_RADIUS },
    glass: spawn.items,
    nextGlassId: spawn.nextId,
    time: 0,
    wavePhase: 0,
    lastWaterY: waterY,
    prevWaterY: waterY,
    mode: 'play', // play | farting | flying | seagull | returning
    fartTimer: 0,
    fartClouds: [],
    seagull: null, // { x, y, vx, vy, phase: 'enter'|'carry'|'exit' }
    keys: { w: false, a: false, s: false, d: false },
    pointer: { active: false, x: w / 2, y: h * 0.62 },
    labelAlways: true,
  };
}

export function collectGlass(state, glass) {
  if (glass.collected) return { collected: false, score: state.score, finale: false };
  glass.collected = true;
  const score = state.score + GLASS_CENTS;
  const finale = score >= FINALE_CENTS && state.mode === 'play';
  return { collected: true, score, finale };
}

export function beginFart(state) {
  state.mode = 'farting';
  state.fartTimer = 0;
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
  state.mode = 'play';
  state.fartTimer = 0;
  state.fartClouds = [];
  state.seagull = null;
  state.terry.x = state.w / 2;
  state.terry.y = state.h * 0.62;
  state.terry.vx = 0;
  state.terry.vy = 0;
}

/**
 * Fixed-timestep update. Returns events for audio/UI.
 * events: { clinks: number, waveWhoosh: 'in'|'out'|null, fart: bool }
 */
export function update(state, dt) {
  const events = { clinks: 0, waveWhoosh: null, fart: false };
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
      const landY = state.h * 0.62;
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
  let mx = 0;
  let my = 0;
  if (state.keys.w) my -= 1;
  if (state.keys.s) my += 1;
  if (state.keys.a) mx -= 1;
  if (state.keys.d) mx += 1;
  if (mx || my) {
    const len = Math.hypot(mx, my) || 1;
    state.terry.vx = (mx / len) * TERRY_SPEED;
    state.terry.vy = (my / len) * TERRY_SPEED;
  } else if (state.pointer.active) {
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

  const minY = waterY + state.terry.r + 4;
  state.terry.x = Math.max(state.terry.r, Math.min(state.w - state.terry.r, state.terry.x));
  state.terry.y = Math.max(minY, Math.min(state.h - state.terry.r - 8, state.terry.y));

  for (const g of state.glass) {
    if (g.collected) continue;
    if (overlaps(state.terry.x, state.terry.y, state.terry.r, g.x, g.y, g.r)) {
      const res = collectGlass(state, g);
      if (res.collected) {
        state.score = res.score;
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
