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

test('copies selected PDF text with page number', async () => {
  const app = await launchApp();
  const window = await openLocal(app);

  const pdfPath = path.join(os.tmpdir(), `cite-copy-${Date.now()}.pdf`);
  makePdf(pdfPath, 'Copyable page');
  await window.setInputFiles('#file', pdfPath);
  const row = window.locator('#attachments li').filter({ hasText: path.basename(pdfPath) });
  await expect(row).toContainText(path.basename(pdfPath));
  await row.getByRole('button', { name: 'Visualizar' }).click();

  const frame = window.frameLocator('#pdf-frame');
  await frame.locator('canvas').first().waitFor({ timeout: 15000 });
  const span = frame.locator('.textLayer span').first();
  await expect(span).toContainText('Copyable page');

  await span.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 120, clientY: 120 }));
  });
  await expect(frame.locator('#selection-actions')).toBeVisible();
  await frame.locator('#copy-selection').click();
  await expect(frame.locator('#status-toast')).toContainText('Trecho copiado');

  const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
  expect(copied).toBe('Copyable page (p. 1)');

  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
