import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
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

test('annotations JSON can be imported', async () => {
  const annotationsPath = path.join(os.tmpdir(), `cite-notes-${Date.now()}.json`);
  fs.writeFileSync(
    annotationsPath,
    JSON.stringify([{ attachment_id: 'att-1', page: 2, text: 'Imported note', color: '#fff176', type: 'highlight' }])
  );

  const app = await launchApp();
  const window = await openLocal(app);
  await window.setInputFiles('#notesfile', annotationsPath);
  await expect(window.locator('#status')).toContainText('1 anotação(ões) importada(s)');

  const notes = await window.evaluate(async () => (window as any).cite.data.call('notes:all'));
  expect(notes.some((n: any) => n.text === 'Imported note' && n.page === 2)).toBe(true);

  await app.evaluate(({ app }) => app.quit());
  await app.close();
  fs.rmSync(annotationsPath, { force: true });
});
