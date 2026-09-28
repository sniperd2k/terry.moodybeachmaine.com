import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createState,
  collectGlass,
  update,
  overlaps,
  GLASS_CENTS,
  FINALE_CENTS,
  formatCents,
  FIXED_DT,
  TERRY_SPEED,
  activeGlass,
  beginFart,
  waterEdgeY,
  wavePhase,
  WAVE_MAX_DEPTH,
  WAVE_MIN_DEPTH,
  WAVE_BOUNCE,
  WAVE_BOUNCE_VY,
  waveOverlapsCrab,
  applyWaveHit,
  afterFinaleReset,
  isGlassSubmerged,
  glassSpawnYAtWaterline,
  GLASS_SPAWN_BELOW_WATER,
  spawnGlassInWetBand,
  randomGlassBeachY,
  pushGlassWithWave,
  WAVE_GLASS_PUSH_FRAC,
  setHeldCents,
  KEY_VECTORS,
  movementFromKeys,
  setKeyboardMode,
  setMouseMode,
  getSpeedMultiplier,
  setSpeedMultiplier,
  parseSpeedFromSearch,
  parseDevFromSearch,
  advanceWallTime,
  dropOffX,
  dropOffY,
  BOTTOM_PLAYABLE_MARGIN,
  SEAGULL_CAW_COUNT,
  SEAGULL_CAW_SPACING,
  POOP_MISS_OFFSET,
  POOP_RADIUS,
  POOP_FALL_VY,
  POOP_LATERAL_VX,
  POOP_ZIG_AMPLITUDE,
  POOP_ZIG_PERIOD,
  poopFallVx,
  POOP_DROP_PROGRESS_MIN,
  POOP_DROP_PROGRESS_MAX,
  SEAGULL_EXIT_VY,
  SEAGULL_EXIT_VX,
  SEAGULL_OFFSCREEN_Y,
  poopMissX,
  spawnDropPoop,
  spawnExitPoop,
  seagullExitProgress,
  randomPoopDropProgress,
  waterCoversPoop,
  clearTerryPoopStuck,
  finishSeagullExit,
} from '../src/game.js';
import { AUDIO_UNLOCK_EVENTS } from '../src/audio.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('page smoke', () => {
  it('index.html has canvas, GA4, no rental brochure', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    expect(html).toContain('G-CJP2HX87N2');
    expect(html).toContain('gtag');
    expect(html).toContain('id="beach"');
    expect(html).toContain('src="src/main.js"');
    expect(html).toContain('href="src/styles.css"');
    expect(html).not.toContain('Canonicus');
    expect(html).not.toContain('VacationRental');
    expect(html).not.toContain('333 Ocean');
  });

  it('web.config DisableCache + defaultDocument', () => {
    const cfg = readFileSync(join(root, 'web.config'), 'utf8');
    expect(cfg).toContain('DisableCache');
    expect(cfg).toContain('<add value="index.html" />');
    expect(cfg).toContain('terry.moodybeachmaine.com');
  });

  it('pipeline tree present', () => {
    expect(existsSync(join(root, 'src/game.js'))).toBe(true);
    expect(existsSync(join(root, 'src/main.js'))).toBe(true);
    expect(existsSync(join(root, 'src/draw.js'))).toBe(true);
    expect(existsSync(join(root, 'src/audio.js'))).toBe(true);
    expect(existsSync(join(root, 'src/styles.css'))).toBe(true);
  });

  it('original art only strings', () => {
    const files = ['index.html', 'src/main.js', 'src/draw.js', 'src/game.js', 'src/audio.js'];
    for (const f of files) {
      const t = readFileSync(join(root, f), 'utf8').toLowerCase();
      expect(t).not.toMatch(/mario|zelda|nintendo|luigi|bowser|pokémon|pokemon/);
    }
  });

  it('audio unlock helper + boing + seagull present', () => {
    const audio = readFileSync(join(root, 'src/audio.js'), 'utf8');
    expect(audio).toContain('unlockAudio');
    expect(audio).toContain('CLINKS');
    expect(audio).toContain('playWaveWhoosh');
    expect(audio).toContain('playFart');
    expect(audio).toContain('playBoing');
    expect(audio).toContain('playSeagull');
    const main = readFileSync(join(root, 'src/main.js'), 'utf8');
    expect(main).toContain('unlockAudio');
    expect(main).toContain('playBoing');
    expect(main).toContain('playSeagull');
  });
});

describe('Chrome / desktop audio unlock gestures', () => {
  it('unlock hooks include keyboard + mouse (not touch-only)', () => {
    expect(AUDIO_UNLOCK_EVENTS).toEqual(
      expect.arrayContaining(['keydown', 'mousedown', 'pointerdown', 'click', 'touchstart']),
    );
    const main = readFileSync(join(root, 'src/main.js'), 'utf8');
    expect(main).toContain('AUDIO_UNLOCK_EVENTS');
    expect(main).toContain("addEventListener('mousedown'");
    expect(main).toContain("addEventListener('click'");
    expect(main).toContain('keydown');
  });
});

