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

async function addPub(window: any, title: string, folder: string) {
  await openCreate(window);
  await window.fill('#title', title);
  await window.fill('#authors', 'Silva, G.');
  await window.fill('#folder', folder);
  await window.click('button[type="submit"]');
  await expect(window.locator('#list')).toContainText(title);
}

test('collections can be renamed, deleted and receive moved references', async () => {
  const app = await launchApp();
  await app.firstWindow();
  const window = await openLocal(app);

  for (const name of ['Alpha', 'Beta']) {
    await window.fill('#collection-name', name);
    await window.click('#add-collection');
    await expect(window.locator('#folder-filter')).toContainText(name);
  }

  const alphaRow = window.locator('#collections-list li').filter({ hasText: 'Alpha' });
  await alphaRow.locator('.collection-color').click();
  await window.locator('.collection-color-menu [data-color="#EF6B5B"]').click();
  await expect(alphaRow.locator('.collection-color')).toHaveAttribute('data-color', '#EF6B5B');
  const collectionColors = await window.evaluate(async () => (window as any).cite.data.call('collections:all'));
  expect(collectionColors.find((col: any) => col.name === 'Alpha')?.color).toBe('#EF6B5B');

  await addPub(window, 'Move One', 'Alpha');
  await addPub(window, 'Move Two', 'Alpha');

  await window.selectOption('#folder-filter', 'Alpha');
  await expect(window.locator('#count')).toContainText('2 de 2');
  await window.locator('#list input.select-pub').evaluateAll((els: any[]) => {
    for (const el of els) el.checked = true;
  });
  await window.click('#export-selected');
  await expect(window.locator('#status')).toContainText('2 exportada(s)');
  await window.selectOption('#move-target', 'Beta');
  await window.click('#move-selected');
  await expect(window.locator('#status')).toContainText('2 movida(s)');

  await window.selectOption('#folder-filter', 'Beta');
  await expect(window.locator('#list')).toContainText('Move One');
  await expect(window.locator('#list')).toContainText('Move Two');
  await expect(window.locator('#count')).toContainText('2 de 2');

  // Rename Beta -> Gamma (cascade to references)
  const betaRow = window.locator('#collections-list li').filter({ hasText: 'Beta' });
  await betaRow.getByRole('button', { name: 'Renomear' }).click();
  await window.locator('#collections-list input').fill('Gamma');
  await window.locator('#collections-list').getByRole('button', { name: 'Salvar' }).click();
  await expect(window.locator('#folder-filter')).toContainText('Gamma');
  await window.selectOption('#folder-filter', 'Gamma');
  await expect(window.locator('#count')).toContainText('2 de 2');
  await expect(window.locator('#list')).toContainText('Move One');

  // Delete Gamma; references stay but lose their folder
  const gammaRow = window.locator('#collections-list li').filter({ hasText: 'Gamma' });
  await gammaRow.getByRole('button', { name: 'Excluir' }).click();
  await expect(window.locator('#status')).toContainText('coleção excluída');
  await expect(window.locator('#folder-filter')).not.toContainText('Gamma');
  await window.selectOption('#folder-filter', '');
  await expect(window.locator('#list')).toContainText('Move One');
  await expect(window.locator('#list')).toContainText('Move Two');

  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
