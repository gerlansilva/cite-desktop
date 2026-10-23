import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

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

test('bulk delete and empty trash remove references', async () => {
  const app = await launchApp();
  const window = await openLocal(app);

  await window.evaluate(async () => {
    const api = (window as any).cite;
    for (const id of ['bulk-a', 'bulk-b']) {
      await api.data.call('library:put', { _id: id, title: `Bulk ${id}` });
    }
    await api.data.call('library:put', { _id: 'bulk-c', title: 'Bulk trashed', trashed: true });
  });
  await window.fill('#search', 'bulk');
  await window.fill('#search', '');

  await window.locator('#list input.select-pub').evaluateAll((els: any[]) => {
    for (const el of els) el.checked = true;
  });
  await window.click('#delete-selected');
  await expect(window.locator('#status')).toContainText('2 movida(s) para a lixeira');
  await expect(window.locator('#list')).not.toContainText('Bulk bulk-a');
  await expect(window.locator('#list')).not.toContainText('Bulk bulk-b');

  await window.click('.nav-item[data-view="trash"]');
  await expect(window.locator('#list')).toContainText('Bulk trashed');
  await expect(window.locator('#list')).toContainText('Bulk bulk-a');
  await window.click('.tools summary');
  window.on('dialog', (dialog: any) => dialog.accept());
  await window.click('#empty-trash');
  await expect(window.locator('#status')).toContainText('lixeira esvaziada: 3');
  await expect(window.locator('#list')).not.toContainText('Bulk trashed');
  await expect(window.locator('#empty-trash')).toBeDisabled();

  const remaining = await window.evaluate(async () => (window as any).cite.data.call('library:count'));
  expect(remaining).toBe(0);

  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
