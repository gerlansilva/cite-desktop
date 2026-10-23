import { test, expect } from '@playwright/test';
import { launchApp, openCreate } from './launch';

const { createMockServer } = require('../src/mock-server');

test('add reference by DOI', async () => {
  const mock = createMockServer();
  const port = await mock.listen();
  const app = await launchApp({ CITE_CROSSREF_URL: `http://127.0.0.1:${port}/works` });
  await app.firstWindow();

  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()?.getMenuItemById('open-local')?.click();
  });

  let window: any;
  for (let i = 0; i < 100; i++) {
    window = app.windows().find((w) => w.url().includes('ui.html'));
    if (window) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!window) throw new Error('local library window not found');

  await window.waitForLoadState('domcontentloaded');
  await openCreate(window);
  await window.fill('#doi', '10.1234/test');
  await window.click('#add-doi');
  await expect(window.locator('#list')).toContainText('DOI Paper', { timeout: 10000 });
  await expect(window.locator('#list')).toContainText('Ana Silva');

  await window.fill('#search', 'doi:10.1234/test');
  await expect(window.locator('#list')).toContainText('DOI Paper');
  await expect(window.locator('#list')).not.toContainText('Nenhuma referência encontrada');

  await mock.close();
  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
