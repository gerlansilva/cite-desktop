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

test('backup exports and restores references plus attachments', async () => {
  const backupPath = path.join(os.tmpdir(), `cite-backup-${Date.now()}.json.gz`);
  const app = await launchApp();
  const window = await openLocal(app);

  const created = await window.evaluate(async () => {
    const api = (window as any).cite;
    const saved = await api.attachments.save('Backup Paper.pdf', [37, 80, 68, 70, 45, 49]);
    await api.data.call('library:put', { _id: 'backup-1', title: 'Backup Paper', authors: ['Silva, G.'] });
    const attachment = await api.data.call('attachments:add', {
      pub_id: 'backup-1',
      name: 'Backup Paper.pdf',
      path: saved.path,
      hash: saved.hash,
      size: saved.size
    });
    return { saved, attachment };
  });
  expect(fs.existsSync(created.saved.path)).toBe(true);

  const backup = await window.evaluate(async (target: string) => {
    return (window as any).cite.backup.create(target);
  }, backupPath);
  expect(backup.ok).toBe(true);
  expect(backup.references).toBeGreaterThanOrEqual(1);
  expect(backup.attachments).toBeGreaterThanOrEqual(1);
  expect(fs.existsSync(backupPath)).toBe(true);

  await window.evaluate(async (attachment: any) => {
    const api = (window as any).cite;
    await api.data.call('library:delete', 'backup-1');
    await api.data.call('attachments:delete', attachment._id);
    await api.attachments.delete(attachment.path);
  }, created.attachment);

  const missing = await window.evaluate(async () => {
    const api = (window as any).cite;
    return {
      pub: await api.data.call('library:get', 'backup-1'),
      attachments: await api.data.call('attachments:all')
    };
  });
  expect(missing.pub).toBeUndefined();
  expect(missing.attachments.some((a: any) => a._id === created.attachment._id)).toBe(false);

  const restored = await window.evaluate(async (source: string) => {
    return (window as any).cite.backup.restore(source);
  }, backupPath);
  expect(restored.ok).toBe(true);
  expect(restored.references).toBeGreaterThanOrEqual(1);

  const after = await window.evaluate(async () => {
    const api = (window as any).cite;
    return {
      pub: await api.data.call('library:get', 'backup-1'),
      attachments: await api.data.call('attachments:all'),
      files: await api.attachments.list()
    };
  });
  expect(after.pub.title).toBe('Backup Paper');
  expect(after.attachments.some((a: any) => a._id === created.attachment._id)).toBe(true);
  expect(after.files.some((f: any) => f.name.includes('Backup_Paper.pdf'))).toBe(true);

  await window.evaluate(async () => (window as any).cite.data.call('library:delete', 'backup-1'));
  await app.evaluate(({ app }) => app.quit());
  await app.close();
  fs.rmSync(backupPath, { force: true });
});
