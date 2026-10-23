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

test('reference metadata can be edited from the details pane', async () => {
  const app = await launchApp();
  await app.firstWindow();
  const window = await openLocal(app);

  await openCreate(window);
  await window.fill('#title', 'Editable Paper');
  await window.fill('#authors', 'Silva, G.');
  await window.fill('#year', '2026');
  await window.click('button[type="submit"]');
  const row = window.locator('#list li').filter({ hasText: 'Editable Paper' });
  await row.locator('strong').click();
  await expect(window.locator('#pub-details')).toContainText('Editable Paper');

  await window.getByRole('button', { name: 'Editar metadados' }).click();
  await expect(window.locator('#edit-modal')).toBeVisible();
  await window.fill('#edit-journal', 'Nature');
  await window.fill('#edit-doi', '10.1/edit');
  await window.fill('#edit-abstract', 'Updated abstract about testing.');
  await window.click('#save-edit');
  await expect(window.locator('#edit-modal')).toBeHidden();

  await expect(window.locator('#pub-details')).toContainText('Nature');
  await expect(window.locator('#pub-details')).toContainText('10.1/edit');
  await expect(window.locator('#pub-details')).toContainText('Updated abstract about testing.');

  await window.getByRole('button', { name: 'Editar metadados' }).click();
  await window.selectOption('#edit-type', 'book');
  await expect(window.locator('#edit-publisher')).toBeVisible();
  await window.fill('#edit-publisher', 'Editora Teste');
  await window.fill('#edit-place', 'São Paulo');
  await window.fill('#edit-edition', '2');
  await window.click('#save-edit');
  await expect(window.locator('#pub-details')).toContainText('Livro');
  await expect(window.locator('#pub-details')).toContainText('Editora Teste');
  await expect(window.locator('#pub-details')).toContainText('São Paulo');

  await window.getByRole('button', { name: 'Copiar citação' }).click();
  await expect(window.locator('#status')).toContainText('copiado: APA');
  await window.selectOption('#cite-style', 'ABNT');
  await window.getByRole('button', { name: 'Copiar citação' }).click();
  await expect(window.locator('#status')).toContainText('copiado: ABNT');
  await window.selectOption('#cite-style', 'MLA');
  await window.getByRole('button', { name: 'Copiar citação' }).click();
  await expect(window.locator('#status')).toContainText('copiado: MLA');

  await window.fill('#search', 'Updated abstract');
  await expect(window.locator('#list')).toContainText('Editable Paper');
  await window.fill('#search', '');

  await window.getByRole('button', { name: 'Editar metadados' }).click();
  await window.fill('#edit-title', 'Editable Paper Revised');
  await window.click('#save-edit');
  await expect(window.locator('#list')).toContainText('Editable Paper Revised');
  await expect(window.locator('#pub-details')).toContainText('Editable Paper Revised');

  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
