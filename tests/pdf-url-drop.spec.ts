import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

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

test('dropping a PDF link downloads it inside Cite and creates a reference', async () => {
  const mock = createMockServer();
  const port = await mock.listen();
  const app = await launchApp();
  const window = await openLocal(app);

  await window.evaluate((url: string) => {
    const transfer = new DataTransfer();
    transfer.setData('text/uri-list', url);
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, `http://127.0.0.1:${port}/article`);

  await expect(window.locator('#status')).toContainText('PDF importado', { timeout: 20000 });
  await expect(window.locator('#list')).toContainText('Landing Article');
  await expect(window.locator('#attachments')).toContainText('article.pdf');

  const library = await window.evaluate(async () => (window as any).cite.data.call('library:all'));
  const attachment = await window.evaluate(async () => (window as any).cite.data.call('attachments:all'));
  const imported = library.find((p: any) => p.url.endsWith('/article'));
  expect(imported?.title).toBe('Landing Article');
  expect(imported?.authors).toEqual(['Ana Silva']);
  expect(imported?.year).toBe('2024');
  expect(imported?.journal).toBe('Journal of Landing');
  expect(imported?.volume).toBe('12');
  expect(imported?.issue).toBe('3');
  expect(imported?.pages).toBe('7-19');
  expect(imported?.issn).toBe('1234-5678');
  expect(imported?.publisher).toBe('Landing Press');
  expect(imported?.accessed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(attachment.some((a: any) => a.text?.includes('PDF downloaded by Cite'))).toBe(true);

  await mock.close();
  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
