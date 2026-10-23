import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

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

test('Google Scholar search parses and imports a result', async () => {
  const mock = createMockServer();
  const port = await mock.listen();
  const app = await launchApp({
    CITE_GOOGLE_SCHOLAR_URL: `http://127.0.0.1:${port}/google`
  });
  const window = await openLocal(app);

  await window.click('#open-search');
  await window.selectOption('#search-source', 'google');
  await window.fill('#search-query', 'machine learning');
  await window.click('#run-search');

  const result = window.locator('#search-results li').filter({ hasText: 'Google Scholar Paper' });
  await expect(result).toContainText('Ana Silva');
  await expect(result).toContainText('Journal of Scholar');
  await expect(result).toContainText('2024');
  await expect(result.getByRole('button', { name: 'Baixar PDF' })).toBeVisible();
  await result.getByRole('button', { name: 'Adicionar' }).click();

  await expect(window.locator('#search-modal')).toBeHidden();
  await expect(window.locator('#list')).toContainText('Google Scholar Paper');
  await expect(window.locator('#list')).toContainText('Journal of Scholar');

  const stored = await window.evaluate(async () => (window as any).cite.data.call('library:all'));
  const paper = stored.find((p: any) => p.title === 'Google Scholar Paper');
  expect(paper.authors).toEqual(['Ana Silva', 'Bruno Souza']);
  expect(paper.year).toBe('2024');
  expect(paper.volume).toBe('12');
  expect(paper.issue).toBe('3');
  expect(paper.pages).toBe('7-19');
  expect(paper.doi).toBeUndefined();
  expect(paper.accessed).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  await mock.close();
  await app.evaluate(({ app }) => app.quit());
  await app.close();
});

test('Google Scholar search offers another page when nine results are parsed', async () => {
  const mock = createMockServer();
  const port = await mock.listen();
  const app = await launchApp({
    CITE_GOOGLE_SCHOLAR_URL: `http://127.0.0.1:${port}/google`
  });
  const window = await openLocal(app);

  await window.click('#open-search');
  await window.selectOption('#search-source', 'google');
  await window.fill('#search-query', 'pagination-google');
  await window.click('#run-search');

  await expect(window.locator('#search-summary')).toContainText('9 resultado(s)');
  await expect(window.locator('#search-more')).toBeVisible();
  await window.click('#load-more-search');

  await expect(window.locator('#search-results li').filter({ hasText: 'Google More Paper' })).toBeVisible();
  await expect(window.locator('#search-summary')).toContainText('10 resultado(s)');
  await expect(window.locator('#search-more')).toBeHidden();

  await mock.close();
  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
