import { test, expect, _electron as electron } from '@playwright/test';
import { makePdf } from './pdf';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('uses the configured data folder for the database and attachments', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cite-storage-'));
  const storageDir = path.join(root, 'dados');
  const configPath = path.join(root, 'storage.json');
  const pdfPath = path.join(root, 'storage-test.pdf');
  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ storageDir }));
  makePdf(pdfPath, 'Storage folder test');

  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: { ...process.env, CITE_STORAGE_CONFIG: configPath, CITE_NO_OPEN: '1' }
  });

  let window: any;
  for (let i = 0; i < 100; i++) {
    window = app.windows().find((w: any) => w.url().includes('ui.html'));
    if (window) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!window) throw new Error('library window not found');
  await window.waitForLoadState('domcontentloaded');

  expect(await app.evaluate(({ app }) => app.getPath('userData'))).toBe(storageDir);
  await window.setInputFiles('#file', pdfPath);
  await expect(window.locator('#attachments')).toContainText(path.basename(pdfPath));

  const files = fs.readdirSync(path.join(storageDir, 'attachments'));
  expect(files.some((name) => name.endsWith(path.basename(pdfPath)))).toBe(true);
  expect(fs.readdirSync(path.join(storageDir, 'IndexedDB')).length).toBeGreaterThan(0);

  await app.evaluate(({ app }) => app.quit());
  await app.close();
  fs.rmSync(root, { recursive: true, force: true });
});
