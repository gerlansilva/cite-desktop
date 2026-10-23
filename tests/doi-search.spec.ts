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

test('online search resolves a DOI directly', async () => {
  const mock = createMockServer();
  const port = await mock.listen();
  const app = await launchApp({ CITE_CROSSREF_URL: `http://127.0.0.1:${port}/works` });
  await app.firstWindow();
  const window = await openLocal(app);

  await window.click('#open-search');
  await expect(window.locator('#search-modal')).toBeVisible();
  await window.fill('#search-query', '10.1234/test');
  await window.click('#run-search');

  const result = window.locator('#search-results li').filter({ hasText: 'DOI Paper' });
  await expect(result).toContainText('Ana Silva');
  await expect(result).toContainText('10.1234/test');
  await expect(window.locator('#search-results')).not.toContainText('Search Result Paper');

  await mock.close();
  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
