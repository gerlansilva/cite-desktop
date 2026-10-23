import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('attachment IPC save/read/dedup works', async () => {
  const app = await launchApp();
  await app.firstWindow();
  let window: any;
  for (let i = 0; i < 200; i++) {
    window = app.windows().find((w) => w.url().includes('ui.html'));
    if (window) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!window) throw new Error('main window not found');
  await window.waitForLoadState('domcontentloaded');

  await window.evaluate(async () => (window as any).cite.attachments.cleanupOrphans([]));
  const result1 = await window.evaluate(async () => {
    const data = Array.from(new TextEncoder().encode('hello cite'));
    return (window as any).cite.attachments.save('test.txt', data);
  });
  expect(result1).toHaveProperty('hash');
  expect(result1.deduped).toBe(false);

  const result2 = await window.evaluate(async (hashPath) => {
    const data = Array.from(new TextEncoder().encode('hello cite'));
    return (window as any).cite.attachments.save('test.txt', data);
  }, result1.path);
  expect(result2.deduped).toBe(true);
  expect(result2.path).toBe(result1.path);

  const list = await window.evaluate(async () => (window as any).cite.attachments.list());
  expect(Array.isArray(list)).toBe(true);
  expect(list.length).toBeGreaterThanOrEqual(1);

  // Data worker IPC (retry until worker is ready)
  const dataResult = await window.evaluate(async () => {
    const api = (window as any).cite.data;
    for (let i = 0; i < 20; i++) {
      try {
        await api.call('library:put', { _id: 'ipc-1', title: 'IPC Paper' });
        return { count: await api.call('library:count'), pub: await api.call('library:get', 'ipc-1') };
      } catch (e) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    throw new Error('data worker unavailable');
  });
  expect(dataResult.count).toBeGreaterThanOrEqual(1);
  expect(dataResult.pub.title).toBe('IPC Paper');

  // PDF viewer window
  const pdfPath = path.join(os.tmpdir(), `ppd-test-${Date.now()}.pdf`);
  fs.writeFileSync(pdfPath, '%PDF-1.4\n%%EOF\n');
  const newWindowPromise = app.waitForEvent('window');
  await window.evaluate(async (p) => (window as any).cite.pdf.openWindow(p), pdfPath);
  const pdfWindow = await newWindowPromise;
  expect(pdfWindow.url()).toContain('.pdf');

  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
