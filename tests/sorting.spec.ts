import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

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

test('references can be sorted by title and year', async () => {
  const app = await launchApp();
  await app.firstWindow();
  const window = await openLocal(app);

  await window.evaluate(async () => {
    const api = (window as any).cite;
    await api.data.call('library:put', { _id: 'sort-z', title: 'Zeta Paper', authors: ['Silva, G.'], year: '1962' });
    await api.data.call('library:put', { _id: 'sort-a', title: 'Alpha Paper', authors: ['Souza, A.'], year: '2020' });
  });
  await window.fill('#search', 'paper');
  await window.fill('#search', '');

  await window.selectOption('#sort-select', 'title');
  await expect(window.locator('#list li').first()).toContainText('Alpha Paper');
  await window.selectOption('#sort-select', 'year');
  await expect(window.locator('#list li').first()).toContainText('2020');
  await expect(window.locator('#list li').last()).toContainText('1962');

  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
