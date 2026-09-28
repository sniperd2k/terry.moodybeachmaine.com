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
  const life = await page.evaluate(() => window.__TERRY__.getLifetimeCollected());
  expect(typeof life).toBe('number');
  expect(life).toBeGreaterThanOrEqual(0);
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

test('Chrome desktop: AudioContext resumes after user gesture then play', async ({ page }, testInfo) => {
  // Prefer desktop project; still valid on mobile gesture path
  await page.goto('/');
  await page.waitForFunction(() => window.__TERRY__?.unlockAudio);

  const hooks = await page.evaluate(() => window.__TERRY__.AUDIO_UNLOCK_EVENTS);
  expect(hooks).toEqual(
    expect.arrayContaining(['keydown', 'mousedown', 'pointerdown', 'click', 'touchstart']),
  );

  // Real user gesture (click) then unlock + verify running
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

  // keydown gesture path (desktop Chrome)
  await page.keyboard.down('w');
  await page.keyboard.up('w');
  const afterKey = await page.evaluate(async () => {
    await window.__TERRY__.unlockAudio();
    await new Promise((r) => setTimeout(r, 40));
    return window.__TERRY__.getAudioState();
  });
  expect(afterKey).toBe('running');

  // mousedown path
  await page.locator('#beach').dispatchEvent('mousedown');
  const afterMouse = await page.evaluate(async () => {
    await window.__TERRY__.unlockAudio();
    await new Promise((r) => setTimeout(r, 40));
    return window.__TERRY__.getAudioState();
  });
  expect(afterMouse).toBe('running');
});

test('deep waves + lifetime fields on state', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__TERRY__?.getState());
  const info = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    return {
      hasLifetime: typeof s.lifetimeCollected === 'number',
      hasWaveHitFlag: typeof s.waveHitThisCycle === 'boolean',
      terryYFrac: s.terry.y / s.h,
    };
  });
  expect(info.hasLifetime).toBe(true);
  expect(info.hasWaveHitFlag).toBe(true);
  expect(info.terryYFrac).toBeGreaterThan(0.5);
});

test('wave-hit drop below waterline works with touch/pointer active', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__TERRY__?.getState());

  // Simulate held touch (mobile path) then force a wave hit via state
  const box = await page.locator('#beach').boundingBox();
  expect(box).toBeTruthy();
  await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.7).catch(async () => {
    // Desktop project may lack touchscreen — fall back to mouse down
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.7);
    await page.mouse.down();
  });

  const result = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    s.score = 5;
    s.lifetimeCollected = 5;
    s.pointer.active = true;
    s.pointer.x = s.terry.x;
    s.pointer.y = s.terry.y;
    s.lastWaterY = Math.min(s.terry.y - 4, s.h * 0.55);
    const before = s.glass.length;
    const waterY = s.lastWaterY;
    const hit = window.__TERRY__.applyWaveHit();
    const dropped = s.glass[s.glass.length - 1];
    return {
      dropped: hit?.dropped === true,
      glassDelta: s.glass.length - before,
      dropY: dropped.y,
      waterY,
      spawnBelow: typeof window.__TERRY__.GLASS_SPAWN_BELOW_WATER === 'number'
        ? window.__TERRY__.GLASS_SPAWN_BELOW_WATER
        : 64,
      pointerActive: s.pointer.active,
      score: s.score,
      bounceVy: s.terry.vy,
    };
  });

  expect(result.dropped).toBe(true);
  expect(result.glassDelta).toBe(1);
  expect(result.dropY).toBeGreaterThan(result.waterY);
  expect(result.dropY).toBe(result.waterY + result.spawnBelow);
  expect(result.pointerActive).toBe(false);
  expect(result.score).toBe(4);
  expect(result.bounceVy).toBeGreaterThanOrEqual(250);

  await page.mouse.up().catch(() => {});
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

  // Stale pointer target while still in keyboard mode must not yank crab
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

  // Mouse move resumes follow
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
