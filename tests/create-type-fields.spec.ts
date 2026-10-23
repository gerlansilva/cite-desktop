import { test, expect } from '@playwright/test';
import { launchApp, openCreate } from './launch';

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

test('new references expose metadata fields for the selected type', async () => {
  const app = await launchApp();
  await app.firstWindow();
  const window = await openLocal(app);

  await openCreate(window);
  await window.selectOption('#type', 'book');
  await expect(window.locator('#create-fields [data-create-field="publisher"]')).toBeVisible();
  await window.fill('#title', 'Type-aware Book');
  await window.fill('#authors', 'Silva, G.');
  await window.fill('#year', '2026');
  await window.fill('#create-fields [data-create-field="publisher"]', 'Editora Teste');
  await window.fill('#create-fields [data-create-field="place"]', 'São Paulo');
  await window.fill('#create-fields [data-create-field="edition"]', '2');
  await window.click('#add-form button[type="submit"]');

  const row = window.locator('#list li').filter({ hasText: 'Type-aware Book' });
  await expect(row).toHaveCount(1);
  await row.locator('strong').click();
  await expect(window.locator('#pub-details')).toContainText('Livro');
  await expect(window.locator('#pub-details')).toContainText('Editora Teste');
  await expect(window.locator('#pub-details')).toContainText('São Paulo');

  await window.getByRole('button', { name: 'Editar metadados' }).click();
  await expect(window.locator('#edit-type')).toHaveValue('book');
  await expect(window.locator('#edit-publisher')).toHaveValue('Editora Teste');
  await expect(window.locator('#edit-place')).toHaveValue('São Paulo');
  await expect(window.locator('#edit-edition')).toHaveValue('2');

  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
