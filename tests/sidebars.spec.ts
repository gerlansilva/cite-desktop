import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

async function openLocal(app: any) {
  await app.firstWindow();
  let window: any;
  for (let i = 0; i < 100; i++) {
    window = app.windows().find((w: any) => w.url().includes('ui.html'));
    if (window) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!window) throw new Error('library window not found');
  await window.waitForLoadState('domcontentloaded');
  return window;
}

test('library and detail sidebars can be collapsed and restored', async () => {
  const app = await launchApp();
  const window = await openLocal(app);

  await expect(window.locator('#sidebar')).toBeVisible();
  await window.click('#collapse-sidebar');
  await expect(window.locator('#sidebar')).toBeHidden();
  await expect(window.locator('#show-sidebar')).toBeVisible();
  await window.click('#show-sidebar');
  await expect(window.locator('#sidebar')).toBeVisible();

  await expect(window.locator('#details-panel')).toBeVisible();
  await window.click('#collapse-details');
  await expect(window.locator('#details-panel')).toBeHidden();
  await expect(window.locator('#show-details')).toBeVisible();
  await window.click('#show-details');
  await expect(window.locator('#details-panel')).toBeVisible();

  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
