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
  activeGlass,
  beginFart,
  waterEdgeY,
  wavePhase,
  WAVE_MAX_DEPTH,
  WAVE_MIN_DEPTH,
  waveOverlapsCrab,
  applyWaveHit,
  afterFinaleReset,
} from '../src/game.js';

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

  it('audio unlock helper present for autoplay policy', () => {
    const audio = readFileSync(join(root, 'src/audio.js'), 'utf8');
    expect(audio).toContain('unlockAudio');
    expect(audio).toContain('CLINKS');
    expect(audio).toContain('playWaveWhoosh');
    expect(audio).toContain('playFart');
    const main = readFileSync(join(root, 'src/main.js'), 'utf8');
    expect(main).toContain('unlockAudio');
  });
});

describe('score / glass collect', () => {
  it('glass is 1 cent; finale at 25 cents', () => {
    expect(GLASS_CENTS).toBe(1);
    expect(FINALE_CENTS).toBe(25);
    expect(formatCents(7)).toBe('7¢');
  });

  it('collectGlass increments by 1¢ and lifetime', () => {
    const state = createState(400, 600);
    const g = state.glass[0];
    const res = collectGlass(state, g);
    expect(res.collected).toBe(true);
    expect(res.score).toBe(1);
    expect(res.lifetimeCollected).toBe(1);
    expect(g.collected).toBe(true);
  });

  it('overlap collect via update raises score + lifetime', () => {
    const state = createState(400, 600);
    const g = activeGlass(state)[0];
    state.glass = [g];
    state.terry.x = g.x;
    state.terry.y = g.y;
    // Keep wave out of the way so collect isn't interrupted
    state.time = 0;
    state.wavePhase = 0;
    state.lastWaterY = waterEdgeY(0, state.h);
    state.waveHitThisCycle = true;
    const before = state.score;
    const lifeBefore = state.lifetimeCollected;
    const ev = update(state, FIXED_DT);
    expect(ev.clinks).toBe(1);
    expect(state.score).toBe(before + GLASS_CENTS);
    expect(state.lifetimeCollected).toBe(lifeBefore + GLASS_CENTS);
  });

  it('finale triggers at lifetime 25¢ (not merely HUD score)', () => {
    const state = createState(400, 600);
    state.score = 10; // HUD lower because of prior wave drops
    state.lifetimeCollected = 24;
    const g = { id: 99, x: state.terry.x, y: state.terry.y, r: 8, hue: 180, collected: false };
    state.glass.push(g);
    const res = collectGlass(state, g);
    expect(res.finale).toBe(true);
    expect(res.score).toBe(11);
    expect(res.lifetimeCollected).toBe(25);
    state.score = res.score;
    state.lifetimeCollected = res.lifetimeCollected;
    beginFart(state);
    expect(state.mode).toBe('farting');
    expect(state.lifetimeCollected).toBe(0); // reset so next 25 can loop
    expect(state.fartClouds.length).toBeGreaterThan(0);
  });

  it('afterFinaleReset clears HUD score but lifetime already 0', () => {
    const state = createState(400, 600);
    state.score = 25;
    state.lifetimeCollected = 0;
    beginFart(state);
    afterFinaleReset(state);
    expect(state.score).toBe(0);
    expect(state.lifetimeCollected).toBe(0);
    expect(state.mode).toBe('play');
  });

  it('overlaps helper works', () => {
    expect(overlaps(0, 0, 10, 5, 0, 10)).toBe(true);
    expect(overlaps(0, 0, 5, 100, 100, 5)).toBe(false);
  });
});

describe('deep waves + wave hit drop', () => {
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
    expect(waveOverlapsCrab(290, terry)).toBe(true); // water past crab top
    expect(waveOverlapsCrab(100, terry)).toBe(false);
  });

  it('wave hit bounces crab down and drops 1¢ glass when score > 0', () => {
    const state = createState(400, 600);
    state.score = 5;
    state.lifetimeCollected = 8;
    const yBefore = state.terry.y;
    const glassBefore = state.glass.length;
    const hit = applyWaveHit(state);
    expect(hit.dropped).toBe(true);
    expect(state.score).toBe(4);
    expect(state.lifetimeCollected).toBe(8); // lifetime untouched
    expect(state.terry.y).toBeGreaterThan(yBefore);
    expect(state.glass.length).toBe(glassBefore + 1);
    const dropped = state.glass[state.glass.length - 1];
    expect(dropped.collected).toBe(false);
  });

  it('wave hit with score 0 still bounces but does not go negative', () => {
    const state = createState(400, 600);
    state.score = 0;
    const yBefore = state.terry.y;
    const glassBefore = state.glass.length;
    const hit = applyWaveHit(state);
    expect(hit.dropped).toBe(false);
    expect(state.score).toBe(0);
    expect(state.terry.y).toBeGreaterThanOrEqual(yBefore);
    expect(state.glass.length).toBe(glassBefore);
  });

  it('update fires one waveHit per advancing cycle when overlapped', () => {
    const state = createState(400, 600);
    state.score = 3;
    state.terry.y = state.h * 0.4; // mid-beach where deep wave will reach
    state.terry.x = state.w / 2;
    state.glass = []; // no pickup noise
    state.time = 1.5; // toward advancing tide
    state.wavePhase = wavePhase(state.time);
    state.lastWaterY = waterEdgeY(state.wavePhase, state.h);
    state.waveHitThisCycle = false;

    let hits = 0;
    let minScore = state.score;
    for (let i = 0; i < 240; i++) {
      const ev = update(state, FIXED_DT);
      if (ev.waveHit) hits += 1;
      minScore = Math.min(minScore, state.score);
      // Keep dropped glass from being instantly re-collected (isolate hit assert)
      for (const g of state.glass) {
        if (!g.collected) {
          g.x = 10;
          g.y = state.h - 10;
        }
      }
    }
    expect(hits).toBeGreaterThanOrEqual(1);
    expect(hits).toBeLessThanOrEqual(2); // at most one per cycle across ~4s
    expect(minScore).toBeLessThan(3);
    expect(state.score).toBeGreaterThanOrEqual(0);
  });
});
