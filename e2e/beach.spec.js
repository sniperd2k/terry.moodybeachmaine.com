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


test('seagull dual multi-caw + vertical exit + slow angled poop + stick-until-fart', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 600 });
  await page.goto('/?speed=100');
  await page.waitForFunction(() => window.__TERRY__?.getState);

  // Arrival multi-caw; stick survives pickup
  await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    window.__TERRY__.setSpeedMultiplier(100);
    s.mode = 'flying';
    s.fartTimer = 3.3;
    s.terry.y = -60;
    s.poopStuck = true;
  });

  await page.waitForFunction(() => {
    const s = window.__TERRY__.getState();
    return s.mode === 'seagull' || (s.seagull && s.seagull.cawsPlayed >= 1);
  }, { timeout: 5000 });

  await page.waitForFunction(() => {
    const s = window.__TERRY__.getState();
    return s.seagull && s.seagull.cawsPlayed >= 2;
  }, { timeout: 5000 });

  const mid = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    return {
      caws: s.seagull?.cawsPlayed ?? 0,
      stuckStill: s.poopStuck === true,
      mode: s.mode,
    };
  });
  expect(mid.caws).toBeGreaterThanOrEqual(2);
  expect(mid.caws).toBeLessThanOrEqual(3);
  expect(mid.stuckStill).toBe(true); // NOT cleared on seagull pickup

  // Jump to near-drop carry; pre-set poopDropAt=0.75 so 100x doesn't spawn before we assert
  await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    const landX = s.w / 2;
    const landY = s.h - s.terry.r - 8;
    s.mode = 'seagull';
    s.seagull = {
      x: landX,
      y: landY - 40,
      vx: 0,
      vy: 90,
      phase: 'carry',
      bob: 0,
      cawsPlayed: 3,
      nextCawAt: 99,
      cawClock: 99,
      poopDropped: false,
      poopDropAt: 0.75, // max window — survives drop assign
    };
    s.terry.x = landX;
    s.terry.y = landY - 12;
    s.poops = [];
    window.__TERRY__.setSpeedMultiplier(10); // moderate so exit asserts are stable
  });

  await page.waitForFunction(() => {
    const s = window.__TERRY__.getState();
    return s.seagull && s.seagull.phase === 'exit' && s.mode === 'play';
  }, { timeout: 5000 });

  const drop = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    return {
      mode: s.mode,
      phase: s.seagull?.phase,
      terryX: s.terry.x,
      expectX: s.w / 2,
      vx: s.seagull?.vx,
      vy: s.seagull?.vy,
      poopDropped: s.seagull?.poopDropped,
      poopDropAt: s.seagull?.poopDropAt,
      poopCount: s.poops.length,
      cawsAfterDrop: s.seagull?.cawsPlayed,
    };
  });
  expect(drop.mode).toBe('play');
  expect(drop.phase).toBe('exit');
  expect(Math.abs(drop.terryX - drop.expectX)).toBeLessThan(1);
  // Vertical exit
  expect(Math.abs(drop.vx)).toBeLessThan(0.01);
  expect(drop.vy).toBeLessThan(0);
  // Poop deferred (pre-set 0.75 window)
  expect(drop.poopDropped).toBe(false);
  expect(drop.poopCount).toBe(0);
  expect(drop.poopDropAt).toBeGreaterThanOrEqual(0.25);
  expect(drop.poopDropAt).toBeLessThanOrEqual(0.75);
  // After-drop multi-caw burst started
  expect(drop.cawsAfterDrop).toBeGreaterThanOrEqual(1);
  expect(drop.cawsAfterDrop).toBeLessThanOrEqual(3);

  // Move while seagull still exiting
  const before = await page.evaluate(() => window.__TERRY__.getState().terry.x);
  await page.keyboard.down('d');
  await page.waitForTimeout(250);
  await page.keyboard.up('d');
  const afterMove = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    return { x: s.terry.x, seagull: !!s.seagull, mode: s.mode };
  });
  expect(afterMove.mode).toBe('play');
  expect(afterMove.x).toBeGreaterThan(before + 2);

  // Reinject controlled vertical exit at 1x to observe slow angled poop spawn
  await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    window.__TERRY__.setSpeedMultiplier(5);
    const startY = s.h - s.terry.r - 8 - 28;
    const total = startY - (-60);
    s.mode = 'play';
    s.seagull = {
      x: s.w / 2,
      y: startY - total * 0.29, // just under 0.3 threshold
      vx: 0,
      vy: -140,
      phase: 'exit',
      bob: 0,
      cawsPlayed: 3,
      nextCawAt: 99,
      cawClock: 99,
      exitStartY: startY,
      poopDropped: false,
      poopDropAt: 0.3,
    };
    s.poops = [];
    s.waveHitThisCycle = true;
    s.glass = [];
  });
  const poop = await page.waitForFunction(() => {
    const s = window.__TERRY__.getState();
    const p = s.poops.find((q) => q.phase === 'falling');
    if (!p) return null;
    return { vy: p.vy, vx: p.vx, phase: p.phase, dropped: s.seagull?.poopDropped === true };
  }, { timeout: 8000 }).then((h) => h.jsonValue());
  expect(poop.dropped).toBe(true);
  expect(poop.phase).toBe('falling');
  expect(poop.vy).toBeLessThanOrEqual(60);
  expect(Math.abs(poop.vx)).toBeGreaterThan(0);
  // Zig-zag: sample falling vx over time — not a constant diagonal
  await page.evaluate(() => window.__TERRY__.setSpeedMultiplier(1));
  const zig = await page.evaluate(async () => {
    const s = window.__TERRY__.getState();
    const p0 = s.poops.find((q) => q.phase === 'falling');
    if (!p0) return null;
    // Ensure age starts known; sample displacements over ~0.75s wall via harness steps
    const vels = [];
    let lastX = p0.x;
    for (let i = 0; i < 50; i++) {
      window.__TERRY__.advanceWallTime(1 / 60);
      const p = window.__TERRY__.getState().poops.find((q) => q.phase === 'falling');
      if (!p) break;
      vels.push((p.x - lastX) / (1 / 60));
      lastX = p.x;
    }
    const minV = Math.min(...vels);
    const maxV = Math.max(...vels);
    return {
      n: vels.length,
      spread: maxV - minV,
      hasPos: vels.some((v) => v > 5),
      hasNeg: vels.some((v) => v < -5),
      age: window.__TERRY__.getState().poops.find((q) => q.phase === 'falling')?.age ?? 0,
    };
  });
  expect(zig).not.toBeNull();
  expect(zig.n).toBeGreaterThan(20);
  expect(zig.spread).toBeGreaterThan(40);
  expect(zig.hasPos && zig.hasNeg).toBe(true);
  expect(zig.age).toBeGreaterThan(0.2);
  await page.evaluate(() => window.__TERRY__.setSpeedMultiplier(100));

  // Stick-on-hit
  await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    s.poopStuck = false;
    s.poops = [{
      id: 99,
      x: s.terry.x,
      y: s.terry.y - 30,
      r: 5,
      vx: 0,
      vy: 42,
      phase: 'falling',
    }];
  });
  await page.waitForFunction(() => window.__TERRY__.getState().poopStuck === true, { timeout: 5000 });

  // Wash: ground stain + deep water
  await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    s.poops = [{ id: 7, x: 200, y: 60, r: 5, vy: 0, phase: 'ground' }];
    s.time = 4;
  });
  await page.waitForFunction(() => {
    const s = window.__TERRY__.getState();
    return s.poops.length === 0;
  }, { timeout: 3000 });

  // Stuck survives seagull pickup
  expect(await page.evaluate(() => window.__TERRY__.getState().poopStuck)).toBe(true);
  await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    s.mode = 'flying';
    s.fartTimer = 3.3;
    s.terry.y = -60;
  });
  await page.waitForFunction(() => {
    const s = window.__TERRY__.getState();
    return s.mode === 'seagull' && s.poopStuck === true;
  }, { timeout: 3000 });

  // Stick clears on fart-finale leave (beginFart) — not on seagull pickup (already asserted)
  const finale = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    s.mode = 'play';
    s.seagull = null;
    s.poopStuck = true;
    window.__TERRY__.beginFart();
    return { mode: s.mode, stuck: s.poopStuck };
  });
  expect(finale.mode).toBe('farting');
  expect(finale.stuck).toBe(false);
});
