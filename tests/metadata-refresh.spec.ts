import { test, expect } from '@playwright/test';
import { launchApp, openCreate } from './launch';

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

test('existing references can refresh missing metadata from a DOI', async () => {
  const mock = createMockServer();
  const port = await mock.listen();
  const app = await launchApp({ CITE_CROSSREF_URL: `http://127.0.0.1:${port}/works` });
  const window = await openLocal(app);

  await openCreate(window);
  await window.fill('#title', 'Refreshable Paper');
  await window.fill('#authors', 'Silva, G.');
  await window.fill('#create-doi', '10.1/search');
  await window.click('#add-form button[type="submit"]');

  const row = window.locator('#list li').filter({ hasText: 'Refreshable Paper' });
  await expect(row).toHaveCount(1);
  await row.locator('strong').click();
  await window.getByRole('button', { name: 'Editar metadados' }).click();
  await window.click('#refresh-metadata');
  await expect(window.locator('#metadata-status')).toContainText('metadados atualizados');
  await expect(window.locator('#edit-volume')).toHaveValue('1');
  await expect(window.locator('#edit-issue')).toHaveValue('2');
  await expect(window.locator('#edit-pages')).toHaveValue('1-10');
  await expect(window.locator('#edit-journal')).toHaveValue('Journal of Tests');

  await window.click('#save-edit');
  await expect(window.locator('#pub-details')).toContainText('Journal of Tests');
  await expect(window.locator('#pub-details')).toContainText('1-10');

  await mock.close();
  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
