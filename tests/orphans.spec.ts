import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

test('cleanup removes cached files without attachment records', async () => {
  const app = await launchApp();
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

  await window.evaluate(async () => {
    const api = (window as any).cite;
    await api.attachments.save('Orphan_File.pdf', [37, 80, 68, 70]);
  });
  await window.fill('#search', 'x');
  await window.fill('#search', '');
  await expect(window.locator('#attachments-section')).toBeHidden();
  const before = await window.evaluate(() => (window as any).cite.attachments.list());
  expect(before.some((file: any) => String(file.name).includes('Orphan_File.pdf'))).toBe(true);

  await window.click('.tools summary');
  await window.click('#clean-orphans');
  await expect(window.locator('#status')).toContainText('1 órfão(s) removido(s)');
  const after = await window.evaluate(() => (window as any).cite.attachments.list());
  expect(after.some((file: any) => String(file.name).includes('Orphan_File.pdf'))).toBe(false);
  await expect(window.locator('#attachments-section')).toBeHidden();

  await app.evaluate(({ app }) => app.quit());
  await app.close();
});

test('attachments panel only lists files from active references', async () => {
  const app = await launchApp();
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

  await window.evaluate(async () => {
    const api = (window as any).cite;
    const saved = await api.attachments.save('Vinculado.pdf', [37, 80, 68, 70]);
    await api.data.call('library:put', { _id: 'pub-anexo-ativo', title: 'Referência ativa', type: 'article' });
    await api.data.call('attachments:add', {
      pub_id: 'pub-anexo-ativo',
      name: 'Vinculado.pdf',
      path: saved.path,
      hash: saved.hash,
      size: saved.size,
      mime: 'application/pdf'
    });
  });
  await window.click('.nav-item[data-view="all"]');
  await expect(window.locator('#attachments')).toContainText('Vinculado.pdf');

  await window.evaluate(async () => {
    await (window as any).cite.data.call('library:put', {
      _id: 'pub-anexo-ativo', title: 'Referência ativa', type: 'article', trashed: true
    });
  });
  await window.click('.nav-item[data-view="all"]');
  await expect(window.locator('#attachments-section')).toBeHidden();

  await window.evaluate(async () => {
    await (window as any).cite.data.call('library:put', {
      _id: 'pub-anexo-ativo', title: 'Referência ativa', type: 'article'
    });
  });
  await window.click('.nav-item[data-view="all"]');
  await expect(window.locator('#attachments')).toContainText('Vinculado.pdf');

  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
