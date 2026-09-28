import { test, expect } from '@playwright/test';

test('page loads with canvas, GA, score HUD path', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#beach')).toBeVisible();
  const hasGtag = await page.locator('script[src*="googletagmanager.com/gtag/js?id=G-CJP2HX87N2"]').count();
  expect(hasGtag).toBeGreaterThan(0);
  await page.waitForFunction(() => window.__TERRY__ && window.__TERRY__.getState());
  const score = await page.evaluate(() => window.__TERRY__.getScore());
  expect(typeof score).toBe('number');
  expect(score).toBeGreaterThanOrEqual(0);
  const cents = await page.evaluate(() => window.__TERRY__.getCurrentCents());
  expect(cents).toBe(score);
  const body = await page.content();
  expect(body).not.toContain('Canonicus');
  expect(body).not.toContain('VacationRental');
});

test('WASD / pointer moves Terry', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__TERRY__?.getState());
  const before = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    return { x: s.terry.x, y: s.terry.y };
  });
  await page.keyboard.down('d');
  await page.waitForTimeout(350);
  await page.keyboard.up('d');
  let after = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    return { x: s.terry.x, y: s.terry.y, mode: s.mode };
  });
  expect(after.mode).toBe('play');
  let moved = Math.hypot(after.x - before.x, after.y - before.y);
  if (moved <= 2) {
    await page.evaluate(() => {
      const s = window.__TERRY__.getState();
      s.pointer.active = true;
      s.pointer.x = s.w * 0.9;
      s.pointer.y = s.h * 0.7;
    });
    await page.waitForTimeout(400);
    after = await page.evaluate(() => {
      const s = window.__TERRY__.getState();
      return { x: s.terry.x, y: s.terry.y, mode: s.mode };
    });
    moved = Math.hypot(after.x - before.x, after.y - before.y);
  }
  expect(moved).toBeGreaterThan(2);
});

test('Chrome desktop: AudioContext resumes after user gesture then play', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__TERRY__?.unlockAudio);

  const hooks = await page.evaluate(() => window.__TERRY__.AUDIO_UNLOCK_EVENTS);
  expect(hooks).toEqual(
    expect.arrayContaining(['keydown', 'mousedown', 'pointerdown', 'click', 'touchstart']),
  );

  await page.locator('#beach').click({ position: { x: 80, y: 80 } });
  const afterClick = await page.evaluate(async () => {
    await window.__TERRY__.unlockAudio();
    await new Promise((r) => setTimeout(r, 80));
    return {
      state: window.__TERRY__.getAudioState(),
      unlocked: window.__TERRY__.isAudioUnlocked(),
    };
  });
  expect(afterClick.state).toBe('running');
  expect(afterClick.unlocked).toBe(true);

  await page.keyboard.down('w');
  await page.keyboard.up('w');
  const afterKey = await page.evaluate(async () => {
    await window.__TERRY__.unlockAudio();
    await new Promise((r) => setTimeout(r, 40));
    return window.__TERRY__.getAudioState();
  });
  expect(afterKey).toBe('running');

  await page.locator('#beach').dispatchEvent('mousedown');
  const afterMouse = await page.evaluate(async () => {
    await window.__TERRY__.unlockAudio();
    await new Promise((r) => setTimeout(r, 40));
    return window.__TERRY__.getAudioState();
  });
  expect(afterMouse).toBe('running');
});

test('held currentCents model + wave bottom bounce fields', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__TERRY__?.getState());
  const info = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    return {
      hasCurrentCents: typeof s.currentCents === 'number',
      hasLifetime: typeof s.lifetimeCollected === 'number',
      hasWaveHitFlag: typeof s.waveHitThisCycle === 'boolean',
      finale: window.__TERRY__.FINALE_CENTS,
      pushFrac: window.__TERRY__.WAVE_GLASS_PUSH_FRAC,
      terryYFrac: s.terry.y / s.h,
    };
  });
  expect(info.hasCurrentCents).toBe(true);
  expect(info.hasLifetime).toBe(false);
  expect(info.hasWaveHitFlag).toBe(true);
  expect(info.finale).toBe(10);
  expect(info.pushFrac).toBeCloseTo(0.2);
  expect(info.terryYFrac).toBeGreaterThan(0.5);
});

