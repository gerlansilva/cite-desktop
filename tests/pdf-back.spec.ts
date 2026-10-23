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

test('back button returns from the PDF viewer to the library', async () => {
  const app = await launchApp();
  const window = await openLocal(app);

  const pdfPath = path.join(os.tmpdir(), `cite-back-${Date.now()}.pdf`);
  makePdf(pdfPath, 'Back to library');
  await window.setInputFiles('#file', pdfPath);
  const row = window.locator('#attachments li').filter({ hasText: path.basename(pdfPath) });
  await row.getByRole('button', { name: 'Visualizar' }).click();

  const frame = window.frameLocator('#pdf-frame');
  await frame.locator('canvas').first().waitFor({ timeout: 15000 });
  const back = frame.getByRole('button', { name: 'Voltar à biblioteca' });
  await expect(back).toBeVisible();
  await expect(back).toContainText('Biblioteca');
  await back.click();

  await expect(window.locator('#viewer')).toBeHidden();
  await expect(window.locator('#pdf-frame')).toHaveAttribute('src', 'about:blank');

  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
