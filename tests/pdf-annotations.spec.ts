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

test('shape and text annotations are created on the PDF', async () => {
  test.setTimeout(60000);
  const app = await launchApp();
  const window = await openLocal(app);

  const pdfPath = path.join(os.tmpdir(), `cite-annotations-${Date.now()}.pdf`);
  makePdf(pdfPath, 'Annotatable page');
  await window.setInputFiles('#file', pdfPath);
  const row = window.locator('#attachments li').filter({ hasText: path.basename(pdfPath) });
  await row.getByRole('button', { name: 'Visualizar' }).click();

  const frame = window.frameLocator('#pdf-frame');
  await frame.locator('canvas').first().waitFor({ timeout: 15000 });
  const page = frame.locator('.page').first();
  const box = await page.boundingBox();
  if (!box) throw new Error('PDF page has no bounding box');

  await frame.getByRole('button', { name: 'Formas', exact: true }).click();
  await window.mouse.move(box.x + 180, box.y + 180);
  await window.mouse.down();
  await window.mouse.move(box.x + 360, box.y + 280, { steps: 6 });
  await window.mouse.up();
  await expect(frame.locator('.shape-annotation')).toHaveCount(1, { timeout: 10000 });

  await frame.getByRole('button', { name: 'Texto', exact: true }).click();
  await page.dispatchEvent('click', { clientX: box.x + 150, clientY: box.y + 360 });
  await frame.locator('#text-editor').waitFor({ state: 'visible', timeout: 5000 });
  await frame.locator('#text-editor-input').fill('Minha nota');
  await frame.locator('#text-save').click();
  await expect(frame.locator('.text-annotation')).toContainText('Minha nota', { timeout: 10000 });
  await expect(frame.locator('#ann-count')).toHaveText('(2)');

  const notes = await window.evaluate(async () => (window as any).cite.data.call('notes:all'));
  expect(notes.some((n: any) => n.type === 'shape')).toBe(true);
  expect(notes.some((n: any) => n.type === 'text' && n.text === 'Minha nota')).toBe(true);

  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
