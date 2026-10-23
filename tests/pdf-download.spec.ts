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

test('search result downloads and attaches an open-access PDF', async () => {
  const mock = createMockServer();
  const port = await mock.listen();
  const app = await launchApp({ CITE_CROSSREF_URL: `http://127.0.0.1:${port}/works` });
  const window = await openLocal(app);

  await window.click('#open-search');
  await window.fill('#search-query', 'attention');
  await window.click('#run-search');

  const result = window.locator('#search-results li').filter({ hasText: 'Search Result Paper' });
  await expect(result.getByRole('button', { name: 'Baixar PDF' })).toBeVisible();
  await result.getByRole('button', { name: 'Baixar PDF' }).click();

  await expect(window.locator('#search-modal')).toBeHidden({ timeout: 20000 });
  await expect(window.locator('#list')).toContainText('Search Result Paper');
  await expect(window.locator('#attachments')).toContainText('Search Result Paper', { timeout: 20000 });

  const attachments = await window.evaluate(async () => (window as any).cite.data.call('attachments:all'));
  expect(attachments).toHaveLength(1);
  expect(attachments[0].name).toMatch(/\.pdf$/);
  expect(attachments[0].size).toBeGreaterThan(100);
  expect(attachments[0].text).toContain('PDF downloaded by Cite');

  const row = window.locator('#attachments li').filter({ hasText: 'Search Result Paper' });
  await row.getByRole('button', { name: 'Visualizar' }).click();
  const frame = window.frameLocator('#pdf-frame');
  await expect(frame.locator('.textLayer span').first()).toContainText('PDF downloaded by Cite', { timeout: 20000 });

  await mock.close();
  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
