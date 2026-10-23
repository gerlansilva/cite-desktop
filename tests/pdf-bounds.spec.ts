import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { makePdf } from './pdf';
import os from 'node:os';
import path from 'node:path';

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

test('highlights are clipped to the PDF page', async () => {
  const app = await launchApp();
  const window = await openLocal(app);

  const pdfPath = path.join(os.tmpdir(), `cite-bounds-${Date.now()}.pdf`);
  makePdf(pdfPath, 'Overflowing highlight text that goes far beyond the page edge');
  await window.setInputFiles('#file', pdfPath);
  const row = window.locator('#attachments li').filter({ hasText: path.basename(pdfPath) });
  await row.getByRole('button', { name: 'Visualizar' }).click();

  const frame = window.frameLocator('#pdf-frame');
  await frame.locator('canvas').first().waitFor({ timeout: 15000 });
  const page = frame.locator('.page').first();
  await expect(page).toHaveCSS('overflow', 'hidden');

  const metrics = await frame.locator('.textLayer span').first().evaluate((span) => {
    const style = getComputedStyle(span);
    const layer = getComputedStyle(span.closest('.textLayer') as HTMLElement);
    return {
      fontSize: parseFloat(style.fontSize),
      fontHeight: parseFloat(style.getPropertyValue('--font-height')),
      totalScale: parseFloat(layer.getPropertyValue('--total-scale-factor'))
    };
  });
  expect(metrics.fontSize).toBeCloseTo(metrics.fontHeight * metrics.totalScale, 1);

  const span = frame.locator('.textLayer span').first();
  await span.selectText();
  await frame.locator('body').dispatchEvent('mouseup', { clientX: 120, clientY: 120 });
  await frame.getByRole('button', { name: 'Destacar' }).click();
  await expect(frame.locator('.hl-rect').first()).toBeVisible();

  const pageBox = await page.boundingBox();
  const rects = await frame.locator('.hl-rect').evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    })
  );
  expect(pageBox).toBeTruthy();
  for (const rect of rects) {
    expect(rect.left).toBeGreaterThanOrEqual(pageBox!.x - 1);
    expect(rect.right).toBeLessThanOrEqual(pageBox!.x + pageBox!.width + 1);
    expect(rect.top).toBeGreaterThanOrEqual(pageBox!.y - 1);
    expect(rect.bottom).toBeLessThanOrEqual(pageBox!.y + pageBox!.height + 1);
  }

  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
