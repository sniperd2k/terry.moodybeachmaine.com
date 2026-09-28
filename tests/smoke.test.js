import { describe, it, expect } from 'vitest';
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
    const bottom = state.h - state.terry.r - 8;
    expect(state.terry.y).toBe(bottom);
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

  it('main wires waveHit → playBoing and seagull → playSeagull', () => {
    const main = readFileSync(join(root, 'src/main.js'), 'utf8');
    expect(main).toMatch(/ev\.waveHit.*playBoing|if \(ev\.waveHit\) playBoing/);
    expect(main).toMatch(/ev\.seagull.*playSeagull|if \(ev\.seagull\) playSeagull/);
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
