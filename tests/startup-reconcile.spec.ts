import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function openLocal(app: any) {
  await app.evaluate(({ Menu }: any) => {
    Menu.getApplicationMenu()?.getMenuItemById('open-local')?.click();
  });
  let window: any;
  for (let i = 0; i < 100; i++) {
    window = app.windows().find((w: any) => w.url().includes('ui.html'));
    if (window) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!window) throw new Error('local library window not found');
  await window.waitForLoadState('domcontentloaded');
  return window;
}

test('startup reconciliation removes stale orphan files only', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppd-reconcile-'));

  const first = await launchApp({}, { userDataDir });
  await first.firstWindow();
  const window1 = await openLocal(first);
  const saved = await window1.evaluate(async () => {
    const api = (window as any).cite;
    const orphan = await api.attachments.save('Orphan_Startup.pdf', [37, 80, 68, 70]);
    const kept = await api.attachments.save('Kept_Startup.pdf', [37, 80, 68, 70, 45, 50]);
    const pub = await api.data.call('library:put', { _id: 'startup-ref', title: 'Startup reference' });
    await api.data.call('attachments:add', {
      pub_id: pub._id,
      name: 'Kept_Startup.pdf',
      path: kept.path,
      hash: kept.hash,
      size: kept.size
    });
    return { orphanPath: orphan.path };
  });
  await first.evaluate(({ app }: any) => app.quit());
  await first.close();

  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  fs.utimesSync(saved.orphanPath, twoDaysAgo, twoDaysAgo);

  const second = await launchApp({}, { userDataDir });
  await second.firstWindow();
  const window2 = await openLocal(second);
  await window2.waitForTimeout(1500);
  await window2.fill('#search', 'startup');
  await window2.fill('#search', '');
  await expect(window2.locator('#attachments')).toContainText('Kept_Startup.pdf', { timeout: 15000 });
  await expect(window2.locator('#attachments')).not.toContainText('Orphan_Startup.pdf');
  const files = await window2.evaluate(() => (window as any).cite.attachments.list());
  expect(files.some((file: any) => String(file.name).includes('Kept_Startup.pdf'))).toBe(true);
  expect(files.some((file: any) => String(file.name).includes('Orphan_Startup.pdf'))).toBe(false);

  await second.evaluate(({ app }: any) => app.quit());
  await second.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
});
