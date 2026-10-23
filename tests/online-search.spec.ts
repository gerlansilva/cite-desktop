import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

const { createMockServer } = require('../src/mock-server');

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

test('online search imports a Crossref result', async () => {
  const mock = createMockServer();
  const port = await mock.listen();
  const app = await launchApp({ CITE_CROSSREF_URL: `http://127.0.0.1:${port}/works` });
  await app.firstWindow();
  const window = await openLocal(app);

  await window.click('#open-search');
  await expect(window.locator('#search-modal')).toBeVisible();
  await window.fill('#search-query', 'attention');
  await window.click('#run-search');

  const result = window.locator('#search-results li').filter({ hasText: 'Search Result Paper' });
  await expect(result).toContainText('Ana Silva');
  await expect(result).toContainText('Journal of Search');
  await expect(result.getByRole('button', { name: 'Adicionar' })).toHaveClass('btn primary');
  await result.getByRole('button', { name: 'Adicionar' }).click();

  await expect(window.locator('#search-modal')).toBeHidden();
  await expect(window.locator('#list')).toContainText('Search Result Paper');
  await expect(window.locator('#list')).toContainText('Journal of Search');

  await mock.close();
  await app.evaluate(({ app }) => app.quit());
  await app.close();
});

test('online search loads more results from the next page', async () => {
  const mock = createMockServer();
  const port = await mock.listen();
  const app = await launchApp({ CITE_CROSSREF_URL: `http://127.0.0.1:${port}/works` });
  await app.firstWindow();
  const window = await openLocal(app);

  await window.click('#open-search');
  await window.fill('#search-query', 'pagination');
  await window.click('#run-search');

  await expect(window.locator('#search-summary')).toContainText('10 resultado(s)');
  await expect(window.locator('#search-results li').filter({ hasText: 'Pagination Paper 10' })).toBeVisible();
  await expect(window.locator('#search-more')).toBeVisible();

  await window.click('#load-more-search');

  await expect(window.locator('#search-results li').filter({ hasText: 'Search More Paper' })).toBeVisible();
  await expect(window.locator('#search-summary')).toContainText('11 resultado(s)');
  await expect(window.locator('#search-more')).toBeHidden();

  await mock.close();
  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
