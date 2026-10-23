import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { makePdf } from './pdf';
import os from 'node:os';
import path from 'node:path';

const { createMockServer } = require('../src/mock-server');

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

test('translates a selected PDF paragraph and can switch the target language', async () => {
  const mock = createMockServer();
  const port = await mock.listen();
  const app = await launchApp({
    CITE_TRANSLATE_URL: `http://127.0.0.1:${port}/translate`
  });
  const window = await openLocal(app);

  const pdfPath = path.join(os.tmpdir(), `cite-translate-${Date.now()}.pdf`);
  makePdf(pdfPath, 'Translate me');
  await window.setInputFiles('#file', pdfPath);
  const row = window.locator('#attachments li').filter({ hasText: path.basename(pdfPath) });
  await row.getByRole('button', { name: 'Visualizar' }).click();

  const frame = window.frameLocator('#pdf-frame');
  await frame.locator('canvas').first().waitFor({ timeout: 15000 });
  const span = frame.locator('.textLayer span').first();
  await expect(span).toContainText('Translate me');
  await span.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 120, clientY: 120 }));
  });

  await expect(frame.locator('#selection-actions')).toBeVisible();
  await frame.locator('#translate-selection').click();
  await expect(frame.locator('#translation-panel')).toBeVisible();
  await expect(frame.locator('#translation-result')).toHaveText('[pt] Translate me');

  await frame.locator('#translation-target').selectOption('tet');
  await frame.locator('#translate-selection').click();
  await expect(frame.locator('#translation-result')).toHaveText('[tet] Translate me');

  await frame.locator('#translation-target').selectOption('en');
  await frame.locator('#translate-selection').click();
  await expect(frame.locator('#translation-result')).toHaveText('[en] Translate me');

  await frame.locator('#main').click({ position: { x: 20, y: 20 } });
  await expect(frame.locator('#translation-panel')).toBeHidden();

  await mock.close();
  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
