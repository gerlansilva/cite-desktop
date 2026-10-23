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

test('arXiv and PubMed searches import references', async () => {
  const mock = createMockServer();
  const port = await mock.listen();
  const base = `http://127.0.0.1:${port}`;
  const app = await launchApp({
    CITE_ARXIV_URL: `${base}/arxiv`,
    CITE_PUBMED_URL: `${base}/pubmed`
  });
  const window = await openLocal(app);

  await window.click('#open-search');
  await window.selectOption('#search-source', 'arxiv');
  await window.fill('#search-query', 'attention');
  await window.click('#run-search');
  const arxivResult = window.locator('#search-results li').filter({ hasText: 'ArXiv Paper' });
  await expect(arxivResult).toContainText('Ana Silva');
  await expect(arxivResult.getByRole('button', { name: 'Baixar PDF' })).toBeVisible();
  await arxivResult.getByRole('button', { name: 'Adicionar' }).click();
  await expect(window.locator('#list')).toContainText('ArXiv Paper');

  await window.click('#open-search');
  await window.selectOption('#search-source', 'pubmed');
  await window.fill('#search-query', 'medicine');
  await window.click('#run-search');
  const pubmedResult = window.locator('#search-results li').filter({ hasText: 'PubMed Paper' });
  await expect(pubmedResult).toContainText('Journal of Medicine');
  await pubmedResult.getByRole('button', { name: 'Adicionar' }).click();
  await expect(window.locator('#list')).toContainText('PubMed Paper');
  await expect(window.locator('#list')).toContainText('Journal of Medicine');

  await mock.close();
  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
