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

test('tags filter references and can be edited', async () => {
  const app = await launchApp();
  const window = await openLocal(app);

  await window.evaluate(async () => {
    const api = (window as any).cite;
    await api.data.call('library:put', {
      _id: 'tag-1',
      title: 'Tagged Paper',
      authors: ['Silva, G.'],
      tags: ['ml', 'reading']
    });
    await api.data.call('library:put', { _id: 'tag-2', title: 'Untagged Paper' });
  });
  await window.click('.nav-item[data-view="all"]');

  const tagsSection = window.locator('#tags-section');
  await expect(tagsSection).toBeVisible();
  await expect(tagsSection).toContainText('ml (1)');
  await expect(tagsSection).toContainText('reading (1)');

  await tagsSection.getByRole('button', { name: 'ml (1)' }).click();
  await expect(window.locator('#view-title')).toHaveText('Etiqueta: ml');
  await expect(window.locator('#list')).toContainText('Tagged Paper');
  await expect(window.locator('#list')).not.toContainText('Untagged Paper');

  await window.locator('#list li').filter({ hasText: 'Tagged Paper' }).locator('strong').click();
  await window.getByRole('button', { name: 'Editar metadados' }).click();
  await window.fill('#edit-tags', 'ml, important');
  await window.click('#save-edit');

  await expect(tagsSection).toContainText('important (1)');
  await expect(tagsSection).not.toContainText('reading (1)');

  const stored = await window.evaluate(async () => (window as any).cite.data.call('library:get', 'tag-1'));
  expect(stored.tags).toEqual(['ml', 'important']);

  await tagsSection.getByRole('button', { name: 'important (1)' }).click();
  await expect(window.locator('#list')).toContainText('Tagged Paper');

  await window.click('.nav-item[data-view="all"]');
  await expect(window.locator('#list')).toContainText('Untagged Paper');

  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