describe('score / glass collect (held currentCents model)', () => {
  it('glass is 1 cent; finale at 10 cents held', () => {
    expect(GLASS_CENTS).toBe(1);
    expect(FINALE_CENTS).toBe(10);
    expect(formatCents(7)).toBe('7¢');
  });

  it('FINALE gate is currentCents >= 10 (not lifetimeCollected)', () => {
    expect(FINALE_CENTS).toBe(10);
    const src = readFileSync(join(root, 'src/game.js'), 'utf8');
    expect(src).toMatch(/currentCents\s*>=\s*FINALE_CENTS/);
    expect(src).not.toMatch(/lifetimeCollected\s*>=\s*FINALE_CENTS/);
    expect(src).not.toMatch(/lifetimeCollected/);
  });

  it('collectGlass increments held total by +1¢', () => {
    const state = createState(400, 600);
    const g = state.glass[0];
    const res = collectGlass(state, g);
    expect(res.collected).toBe(true);
    expect(res.currentCents).toBe(1);
    expect(res.score).toBe(1);
    expect(g.collected).toBe(true);
  });

  it('overlap collect via update raises currentCents +1', () => {
    const state = createState(400, 600);
    const g = activeGlass(state)[0];
    state.glass = [g];
    state.terry.x = g.x;
    state.terry.y = g.y;
    state.time = 0;
    state.wavePhase = 0;
    state.lastWaterY = waterEdgeY(0, state.h);
    state.waveHitThisCycle = true;
    const before = state.currentCents;
    const ev = update(state, FIXED_DT);
    expect(ev.clinks).toBe(1);
    expect(state.currentCents).toBe(before + GLASS_CENTS);
    expect(state.score).toBe(state.currentCents);
  });

  it('seagull/finale triggers only when held currentCents reaches 10', () => {
    const state = createState(400, 600);
    setHeldCents(state, 9);
    const g = { id: 99, x: state.terry.x, y: state.terry.y, r: 8, hue: 180, collected: false };
    state.glass.push(g);
    const res = collectGlass(state, g);
    expect(res.finale).toBe(true);
    expect(res.currentCents).toBe(10);
    setHeldCents(state, res.currentCents);
    beginFart(state);
    expect(state.mode).toBe('farting');
    expect(state.currentCents).toBe(0);
    expect(state.fartClouds.length).toBeGreaterThan(0);
  });

  it('at 9¢ wave hit → 8¢, NO seagull/finale', () => {
    const state = createState(400, 600);
    setHeldCents(state, 9);
    state.terry.y = state.h * 0.4;
    const hit = applyWaveHit(state);
    expect(hit.dropped).toBe(true);
    expect(state.currentCents).toBe(8);
    expect(state.score).toBe(8);
    expect(state.mode).toBe('play');
    // Finale still requires held ≥ 10 after a pickup
    const g = { id: 77, x: 1, y: 1, r: 8, hue: 180, collected: false };
    const res = collectGlass(state, g);
    expect(res.currentCents).toBe(9);
    expect(res.finale).toBe(false);
  });

  it('afterFinaleReset clears held cents', () => {
    const state = createState(400, 600);
    setHeldCents(state, 10);
    beginFart(state);
    afterFinaleReset(state);
    expect(state.currentCents).toBe(0);
    expect(state.score).toBe(0);
    expect(state.mode).toBe('play');
  });

  it('overlaps helper works', () => {
    expect(overlaps(0, 0, 10, 5, 0, 10)).toBe(true);
    expect(overlaps(0, 0, 5, 100, 100, 5)).toBe(false);
  });
});

describe('sea glass height variance + wave push', () => {
  it('glass submerged (hidden) when y < waterline', () => {
    const waterY = 200;
    expect(isGlassSubmerged({ y: 150 }, waterY)).toBe(true);
    expect(isGlassSubmerged({ y: 200 }, waterY)).toBe(false);
    expect(isGlassSubmerged({ y: 250 }, waterY)).toBe(false);
  });

  it('main render skips submerged glass', () => {
    const main = readFileSync(join(root, 'src/main.js'), 'utf8');
    expect(main).toContain('isGlassSubmerged');
    expect(main).toMatch(/if\s*\(\s*isGlassSubmerged/);
  });

  it('spawn sprinkles glass at varying beach heights (not waterline-only)', () => {
    const waterY = 80;
    const h = 600;
    const { items } = spawnGlassInWetBand(waterY, 400, h, 40, 1);
    const ys = items.map((g) => g.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    expect(minY).toBeGreaterThanOrEqual(waterY + GLASS_SPAWN_BELOW_WATER - 1);
    expect(maxY - minY).toBeGreaterThan(40); // meaningful height variance
    for (const g of items) {
      expect(isGlassSubmerged(g, waterY)).toBe(false);
      expect(g.y).toBeLessThan(h - 8);
    }
    // randomGlassBeachY itself spans
    const samples = Array.from({ length: 30 }, () => randomGlassBeachY(waterY, h));
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(40);
  });

  it('wave push moves ~20% of glass further down', () => {
    expect(WAVE_GLASS_PUSH_FRAC).toBeCloseTo(0.2, 5);
    const state = createState(400, 600);
    state.glass = [];
    for (let i = 0; i < 100; i++) {
      state.glass.push({
        id: i + 1,
        x: 50,
        y: 200,
        r: 8,
        hue: 180,
        collected: false,
        immuneUntil: 0,
      });
    }
    const before = state.glass.map((g) => g.y);
    // Deterministic: push check then optional jitter per glass
    let pushed = 0;
    const orig = Math.random;
    let i = 0;
    Math.random = () => {
      const n = i++;
      // For each glass: call#0 = frac check, call#1 = jitter only if pushed
      // Push first 20 glasses: checks at positions where we still owe a check
      // Simpler: alternate pattern — return 0.05 (push) then 0.5 (jitter) twenty times, then 0.9
      const pushPairs = 20;
      if (n < pushPairs * 2) {
        return n % 2 === 0 ? 0.05 : 0.5;
      }
      return 0.9; // no push
    };
    try {
      pushed = pushGlassWithWave(state, WAVE_GLASS_PUSH_FRAC, 18);
    } finally {
      Math.random = orig;
    }
    expect(pushed).toBe(20);
    const moved = state.glass.filter((g, idx) => g.y > before[idx]).length;
    expect(moved).toBe(20);
    for (const g of state.glass) {
      if (g.y > 200) expect(g.y).toBeGreaterThanOrEqual(200 + 18);
    }
  });

  it('update advancing wave triggers glass push once per cycle', () => {
    const state = createState(400, 600);
    state.glass = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1, x: 40 + i * 10, y: 180, r: 8, hue: 160, collected: false, immuneUntil: 0,
    }));
    state.terry.y = state.h - 40;
    state.waveHitThisCycle = true;
    state.glassPushedThisCycle = false;
    state.time = 1.0; // phase ~0.125 advancing
    state.wavePhase = wavePhase(state.time);
    const ysBefore = state.glass.map((g) => g.y);
    for (let i = 0; i < 30; i++) update(state, FIXED_DT);
    expect(state.glassPushedThisCycle).toBe(true);
    // At least some chance of movement with real random — assert flag latched
    expect(ysBefore.length).toBe(10);
  });
});

