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

test('hierarchical collections filter the library', async () => {
  const app = await launchApp();
  await app.firstWindow();
  const window = await openLocal(app);

  await window.fill('#collection-name', 'Parent');
  await window.click('#add-collection');
  await expect(window.locator('#folder-filter')).toContainText('Parent');

  await window.fill('#collection-name', 'parent');
  await window.click('#add-collection');
  await expect(window.locator('#status')).toContainText('já existe uma coleção');
  await expect(window.locator('#collections-list li')).toHaveCount(1);

  await window.fill('#collection-name', 'Child');
  await window.selectOption('#collection-parent', { label: 'Parent' });
  await window.click('#add-collection');
  await expect(window.locator('#folder-filter')).toContainText('— Child');
  await expect(window.locator('#collections-list')).toContainText('— Child (0)');

  await openCreate(window);
  await window.fill('#title', 'Child Paper');
  await window.fill('#authors', 'Silva, G.');
  await window.fill('#folder', 'Child');
  await window.click('button[type="submit"]');
  await expect(window.locator('#list')).toContainText('Child Paper');

  await window.selectOption('#folder-filter', { label: '— Child' });
  await expect(window.locator('#list')).toContainText('Child Paper');
  await expect(window.locator('#count')).toContainText('1 de 1');

  const collections = await window.evaluate(async () =>
    (window as any).cite.data.call('collections:all')
  );
  expect(collections).toHaveLength(2);
  const child = collections.find((c: any) => c.name === 'Child');
  const parent = collections.find((c: any) => c.name === 'Parent');
  expect(child.cParent).toBe(parent._id);

  let childRow = window.locator('#collections-list li').filter({ hasText: 'Child' });
  await childRow.getByRole('button', { name: 'Mover' }).click();
  let moveRow = window.locator('#collections-list li[data-editing="move"]');
  await moveRow.locator('select').selectOption({ label: 'Sem coleção superior' });
  await moveRow.getByRole('button', { name: 'Salvar' }).click();
  await expect(window.locator('#status')).toContainText('nível superior');
  await expect(window.locator('#folder-filter option').filter({ hasText: 'Child' })).not.toContainText('—');

  const unnested = await window.evaluate(async () =>
    (window as any).cite.data.call('collections:all')
  );
  expect(unnested.find((c: any) => c.name === 'Child').cParent).toBeUndefined();

  childRow = window.locator('#collections-list li').filter({ hasText: 'Child' });
  await childRow.getByRole('button', { name: 'Mover' }).click();
  moveRow = window.locator('#collections-list li[data-editing="move"]');
  await moveRow.locator('select').selectOption({ label: 'Parent' });
  await moveRow.getByRole('button', { name: 'Salvar' }).click();
  await expect(window.locator('#folder-filter')).toContainText('— Child');

  await window.locator('#collections-list li').filter({ hasText: 'Parent' }).getByRole('button', { name: 'Excluir' }).click();
  await expect(window.locator('#status')).toContainText('subcoleção');
  await expect(window.locator('#folder-filter')).toContainText('Child');
  const afterDelete = await window.evaluate(async () =>
    (window as any).cite.data.call('collections:all')
  );
  expect(afterDelete).toHaveLength(1);
  expect(afterDelete[0].name).toBe('Child');
  expect(afterDelete[0].cParent).toBeUndefined();

  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
