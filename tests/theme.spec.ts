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

test('dark theme applies to the library and PDF viewer and persists', async () => {
  const app = await launchApp();
  const window = await openLocal(app);

  await expect(window.locator('html')).toHaveAttribute('data-theme', 'light');
  await window.click('#theme-toggle');
  await expect(window.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await window.evaluate(() => localStorage.getItem('cite-theme'))).toBe('dark');

  await window.reload();
  await expect(window.locator('html')).toHaveAttribute('data-theme', 'dark');

  const pdfPath = path.join(os.tmpdir(), `cite-theme-${Date.now()}.pdf`);
  makePdf(pdfPath, 'Theme page');
  await window.setInputFiles('#file', pdfPath);
  const row = window.locator('#attachments li').filter({ hasText: path.basename(pdfPath) });
  await expect(row).toContainText(path.basename(pdfPath));
  await row.getByRole('button', { name: 'Visualizar' }).click();

  const rowBackground = await window.locator('#list > li').first().evaluate(
    (el) => getComputedStyle(el).backgroundColor
  );
  expect(rowBackground).not.toBe('rgb(255, 255, 255)');

  const frame = window.frameLocator('#pdf-frame');
  await frame.locator('canvas').first().waitFor({ timeout: 15000 });
  await expect(frame.locator('html')).toHaveAttribute('data-theme', 'dark');
  const toolbarBackground = await frame.locator('#toolbar').evaluate(
    (el) => getComputedStyle(el).backgroundColor
  );
  expect(toolbarBackground).not.toBe('rgb(255, 255, 255)');

  await frame.locator('#settings-button').click();
  await expect(frame.locator('#dark-theme')).toHaveClass(/active/);
  await frame.locator('#light-theme').click();
  await expect(frame.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(window.locator('html')).toHaveAttribute('data-theme', 'light');

  await window.evaluate(() => (document.getElementById('theme-toggle') as HTMLElement).click());
  await expect(window.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(frame.locator('html')).toHaveAttribute('data-theme', 'dark');

  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
