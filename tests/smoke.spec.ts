import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

test('electron app launches and shows the library window', async () => {
  const app = await launchApp();
  await app.firstWindow();
  let window: any;
  for (let i = 0; i < 200; i++) {
    window = app.windows().find((w) => w.url().includes('ui.html'));
    if (window) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!window) throw new Error('library window not found');
  await window.waitForLoadState('domcontentloaded');
  const title = await window.title();
  expect(title).toBe('Cite');
  const menus = await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.map((item) => item.label));
  expect(menus).toContain('Arquivo');
  expect(menus).toContain('Editar');
  expect(menus).toContain('Visualizar');
  expect(menus).toContain('Janela');
  await expect(window.locator('#list')).toContainText('Sua biblioteca está vazia');
  await window.locator('#list').getByRole('button', { name: 'Buscar artigos' }).click();
  await expect(window.locator('#search-modal')).toBeVisible();
  await window.click('#close-search');
  await window.screenshot({ path: 'tests/smoke.png' });
  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