test('wave-hit: −1¢ score, drop glass, bounce to bottom', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__TERRY__?.getState());

  const box = await page.locator('#beach').boundingBox();
  expect(box).toBeTruthy();
  await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.7).catch(async () => {
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.7);
    await page.mouse.down();
  });

  const result = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    window.__TERRY__.setHeldCents(5);
    s.pointer.active = true;
    s.pointer.x = s.terry.x;
    s.pointer.y = s.terry.y;
    s.lastWaterY = Math.min(s.terry.y - 4, s.h * 0.55);
    const before = s.glass.length;
    const yBefore = s.terry.y;
    const hit = window.__TERRY__.applyWaveHit();
    const dropped = s.glass[s.glass.length - 1];
    return {
      dropped: hit?.dropped === true,
      glassDelta: s.glass.length - before,
      dropY: dropped.y,
      pointerActive: s.pointer.active,
      score: s.currentCents,
      bounceVy: s.terry.vy,
      terryY: s.terry.y,
      bottomY: s.h - s.terry.r - 8,
      yBefore,
    };
  });

  expect(result.dropped).toBe(true);
  expect(result.glassDelta).toBe(1);
  expect(result.pointerActive).toBe(false);
  expect(result.score).toBe(4);
  expect(result.bounceVy).toBeGreaterThanOrEqual(250);
  expect(result.terryY).toBe(result.bottomY);
  expect(result.terryY).toBeGreaterThan(result.yBefore);

  await page.mouse.up().catch(() => {});
});

test('9¢ wave hit → 8¢ no finale; 10¢ held triggers finale path', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__TERRY__?.getState());

  const nine = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    window.__TERRY__.setHeldCents(9);
    window.__TERRY__.applyWaveHit();
    return { cents: s.currentCents, mode: s.mode };
  });
  expect(nine.cents).toBe(8);
  expect(nine.mode).toBe('play');

  const ten = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    window.__TERRY__.setHeldCents(9);
    s.mode = 'play';
    s.glass = [];
    const g = { id: 999, x: s.terry.x, y: s.terry.y, r: 8, hue: 180, collected: false, immuneUntil: 0 };
    s.glass.push(g);
    s.waveHitThisCycle = true;
    // force one update tick via overlapping collect by simulating collect through state
    s.terry.x = g.x;
    s.terry.y = g.y;
    return { before: s.currentCents, glassId: g.id };
  });
  expect(ten.before).toBe(9);

  // Advance enough frames for collect+finale
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    // Manually drive collect if frame loop hasn't: ensure glass at crab
    const g = s.glass.find((x) => x.id === 999);
    if (g && !g.collected && s.mode === 'play') {
      g.x = s.terry.x;
      g.y = s.terry.y;
    }
    return { mode: s.mode, cents: s.currentCents };
  });
  // Wait for requestAnimationFrame loop to collect
  await page.waitForFunction(() => {
    const s = window.__TERRY__.getState();
    const g = s.glass.find((x) => x.id === 999);
    if (g && !g.collected && s.mode === 'play') {
      g.x = s.terry.x;
      g.y = s.terry.y;
      g.immuneUntil = 0;
    }
    return s.mode === 'farting' || s.mode === 'flying' || s.mode === 'seagull' || s.currentCents >= 10;
  }, { timeout: 3000 });
  const finale = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    return { mode: s.mode, cents: s.currentCents };
  });
  expect(['farting', 'flying', 'seagull']).toContain(finale.mode);
});

test('glass height variance across beach depths', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__TERRY__?.getState());
  const span = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    const ys = s.glass.filter((g) => !g.collected).map((g) => g.y);
    return { min: Math.min(...ys), max: Math.max(...ys), n: ys.length, h: s.h };
  });
  expect(span.n).toBeGreaterThan(0);
  expect(span.max - span.min).toBeGreaterThan(20);
});

test('arrow keys move Terry; keyboard then mouse mode switch', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__TERRY__?.getState());

  const before = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    return { x: s.terry.x, y: s.terry.y };
  });

  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(350);
  await page.keyboard.up('ArrowRight');

  const afterArrow = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    return { x: s.terry.x, y: s.terry.y, mode: s.mode, inputMode: s.inputMode, pointerActive: s.pointer.active };
  });
  expect(afterArrow.mode).toBe('play');
  expect(afterArrow.inputMode).toBe('keyboard');
  expect(afterArrow.pointerActive).toBe(false);
  expect(afterArrow.x - before.x).toBeGreaterThan(2);

  await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    s.pointer.active = true;
    s.pointer.x = 10;
    s.pointer.y = 10;
  });
  await page.waitForTimeout(200);
  const mid = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    return { x: s.terry.x, y: s.terry.y, inputMode: s.inputMode };
  });
  expect(mid.inputMode).toBe('keyboard');
  expect(Math.hypot(mid.x - afterArrow.x, mid.y - afterArrow.y)).toBeLessThan(30);

  const box = await page.locator('#beach').boundingBox();
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.7);
  await page.waitForTimeout(450);
  const afterMouse = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    return { x: s.terry.x, inputMode: s.inputMode, pointerActive: s.pointer.active };
  });
  expect(afterMouse.inputMode).toBe('mouse');
  expect(afterMouse.pointerActive).toBe(true);
  expect(afterMouse.x).toBeGreaterThan(mid.x);
});

