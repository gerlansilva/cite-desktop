import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { makePdf } from './pdf';
import fs from 'node:fs';
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

test('dropping a PDF creates a reference with the PDF attached', async () => {
  const app = await launchApp();
  const window = await openLocal(app);

  const pdfPath = path.join(os.tmpdir(), `cite-drop-${Date.now()}.pdf`);
  makePdf(pdfPath, 'Dropped PDF body');
  const bytes = [...fs.readFileSync(pdfPath)];

  await window.evaluate(async (data: number[]) => {
    const file = new File([new Uint8Array(data)], 'Dropped_Paper.pdf', { type: 'application/pdf' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, bytes);

  await expect(window.locator('#status')).toContainText('1 PDF(s) importado(s)');
  await expect(window.locator('#list')).toContainText('Dropped Paper');
  await expect(window.locator('#attachments')).toContainText('Dropped_Paper.pdf');

  const stored = await window.evaluate(async () => (window as any).cite.data.call('attachments:all'));
  const library = await window.evaluate(async () => (window as any).cite.data.call('library:all'));
  const attachment = stored.find((a: any) => a.name === 'Dropped_Paper.pdf');
  expect(attachment?.text).toContain('Dropped PDF body');
  expect(library.some((p: any) => p._id === attachment?.pub_id && p.title === 'Dropped Paper')).toBe(true);

  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