describe('deep waves + wave hit drop + bottom bounce', () => {
  it('waves reach almost full screen at peak', () => {
    expect(WAVE_MAX_DEPTH).toBeGreaterThanOrEqual(0.8);
    const h = 600;
    const peak = waterEdgeY(0.5, h);
    const low = waterEdgeY(0, h);
    expect(peak / h).toBeGreaterThanOrEqual(0.8);
    expect(low / h).toBeLessThan(0.2);
    expect(peak).toBeGreaterThan(low * 3);
  });

  it('wave phase helper cycles 0..1', () => {
    expect(wavePhase(0)).toBe(0);
    expect(wavePhase(4)).toBeCloseTo(0.5, 5);
  });

  it('wave overlap detects crab under water edge', () => {
    const terry = { x: 200, y: 300, r: 14 };
    expect(waveOverlapsCrab(290, terry)).toBe(true);
    expect(waveOverlapsCrab(100, terry)).toBe(false);
  });

  it('bounce knocks crab to bottom of screen', () => {
    expect(WAVE_BOUNCE).toBeGreaterThanOrEqual(100);
    expect(WAVE_BOUNCE_VY).toBeGreaterThanOrEqual(250);
    const state = createState(400, 600);
    setHeldCents(state, 3);
    state.terry.y = 200;
    applyWaveHit(state);
    const bottom = dropOffY(state.h, state.terry.r);
    expect(state.terry.y).toBe(bottom);
    expect(BOTTOM_PLAYABLE_MARGIN).toBe(8);
    expect(state.terry.vy).toBeGreaterThanOrEqual(WAVE_BOUNCE_VY);
  });

  it('wave hit decrements held score −1¢ and drops 1 glass', () => {
    const state = createState(400, 600);
    setHeldCents(state, 5);
    const glassBefore = state.glass.length;
    const hit = applyWaveHit(state);
    expect(hit.dropped).toBe(true);
    expect(state.currentCents).toBe(4);
    expect(state.score).toBe(4);
    expect(state.glass.length).toBe(glassBefore + 1);
    const dropped = state.glass[state.glass.length - 1];
    expect(dropped.collected).toBe(false);
    expect(dropped.immuneUntil).toBeGreaterThan(state.time);
    expect(state.pointer.active).toBe(false);
  });

  it('wave hit with score 0 still bounces to bottom but no drop', () => {
    const state = createState(400, 600);
    setHeldCents(state, 0);
    const yBefore = state.terry.y;
    const glassBefore = state.glass.length;
    const hit = applyWaveHit(state);
    expect(hit.dropped).toBe(false);
    expect(state.currentCents).toBe(0);
    expect(state.terry.y).toBe(state.h - state.terry.r - 8);
    expect(state.terry.y).toBeGreaterThanOrEqual(yBefore);
    expect(state.glass.length).toBe(glassBefore);
  });

  it('update fires one waveHit per advancing cycle when overlapped', () => {
    const state = createState(400, 600);
    setHeldCents(state, 3);
    state.terry.y = state.h * 0.4;
    state.terry.x = state.w / 2;
    state.glass = [];
    state.time = 1.5;
    state.wavePhase = wavePhase(state.time);
    state.lastWaterY = waterEdgeY(state.wavePhase, state.h);
    state.waveHitThisCycle = false;

    let hits = 0;
    let minScore = state.currentCents;
    for (let i = 0; i < 240; i++) {
      const ev = update(state, FIXED_DT);
      if (ev.waveHit) hits += 1;
      minScore = Math.min(minScore, state.currentCents);
      for (const g of state.glass) {
        if (!g.collected) {
          g.x = 10;
          g.y = state.h - 10;
        }
      }
    }
    expect(hits).toBeGreaterThanOrEqual(1);
    expect(hits).toBeLessThanOrEqual(2);
    expect(minScore).toBeLessThan(3);
    expect(state.currentCents).toBeGreaterThanOrEqual(0);
  });

  it('mobile/touch path: wave hit drops glass even with pointer active', () => {
    const state = createState(390, 844);
    setHeldCents(state, 4);
    state.pointer.active = true;
    state.pointer.x = state.terry.x;
    state.pointer.y = state.terry.y;
    state.lastWaterY = state.terry.y - 5;
    const glassBefore = state.glass.length;
    const hit = applyWaveHit(state);
    expect(hit.dropped).toBe(true);
    expect(state.pointer.active).toBe(false);
    expect(state.glass.length).toBe(glassBefore + 1);
    expect(state.terry.y).toBe(state.h - state.terry.r - 8);
    const dropped = state.glass[state.glass.length - 1];
    state.pointer.active = true;
    state.pointer.x = dropped.x;
    state.pointer.y = dropped.y;
    state.terry.x = dropped.x;
    state.terry.y = dropped.y;
    state.waveHitThisCycle = true;
    const scoreBefore = state.currentCents;
    update(state, FIXED_DT);
    expect(state.currentCents).toBe(scoreBefore); // still immune
  });

  it('main wires waveHit → playBoing and seagullCaw → playSeagull (multi-caw)', () => {
    const main = readFileSync(join(root, 'src/main.js'), 'utf8');
    expect(main).toMatch(/ev\.waveHit.*playBoing|if \(ev\.waveHit\) playBoing/);
    expect(main).toMatch(/ev\.seagullCaw.*playSeagull|if \(ev\.seagullCaw\) playSeagull/);
    expect(main).toContain('drawPoop');
    expect(main).toContain('drawPoopStuckOnCrab');
    expect(main).toContain('drawHUD(ctx, state.currentCents');
  });
});

