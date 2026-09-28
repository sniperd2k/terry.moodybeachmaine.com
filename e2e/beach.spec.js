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
  // Drive keys (reliable across mobile project config)
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
    // Fallback: set pointer target far right and tick
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
