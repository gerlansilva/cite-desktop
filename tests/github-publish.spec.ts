import { test, expect } from '@playwright/test';
import { launchApp, openCreate } from './launch';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

test('GitHub integration publishes bibliography JSON and BibTeX', async () => {
  const mock = createMockServer();
  const port = await mock.listen();
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cite-integrations-'));
  const configPath = path.join(configDir, 'integrations.json');
  const app = await launchApp({
    CITE_GITHUB_API: `http://127.0.0.1:${port}`,
    CITE_INTEGRATIONS_CONFIG: configPath
  });
  const window = await openLocal(app);

  await openCreate(window);
  await window.fill('#title', 'GitHub Paper');
  await window.fill('#authors', 'Silva, G.; Souza, A.');
  await window.fill('#year', '2026');
  await window.click('#add-form button[type="submit"]');

  await window.click('.tools > summary');
  await window.click('#open-integrations');
  await expect(window.locator('#integrations-modal')).toBeVisible();
  await window.fill('#github-repo', 'usuario/repo');
  await window.fill('#github-branch', 'main');
  await window.fill('#github-folder', 'cite');
  await window.fill('#github-token', 'test-token');
  await window.click('#save-github');
  await expect(window.locator('#github-status')).toContainText('configuração salva');

  await window.click('#publish-github');
  await expect(window.locator('#github-status')).toContainText('1 referência(s) publicada(s)', {
    timeout: 20000
  });

  const bibliography = JSON.parse(mock.files['cite/bibliography.json']);
  expect(bibliography.items).toHaveLength(1);
  expect(bibliography.items[0].title).toBe('GitHub Paper');
  expect(bibliography.items[0].citations.ABNT).toContain('SILVA, G.; SOUZA, A.');
  expect(mock.files['cite/references.bib']).toContain('@article');
  expect(fs.existsSync(configPath)).toBe(true);
  expect(fs.readFileSync(configPath, 'utf8')).not.toContain('test-token');

  await mock.close();
  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