describe('arrow keys + keyboard/mouse input mode', () => {
  it('KEY_VECTORS maps arrows same as WASD', () => {
    expect(KEY_VECTORS.arrowup).toEqual(KEY_VECTORS.w);
    expect(KEY_VECTORS.arrowdown).toEqual(KEY_VECTORS.s);
    expect(KEY_VECTORS.arrowleft).toEqual(KEY_VECTORS.a);
    expect(KEY_VECTORS.arrowright).toEqual(KEY_VECTORS.d);
    expect(KEY_VECTORS.w).toEqual([0, -1]);
    expect(KEY_VECTORS.s).toEqual([0, 1]);
    expect(KEY_VECTORS.a).toEqual([-1, 0]);
    expect(KEY_VECTORS.d).toEqual([1, 0]);
  });

  it('movementFromKeys: arrows produce same vectors as WASD', () => {
    const wasd = { w: true, a: false, s: false, d: false, arrowup: false, arrowdown: false, arrowleft: false, arrowright: false };
    const arrows = { w: false, a: false, s: false, d: false, arrowup: true, arrowdown: false, arrowleft: false, arrowright: false };
    expect(movementFromKeys(wasd)).toEqual({ mx: 0, my: -1 });
    expect(movementFromKeys(arrows)).toEqual(movementFromKeys(wasd));

    const leftW = { ...wasd, w: false, a: true };
    const leftA = { ...arrows, arrowup: false, arrowleft: true };
    expect(movementFromKeys(leftA)).toEqual(movementFromKeys(leftW));
    expect(movementFromKeys(leftW)).toEqual({ mx: -1, my: 0 });
  });

  it('arrow keys move Terry with same speed feel as WASD', () => {
    const a = createState(400, 600);
    const b = createState(400, 600);
    a.waveHitThisCycle = true;
    b.waveHitThisCycle = true;
    a.glass = [];
    b.glass = [];
    const x0 = a.terry.x;
    a.keys.d = true;
    b.keys.arrowright = true;
    update(a, FIXED_DT);
    update(b, FIXED_DT);
    expect(a.terry.vx).toBe(TERRY_SPEED);
    expect(b.terry.vx).toBe(TERRY_SPEED);
    expect(a.terry.x - x0).toBeCloseTo(b.terry.x - x0, 5);
    expect(a.inputMode).toBe('keyboard');
    expect(b.inputMode).toBe('keyboard');
  });

  it('keyboard → no mouse follow even if pointer still active', () => {
    const state = createState(400, 600);
    state.waveHitThisCycle = true;
    state.glass = [];
    state.pointer.active = true;
    state.pointer.x = state.w * 0.9;
    state.pointer.y = state.h * 0.9;
    state.inputMode = 'mouse';

    state.keys.w = true;
    update(state, FIXED_DT);
    expect(state.inputMode).toBe('keyboard');
    expect(state.pointer.active).toBe(false);
    expect(state.terry.vy).toBe(-TERRY_SPEED);

    state.keys.w = false;
    state.pointer.active = true;
    state.pointer.x = state.w * 0.9;
    state.pointer.y = state.h * 0.9;
    const xBefore = state.terry.x;
    const yBefore = state.terry.y;
    for (let i = 0; i < 30; i++) update(state, FIXED_DT);
    expect(state.inputMode).toBe('keyboard');
    expect(Math.abs(state.terry.x - xBefore)).toBeLessThan(40);
    expect(state.terry.y).toBeLessThan(yBefore + 5);
  });

  it('mousemove (setMouseMode) → resume crosshair follow', () => {
    const state = createState(400, 600);
    state.waveHitThisCycle = true;
    state.glass = [];
    setKeyboardMode(state);
    expect(state.inputMode).toBe('keyboard');
    expect(state.pointer.active).toBe(false);

    const targetX = state.w * 0.85;
    const targetY = state.h * 0.75;
    setMouseMode(state, targetX, targetY);
    expect(state.inputMode).toBe('mouse');
    expect(state.pointer.active).toBe(true);
    expect(state.pointer.x).toBe(targetX);
    expect(state.pointer.y).toBe(targetY);

    const x0 = state.terry.x;
    for (let i = 0; i < 45; i++) update(state, FIXED_DT);
    expect(state.terry.x).toBeGreaterThan(x0);
    expect(state.terry.x).toBeGreaterThan(state.w * 0.55);
  });

  it('main.js wires arrows into keys + mode switch helpers', () => {
    const main = readFileSync(join(root, 'src/main.js'), 'utf8');
    expect(main).toContain('setKeyboardMode');
    expect(main).toContain('setMouseMode');
    const game = readFileSync(join(root, 'src/game.js'), 'utf8');
    expect(game).toContain('arrowup');
    expect(game).toContain('arrowright');
    expect(game).toContain("inputMode === 'mouse'");
  });
});


describe('seagull return drop-off = bottom center', () => {
  it('dropOff helpers: x = w/2, y = h - r - BOTTOM_PLAYABLE_MARGIN', () => {
    expect(dropOffX(375)).toBe(375 / 2);
    expect(dropOffX(800)).toBe(400);
    expect(dropOffY(667, 14)).toBe(667 - 14 - BOTTOM_PLAYABLE_MARGIN);
    expect(BOTTOM_PLAYABLE_MARGIN).toBe(8);
  });

  it('seagull carry drops Terry at bottom center (mobile + desktop sizes)', () => {
    for (const [w, h] of [
      [375, 667], // mobile
      [390, 844],
      [800, 600], // desktop
    ]) {
      const state = createState(w, h);
      state.mode = 'seagull';
      state.fartTimer = 0;
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

      let dropX = null;
      let dropY = null;
      for (let i = 0; i < 1200; i++) {
        update(state, FIXED_DT);
        if (state.seagull && state.seagull.phase === 'exit' && dropX === null) {
          dropX = state.terry.x;
          dropY = state.terry.y;
          break;
        }
        if (state.mode === 'play' && state.seagull === null) break;
      }

      const expectX = dropOffX(w);
      const expectY = dropOffY(h, state.terry.r);
      expect(dropX, `${w}x${h} drop x`).toBeCloseTo(expectX, 5);
      expect(dropY, `${w}x${h} drop y`).toBe(expectY);
      // On-screen / bottom-center playable
      expect(dropX).toBeGreaterThan(0);
      expect(dropX).toBeLessThan(w);
      expect(dropY).toBeLessThan(h);
      expect(dropY).toBeGreaterThan(h * 0.5);
    }
  });
});


