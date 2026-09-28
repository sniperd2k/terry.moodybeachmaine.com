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
  // No brochure content
  const body = await page.content();
  expect(body).not.toContain('Canonicus');
  expect(body).not.toContain('VacationRental');
});

test('pointer move nudges Terry', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__TERRY__?.getState());
  const before = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    return { x: s.terry.x, y: s.terry.y };
  });
  const box = await page.locator('#beach').boundingBox();
  await page.locator('#beach').dispatchEvent('pointerdown', {
    clientX: box.x + box.width * 0.8,
    clientY: box.y + box.height * 0.7,
    buttons: 1,
  });
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => {
    const s = window.__TERRY__.getState();
    return { x: s.terry.x, y: s.terry.y, mode: s.mode };
  });
  expect(after.mode).toBe('play');
  const moved = Math.hypot(after.x - before.x, after.y - before.y);
  expect(moved).toBeGreaterThan(2);
});