test('100x speed mode: URL ?speed=100 + setter; scoring holds', async ({ page }) => {
  await page.goto('/?speed=100');
  await page.waitForFunction(() => window.__TERRY__?.getSpeedMultiplier);
  const boot = await page.evaluate(() => window.__TERRY__.getSpeedMultiplier());
  expect(boot).toBe(100);

  // Glass +1¢ still holds under 100x
  const glass = await page.evaluate(() => {
    window.__TERRY__.setSpeedMultiplier(100);
    const s = window.__TERRY__.getState();
    window.__TERRY__.setHeldCents(0);
    s.mode = 'play';
    s.waveHitThisCycle = true;
    s.glass = [{ id: 4242, x: s.terry.x, y: s.terry.y, r: 8, hue: 180, collected: false, immuneUntil: 0 }];
    return { before: s.currentCents };
  });
  expect(glass.before).toBe(0);
  await page.waitForFunction(() => {
    const s = window.__TERRY__.getState();
    const g = s.glass.find((x) => x.id === 4242);
    if (g && !g.collected && s.mode === 'play') {
      g.x = s.terry.x;
      g.y = s.terry.y;
      g.immuneUntil = 0;
    }
    return s.currentCents >= 1 || s.mode !== 'play';
  }, { timeout: 2000 });
  const afterGlass = await page.evaluate(() => window.__TERRY__.getCurrentCents());
  expect(afterGlass).toBeGreaterThanOrEqual(1);

  // Wave penalty −1¢ + drop
  const wave = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    window.__TERRY__.setHeldCents(5);
    const before = s.glass.length;
    const hit = window.__TERRY__.applyWaveHit();
    return {
      dropped: hit?.dropped === true,
      cents: s.currentCents,
      glassDelta: s.glass.length - before,
      speed: window.__TERRY__.getSpeedMultiplier(),
    };
  });
  expect(wave.speed).toBe(100);
  expect(wave.dropped).toBe(true);
  expect(wave.cents).toBe(4);
  expect(wave.glassDelta).toBe(1);

  // Win at held 10¢
  await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    window.__TERRY__.setHeldCents(9);
    s.mode = 'play';
    s.waveHitThisCycle = true;
    s.glass = [{ id: 7777, x: s.terry.x, y: s.terry.y, r: 8, hue: 180, collected: false, immuneUntil: 0 }];
  });
  await page.waitForFunction(() => {
    const s = window.__TERRY__.getState();
    const g = s.glass.find((x) => x.id === 7777);
    if (g && !g.collected && s.mode === 'play') {
      g.x = s.terry.x;
      g.y = s.terry.y;
      g.immuneUntil = 0;
    }
    return s.mode === 'farting' || s.mode === 'flying' || s.mode === 'seagull';
  }, { timeout: 2000 });
  const finale = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    return { mode: s.mode, speed: window.__TERRY__.getSpeedMultiplier() };
  });
  expect(['farting', 'flying', 'seagull']).toContain(finale.mode);
  expect(finale.speed).toBe(100);

  // Setter back to 1x (default OFF for normal play)
  const reset = await page.evaluate(() => {
    window.__TERRY__.setSpeedMultiplier(1);
    return window.__TERRY__.getSpeedMultiplier();
  });
  expect(reset).toBe(1);
});

test('default load is 1x (speed mode off)', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__TERRY__?.getSpeedMultiplier);
  const speed = await page.evaluate(() => window.__TERRY__.getSpeedMultiplier());
  expect(speed).toBe(1);
});

test('seagull drop-off lands Terry at bottom center', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?speed=100');
  await page.waitForFunction(() => window.__TERRY__?.getState);

  await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    window.__TERRY__.setSpeedMultiplier(100);
    s.mode = 'seagull';
    s.fartTimer = 0;
    s.fartClouds = [];
    s.seagull = {
      x: -40,
      y: 40,
      vx: 120,
      vy: 0,
      phase: 'enter',
      bob: 0,
    };
    s.terry.x = -60;
    s.terry.y = 70;
  });

  await page.waitForFunction(() => {
    const s = window.__TERRY__.getState();
    return s.seagull && s.seagull.phase === 'exit';
  }, { timeout: 5000 });

  const drop = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    const expectX = s.w / 2;
    const expectY = s.h - s.terry.r - 8;
    return {
      x: s.terry.x,
      y: s.terry.y,
      expectX,
      expectY,
      w: s.w,
      h: s.h,
      phase: s.seagull?.phase,
    };
  });

  expect(drop.phase).toBe('exit');
  expect(Math.abs(drop.x - drop.expectX)).toBeLessThan(1);
  expect(drop.y).toBe(drop.expectY);
  expect(drop.x).toBeGreaterThan(0);
  expect(drop.x).toBeLessThan(drop.w);
  expect(drop.y).toBeLessThan(drop.h);
  expect(drop.y).toBeGreaterThan(drop.h * 0.5);
});