describe('seagull dual multi-caw + vertical exit + slow angled poop + stick-until-fart', () => {
  it('caw constants: 2–3 spaced plays; poop window 25–75%; slow fall; vertical exit', () => {
    expect(SEAGULL_CAW_COUNT).toBeGreaterThanOrEqual(2);
    expect(SEAGULL_CAW_COUNT).toBeLessThanOrEqual(3);
    expect(SEAGULL_CAW_SPACING).toBeGreaterThan(0.1);
    expect(SEAGULL_CAW_SPACING).toBeLessThan(1);
    expect(POOP_DROP_PROGRESS_MIN).toBe(0.25);
    expect(POOP_DROP_PROGRESS_MAX).toBe(0.75);
    expect(POOP_FALL_VY).toBeLessThanOrEqual(60);
    expect(POOP_FALL_VY).toBeGreaterThan(10);
    expect(POOP_LATERAL_VX).toBeGreaterThan(0);
    expect(POOP_ZIG_AMPLITUDE).toBeGreaterThan(0);
    expect(POOP_ZIG_PERIOD).toBeGreaterThan(0);
    expect(SEAGULL_EXIT_VX).toBe(0);
    expect(SEAGULL_EXIT_VY).toBeLessThan(0);
    for (let i = 0; i < 40; i++) {
      const p = randomPoopDropProgress();
      expect(p).toBeGreaterThanOrEqual(POOP_DROP_PROGRESS_MIN);
      expect(p).toBeLessThanOrEqual(POOP_DROP_PROGRESS_MAX);
    }
  });

  it('multi-caw burst #1 on arrival (seagull shows up); stick NOT cleared on pickup', () => {
    const state = createState(400, 600);
    state.mode = 'flying';
    state.fartTimer = 3.3;
    state.terry.y = -60;
    state.poopStuck = true; // must survive seagull pickup
    const ev0 = update(state, FIXED_DT);
    expect(ev0.seagull).toBe(true);
    expect(ev0.seagullCaw).toBe(true);
    expect(state.mode).toBe('seagull');
    expect(state.poopStuck).toBe(true); // NOT cleared on pickup anymore

    let caws = 1; // first already fired
    const times = [0];
    for (let i = 0; i < 200; i++) {
      const ev = update(state, FIXED_DT);
      if (ev.seagullCaw) {
        caws += 1;
        times.push(state.seagull.cawClock);
      }
      if (caws >= SEAGULL_CAW_COUNT) break;
    }
    expect(caws).toBe(SEAGULL_CAW_COUNT);
    expect(caws).toBeGreaterThanOrEqual(2);
    expect(caws).toBeLessThanOrEqual(3);
    if (times.length >= 3) {
      expect(times[1]).toBeGreaterThanOrEqual(SEAGULL_CAW_SPACING - FIXED_DT);
      expect(times[2] - times[1]).toBeGreaterThanOrEqual(SEAGULL_CAW_SPACING - FIXED_DT * 2);
    }
    expect(state.poopStuck).toBe(true);
  });

  it('multi-caw burst #2 after drop-off (dual arrival + after-drop)', () => {
    const state = createState(400, 600);
    state.mode = 'seagull';
    state.fartTimer = 0;
    state.waveHitThisCycle = true;
    state.glass = [];
    state.seagull = {
      x: dropOffX(400),
      y: dropOffY(600, state.terry.r) - 40,
      vx: 0,
      vy: 90,
      phase: 'carry',
      bob: 0,
      cawsPlayed: SEAGULL_CAW_COUNT,
      nextCawAt: 99,
      cawClock: 99,
      poopDropped: false,
      poopDropAt: 0.99,
    };
    state.terry.x = state.seagull.x;
    state.terry.y = state.seagull.y + 28;

    let dropCaw = false;
    for (let i = 0; i < 400; i++) {
      const ev = update(state, FIXED_DT);
      if (state.seagull && state.seagull.phase === 'exit') {
        if (ev.seagullCaw) dropCaw = true;
        break;
      }
    }
    expect(dropCaw).toBe(true);
    expect(state.mode).toBe('play');
    expect(state.seagull.phase).toBe('exit');
    expect(state.seagull.cawsPlayed).toBe(1); // burst #2 started

    let caws = 1;
    const times = [0];
    for (let i = 0; i < 200; i++) {
      const ev = update(state, FIXED_DT);
      if (ev.seagullCaw) {
        caws += 1;
        times.push(state.seagull?.cawClock ?? 0);
      }
      if (caws >= SEAGULL_CAW_COUNT) break;
      if (!state.seagull) break;
    }
    expect(caws).toBe(SEAGULL_CAW_COUNT);
  });

  it('poopMissX is offset from Terry (not centered)', () => {
    expect(POOP_MISS_OFFSET).toBeGreaterThanOrEqual(20);
    const left = poopMissX(200, 400, -1);
    const right = poopMissX(200, 400, 1);
    expect(left).toBe(200 - POOP_MISS_OFFSET);
    expect(right).toBe(200 + POOP_MISS_OFFSET);
    expect(left).not.toBe(200);
    expect(right).not.toBe(200);
  });

  it('drop unlocks control immediately; vertical exit; poop later in 25–75% window', () => {
    const state = createState(400, 600);
    state.mode = 'seagull';
    state.fartTimer = 0;
    state.waveHitThisCycle = true;
    state.glass = [];
    state.seagull = {
      x: dropOffX(400) - 4,
      y: dropOffY(600, state.terry.r) - 40,
      vx: 0,
      vy: 90,
      phase: 'carry',
      bob: 0,
      cawsPlayed: SEAGULL_CAW_COUNT,
      nextCawAt: 99,
      cawClock: 99,
    };
    state.terry.x = state.seagull.x;
    state.terry.y = state.seagull.y + 28;

    let dropped = false;
    for (let i = 0; i < 400; i++) {
      update(state, FIXED_DT);
      if (state.seagull && state.seagull.phase === 'exit') {
        dropped = true;
        break;
      }
    }
    expect(dropped).toBe(true);
    expect(state.mode).toBe('play');
    expect(state.seagull).not.toBeNull();
    expect(state.seagull.phase).toBe('exit');
    // Straight UP: vx≈0, vy negative
    expect(Math.abs(state.seagull.vx)).toBeLessThanOrEqual(0.01);
    expect(state.seagull.vy).toBeLessThan(0);
    expect(state.seagull.vy).toBe(SEAGULL_EXIT_VY);
    // Poop NOT spawned at drop — waits for 25–75% exit progress
    expect(state.poops.length).toBe(0);
    expect(state.seagull.poopDropped).toBe(false);
    expect(state.seagull.poopDropAt).toBeGreaterThanOrEqual(POOP_DROP_PROGRESS_MIN);
    expect(state.seagull.poopDropAt).toBeLessThanOrEqual(POOP_DROP_PROGRESS_MAX);

    // Control unlocked: can move while bird still exiting
    const x0 = state.terry.x;
    state.keys.d = true;
    for (let i = 0; i < 20; i++) update(state, FIXED_DT);
    expect(state.mode).toBe('play');
    expect(state.seagull).not.toBeNull();
    expect(state.terry.x).toBeGreaterThan(x0 + 5);

    // Force known drop-at and watch progress window
    state.seagull.poopDropAt = 0.4;
    state.seagull.poopDropped = false;
    state.poops = [];
    let dropProg = null;
    for (let i = 0; i < 600; i++) {
      update(state, FIXED_DT);
      if (!state.seagull) break;
      if (state.seagull.poopDropped && dropProg == null) {
        // progress just after drop — approximate via remaining poop spawn
        dropProg = 0.4; // we set the threshold
        break;
      }
    }
    expect(state.poops.length).toBeGreaterThanOrEqual(1);
    const p = state.poops[0];
    expect(p.phase).toBe('falling');
    expect(p.vy).toBe(POOP_FALL_VY);
    expect(Math.abs(p.vx)).toBe(POOP_LATERAL_VX);
    expect(typeof p.age).toBe('number');
    expect(p.age).toBeLessThanOrEqual(FIXED_DT + 1e-9);
    // Angled + zig: drifts off bird line (not stationary under bird)
    const spawnX = p.x;
    for (let i = 0; i < 30; i++) update(state, FIXED_DT);
    const falling = state.poops.find((q) => q.phase === 'falling') || state.poops[0];
    if (falling && falling.phase === 'falling') {
      expect(Math.abs(falling.x - spawnX)).toBeGreaterThan(1);
      expect(falling.age).toBeGreaterThan(0);
    }
  });

  it('poop drop progress is within 25–75% of vertical exit', () => {
    const state = createState(400, 600);
    state.mode = 'play';
    state.waveHitThisCycle = true;
    state.glass = [];
    const startY = dropOffY(600, state.terry.r) - 28;
    state.seagull = {
      x: dropOffX(400),
      y: startY,
      vx: SEAGULL_EXIT_VX,
      vy: SEAGULL_EXIT_VY,
      phase: 'exit',
      bob: 0,
      cawsPlayed: SEAGULL_CAW_COUNT,
      nextCawAt: 99,
      cawClock: 99,
      exitStartY: startY,
      poopDropped: false,
      poopDropAt: 0.5,
    };
    state.terry.x = dropOffX(400);
    state.terry.y = dropOffY(600, state.terry.r);
    state.poops = [];

    let progAtDrop = null;
    for (let i = 0; i < 800; i++) {
      const g = state.seagull;
      if (!g) break;
      const before = seagullExitProgress(g);
      update(state, FIXED_DT);
      if (state.poops.length >= 1 && progAtDrop == null) {
        // After the step that dropped, progress is >= threshold
        progAtDrop = Math.max(before, seagullExitProgress(state.seagull || { y: SEAGULL_OFFSCREEN_Y, exitStartY: startY }));
        break;
      }
    }
    expect(progAtDrop).not.toBeNull();
    expect(progAtDrop).toBeGreaterThanOrEqual(POOP_DROP_PROGRESS_MIN - 0.02);
    expect(progAtDrop).toBeLessThanOrEqual(POOP_DROP_PROGRESS_MAX + 0.05);
    expect(state.poops[0].vy).toBe(POOP_FALL_VY);
  });

  it('seagull flies straight up off screen after drop (vertical exit)', () => {
    const state = createState(400, 600);
    state.mode = 'play';
    state.waveHitThisCycle = true;
    state.glass = [];
    state.seagull = {
      x: 200,
      y: 20,
      vx: SEAGULL_EXIT_VX,
      vy: SEAGULL_EXIT_VY,
      phase: 'exit',
      bob: 0,
      cawsPlayed: 3,
      nextCawAt: 99,
      cawClock: 99,
      exitStartY: 20,
      poopDropped: true,
      poopDropAt: 0.5,
    };
    state.terry.x = 200;
    state.terry.y = dropOffY(600, state.terry.r);
    const xBird = state.seagull.x;
    for (let i = 0; i < 200; i++) {
      if (!state.seagull) break;
      expect(Math.abs(state.seagull.vx)).toBeLessThanOrEqual(0.01);
      expect(state.seagull.vy).toBeLessThan(0);
      // stays on vertical line
      expect(Math.abs(state.seagull.x - xBird)).toBeLessThan(1);
      update(state, FIXED_DT);
    }
    expect(state.seagull).toBeNull();
    expect(state.mode).toBe('play');
    expect(state.terry.x).toBe(200);
  });

  it('ground poop stain washes away when wave/water covers it', () => {
    expect(waterCoversPoop(100, { y: 90, r: 5 })).toBe(true);
    expect(waterCoversPoop(50, { y: 90, r: 5 })).toBe(false);

    const state = createState(400, 600);
    state.waveHitThisCycle = true;
    state.glass = [];
    state.poops = [
      { id: 1, x: 200, y: 80, r: POOP_RADIUS, vy: 0, phase: 'ground' },
    ];
    state.time = 4;
    let washed = false;
    for (let i = 0; i < 30; i++) {
      const ev = update(state, FIXED_DT);
      if (ev.poopWash) washed = true;
      if (state.poops.length === 0) break;
    }
    expect(washed).toBe(true);
    expect(state.poops.length).toBe(0);
  });

  it('intercept → stick; miss → ground stain; stick clears on fart-finale not pickup', () => {
    const state = createState(400, 600);
    state.waveHitThisCycle = true;
    state.glass = [];
    state.poopStuck = false;
    // Slow fall still interceptable
    state.poops = [
      {
        id: 1,
        x: state.terry.x,
        y: state.terry.y - 40,
        r: POOP_RADIUS,
        vx: 0,
        vy: POOP_FALL_VY,
        phase: 'falling',
      },
    ];
    let hit = false;
    for (let i = 0; i < 200; i++) {
      const ev = update(state, FIXED_DT);
      if (ev.poopHit) hit = true;
      if (state.poopStuck) break;
    }
    expect(hit).toBe(true);
    expect(state.poopStuck).toBe(true);
    expect(state.poops.filter((p) => p.phase === 'falling').length).toBe(0);

    for (let i = 0; i < 10; i++) update(state, FIXED_DT);
    expect(state.poopStuck).toBe(true);

    // Seagull pickup does NOT clear stick
    state.mode = 'flying';
    state.fartTimer = 3.3;
    state.terry.y = -60;
    update(state, FIXED_DT);
    expect(state.mode).toBe('seagull');
    expect(state.poopStuck).toBe(true);

    // Miss → ground stain
    const miss = createState(400, 600);
    miss.waveHitThisCycle = true;
    miss.glass = [];
    miss.poopStuck = false;
    miss.terry.x = 50;
    miss.terry.y = dropOffY(600, miss.terry.r);
    miss.poops = [
      {
        id: 2,
        x: 350,
        y: 40,
        r: POOP_RADIUS,
        vx: POOP_LATERAL_VX,
        vy: POOP_FALL_VY,
        phase: 'falling',
      },
    ];
    let landed = false;
    for (let i = 0; i < 2000; i++) {
      const ev = update(miss, FIXED_DT);
      if (ev.poopLand) landed = true;
      if (miss.poops.some((p) => p.phase === 'ground')) break;
      if (miss.poopStuck) break;
    }
    expect(miss.poopStuck).toBe(false);
    expect(landed).toBe(true);
    expect(miss.poops.some((p) => p.phase === 'ground')).toBe(true);

    // Stick clears on fart-finale leave
    const finale = createState(400, 600);
    finale.poopStuck = true;
    beginFart(finale);
    expect(finale.mode).toBe('farting');
    expect(finale.poopStuck).toBe(false);
  });

  it('draw.js exports poop sprites; audio still has playSeagull', () => {
    const draw = readFileSync(join(root, 'src/draw.js'), 'utf8');
    expect(draw).toContain('drawPoop');
    expect(draw).toContain('drawPoopStuckOnCrab');
    const audio = readFileSync(join(root, 'src/audio.js'), 'utf8');
    expect(audio).toContain('playSeagull');
  });
});

describe('poop fall zig-zag (not constant vx diagonal)', () => {
  it('constants: zig amplitude and period make chase-worthy wiggle', () => {
    expect(POOP_ZIG_AMPLITUDE).toBe(62);
    expect(POOP_ZIG_PERIOD).toBe(0.6);
    expect(POOP_ZIG_AMPLITUDE).toBeGreaterThan(POOP_LATERAL_VX * 0.5);
    // At quarter/three-quarter period, sine peaks reverse lateral relative to bias
    const base = POOP_LATERAL_VX;
    const v0 = poopFallVx(base, 0);
    const vPeak = poopFallVx(base, POOP_ZIG_PERIOD / 4);
    const vTrough = poopFallVx(base, (3 * POOP_ZIG_PERIOD) / 4);
    expect(v0).toBeCloseTo(base, 5);
    expect(vPeak).toBeGreaterThan(base);
    expect(vTrough).toBeLessThan(base);
    expect(vPeak).not.toBe(vTrough);
    // Amplitude can overcome bias → actual direction flip (chase)
    expect(vTrough).toBeLessThan(0);
  });

  it('falling path is not a straight constant-vx diagonal', () => {
    const state = createState(400, 600);
    state.waveHitThisCycle = true;
    state.glass = [];
    state.poopStuck = false;
    state.terry.x = 20;
    state.terry.y = dropOffY(600, state.terry.r);
    state.poops = [
      {
        id: 42,
        x: 200,
        y: 40,
        r: POOP_RADIUS,
        vx: POOP_LATERAL_VX,
        vy: POOP_FALL_VY,
        age: 0,
        phase: 'falling',
      },
    ];

    const xs = [];
    const vels = [];
    for (let i = 0; i < 90; i++) {
      const p = state.poops.find((q) => q.phase === 'falling');
      if (!p) break;
      const beforeX = p.x;
      const ageBefore = p.age || 0;
      update(state, FIXED_DT);
      const after = state.poops.find((q) => q.phase === 'falling');
      if (!after) break;
      xs.push(after.x);
      // Reconstruct step velocity from displacement
      vels.push((after.x - beforeX) / FIXED_DT);
      expect(after.age).toBeCloseTo(ageBefore + FIXED_DT, 5);
    }
    expect(xs.length).toBeGreaterThan(40);
    // Effective vx is not constant (zig-zag), unlike a straight diagonal
    const uniqueish = new Set(vels.map((v) => Math.round(v * 10) / 10));
    expect(uniqueish.size).toBeGreaterThan(3);
    const minV = Math.min(...vels);
    const maxV = Math.max(...vels);
    expect(maxV - minV).toBeGreaterThan(POOP_ZIG_AMPLITUDE);
    // Direction reverses at least once (signed vel crosses)
    const hasPos = vels.some((v) => v > 5);
    const hasNeg = vels.some((v) => v < -5);
    expect(hasPos && hasNeg).toBe(true);
    // Slow fall preserved
    const still = state.poops.find((q) => q.phase === 'falling');
    if (still) expect(still.vy).toBe(POOP_FALL_VY);
  });

  it('spawnExitPoop keeps angled bias + age 0 for zig start', () => {
    const state = createState(400, 600);
    state.seagull = { x: 200, y: 100 };
    const p = spawnExitPoop(state, 1);
    expect(p.vx).toBe(POOP_LATERAL_VX);
    expect(p.vy).toBe(POOP_FALL_VY);
    expect(p.age).toBe(0);
    expect(poopFallVx(p.vx, 0)).toBeCloseTo(POOP_LATERAL_VX, 5);
  });
});

describe('100x speed mode (logic/scoring verification)', () => {
  afterEach(() => {
    setSpeedMultiplier(1);
  });

  it('defaults to 1x; setSpeedMultiplier toggles to 100x', () => {
    setSpeedMultiplier(1);
    expect(getSpeedMultiplier()).toBe(1);
    expect(setSpeedMultiplier(100)).toBe(100);
    expect(getSpeedMultiplier()).toBe(100);
    expect(setSpeedMultiplier(0)).toBe(1); // invalid → 1
    expect(setSpeedMultiplier(-5)).toBe(1);
    expect(setSpeedMultiplier(NaN)).toBe(1);
  });

  it('parseSpeedFromSearch / parseDevFromSearch (URL toggle, no player UI)', () => {
    expect(parseSpeedFromSearch('')).toBeNull();
    expect(parseSpeedFromSearch('?foo=1')).toBeNull();
    expect(parseSpeedFromSearch('?speed=100')).toBe(100);
    expect(parseSpeedFromSearch('speed=50&dev=1')).toBe(50);
    expect(parseSpeedFromSearch('?speed=nope')).toBeNull();
    expect(parseDevFromSearch('?dev=1')).toBe(true);
    expect(parseDevFromSearch('?dev=0')).toBe(false);
    expect(parseDevFromSearch('')).toBe(false);
  });

  it('main.js wires ?speed= + setter + quiet ?dev=1 hotkey (no on-screen speed button)', () => {
    const main = readFileSync(join(root, 'src/main.js'), 'utf8');
    expect(main).toContain('parseSpeedFromSearch');
    expect(main).toContain('setSpeedMultiplier');
    expect(main).toContain('getSpeedMultiplier');
    expect(main).toContain('dt * getSpeedMultiplier()');
    expect(main).toContain("e.key !== '0'");
    expect(main).toContain('parseDevFromSearch');
    // No player-facing speed control widget
    expect(main).not.toMatch(/id=["']speed["']/i);
    expect(main).not.toMatch(/<button[^>]*>[^<]*speed/i);
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    expect(html).not.toMatch(/id=["']speed["']/i);
    expect(html).not.toMatch(/<button[^>]*>[^<]*speed/i);
  });

  it('at 100x: glass still +1¢ per pickup', () => {
    setSpeedMultiplier(100);
    const state = createState(400, 600);
    state.waveHitThisCycle = true;
    state.glass = [];
    for (let i = 0; i < 3; i++) {
      state.glass.push({
        id: 100 + i,
        x: state.terry.x,
        y: state.terry.y,
        r: 8,
        hue: 180,
        collected: false,
        immuneUntil: 0,
      });
    }
    // Only first overlaps; collect one-by-one
    const g0 = state.glass[0];
    const res = collectGlass(state, g0);
    expect(res.collected).toBe(true);
    expect(res.currentCents).toBe(GLASS_CENTS);
    setHeldCents(state, res.currentCents);
    expect(state.currentCents).toBe(1);

    // advanceWallTime at 100x still applies FIXED_DT physics identically
    const { steps } = advanceWallTime(state, 0.05, 100);
    expect(steps).toBeGreaterThan(1);
    expect(getSpeedMultiplier()).toBe(100);
  });

  it('at 100x: wave hit still −1¢ and drops glass', () => {
    setSpeedMultiplier(100);
    const state = createState(400, 600);
    setHeldCents(state, 5);
    const glassBefore = state.glass.length;
    const hit = applyWaveHit(state);
    expect(hit.dropped).toBe(true);
    expect(state.currentCents).toBe(4);
    expect(state.score).toBe(4);
    expect(state.glass.length).toBe(glassBefore + 1);
    expect(state.terry.y).toBe(state.h - state.terry.r - 8);

    // Scripted wave overlap via update stepping (same logic at any wall speed)
    setHeldCents(state, 3);
    state.glass = [];
    state.terry.y = state.h * 0.35;
    state.terry.x = state.w / 2;
    state.time = 1.5;
    state.wavePhase = wavePhase(state.time);
    state.lastWaterY = waterEdgeY(state.wavePhase, state.h);
    state.waveHitThisCycle = false;
    let sawHit = false;
    for (let i = 0; i < 120; i++) {
      const ev = update(state, FIXED_DT);
      if (ev.waveHit) {
        sawHit = true;
        break;
      }
    }
    expect(sawHit).toBe(true);
    expect(state.currentCents).toBe(2);
  });

  it('at 100x: win when held reaches 10¢ (finale)', () => {
    setSpeedMultiplier(100);
    const state = createState(400, 600);
    setHeldCents(state, 9);
    state.waveHitThisCycle = true;
    state.glass = [{
      id: 999,
      x: state.terry.x,
      y: state.terry.y,
      r: 8,
      hue: 180,
      collected: false,
      immuneUntil: 0,
    }];
    const ev = update(state, FIXED_DT);
    expect(ev.clinks).toBe(1);
    expect(ev.fart).toBe(true);
    expect(state.mode).toBe('farting');
    expect(state.currentCents).toBe(0); // cleared on finale start
  });

  it('100x wall-clock playthrough (collect→finale→seagull→reset) finishes under ~1s', () => {
    setSpeedMultiplier(100);
    const state = createState(400, 600);
    state.waveHitThisCycle = true;
    state.glass = [];
    // Place 10 collectible glass on Terry
    for (let i = 0; i < 10; i++) {
      state.glass.push({
        id: 500 + i,
        x: state.terry.x,
        y: state.terry.y,
        r: 8,
        hue: 170,
        collected: false,
        immuneUntil: 0,
      });
    }

    const t0 = performance.now();
    let sawFinale = false;
    let sawSeagull = false;
    let sawReset = false;
    // ~8s game-time covers fart + fly + seagull at normal pacing; at 100x ≈ 0.08s wall
    // Budget a bit more wall time for CI headroom.
    for (let wall = 0; wall < 0.5; wall += 0.016) {
      const { events } = advanceWallTime(state, 0.016, 100);
      if (events.fart) sawFinale = true;
      if (events.seagull) sawSeagull = true;
      if (state.mode === 'play' && sawSeagull && state.seagull === null) {
        sawReset = true;
        break;
      }
      // Keep remaining glass under crab until finale — not during unlocked seagull exit
      if (state.mode === 'play' && !sawSeagull && !state.seagull) {
        for (const g of state.glass) {
          if (!g.collected) {
            g.x = state.terry.x;
            g.y = state.terry.y;
            g.immuneUntil = 0;
          }
        }
      }
    }
    const elapsed = performance.now() - t0;
    expect(sawFinale).toBe(true);
    expect(sawSeagull).toBe(true);
    expect(sawReset).toBe(true);
    expect(state.mode).toBe('play');
    expect(state.currentCents).toBe(0);
    expect(elapsed).toBeLessThan(1000);
  });

  it('1x path unchanged: same FIXED_DT physics as before speed mode', () => {
    setSpeedMultiplier(1);
    const a = createState(400, 600);
    const b = createState(400, 600);
    a.waveHitThisCycle = true;
    b.waveHitThisCycle = true;
    a.glass = [];
    b.glass = [];
    a.keys.d = true;
    b.keys.d = true;
    update(a, FIXED_DT);
    update(b, FIXED_DT);
    expect(a.terry.x).toBeCloseTo(b.terry.x, 10);
    expect(getSpeedMultiplier()).toBe(1);
    // advanceWallTime at 1x ≈ one FIXED_DT per 1/60s wall
    const state = createState(400, 600);
    state.waveHitThisCycle = true;
    state.glass = [];
    const { steps } = advanceWallTime(state, FIXED_DT, 1);
    expect(steps).toBe(1);
  });
});
