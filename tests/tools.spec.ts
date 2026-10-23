import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
  await window.waitForFunction(() => Boolean((window as any).cite));
  return window;
}

test('tools panel actions work end to end', async () => {
  const bibPath = path.join(os.tmpdir(), `cite-tools-${Date.now()}.bib`);
  const risPath = path.join(os.tmpdir(), `cite-tools-${Date.now()}.ris`);
  const notesPath = path.join(os.tmpdir(), `cite-tools-${Date.now()}.json`);
  const backupPath = path.join(os.tmpdir(), `cite-tools-${Date.now()}.json.gz`);
  fs.writeFileSync(
    bibPath,
    '@article{imported-bib,\n  title = {Imported Bib},\n  author = {Silva, G.},\n  year = {2026}\n}\n'
  );
  fs.writeFileSync(risPath, 'TY  - JOUR\nTI  - Imported RIS\nAU  - Souza, A.\nPY  - 2026\nER  - \n');
  fs.writeFileSync(notesPath, JSON.stringify([{ attachment_id: 'att-tools', page: 1, text: 'Imported note' }]));

  const app = await launchApp();
  const window = await openLocal(app);
  window.on('dialog', (dialog: any) => dialog.accept());

  await window.evaluate(async () => {
    const api = (window as any).cite;
    await api.data.call('library:put', {
      _id: 'util-a',
      title: 'Utility Alpha',
      authors: ['Silva, G.'],
      year: '2026',
      doi: '10.9999/tools'
    });
    await api.data.call('library:put', {
      _id: 'util-b',
      title: 'Utility Beta',
      authors: ['Souza, A.'],
      year: '2026',
      doi: '10.9999/tools'
    });
    await api.data.call('library:put', { _id: 'trash-me', title: 'Trash Me', trashed: true });
    await api.data.call('notes:add', {
      attachment_id: 'att-tools',
      page: 2,
      text: 'Utility note',
      color: '#fff176',
      type: 'highlight'
    });
  });
  await window.fill('#search', 'Utility');
  await window.fill('#search', '');
  await window.click('.tools > summary');

  await window.click('#duplicates');
  await expect(window.locator('#status')).toContainText('1 grupo(s) de duplicatas, 2 referências');
  await window.click('#merge-dups');
  await expect(window.locator('#status')).toContainText('1 duplicata(s) mesclada(s)');

  await window.setInputFiles('#bibfile', bibPath);
  await expect
    .poll(async () => window.evaluate(async () => (await (window as any).cite.data.call('library:all')).length))
    .toBe(3);
  await window.setInputFiles('#risfile', risPath);
  await expect
    .poll(async () => window.evaluate(async () => (await (window as any).cite.data.call('library:all')).length))
    .toBe(4);
  await window.setInputFiles('#notesfile', notesPath);
  await expect(window.locator('#status')).toContainText('1 anotação(ões) importada(s)');

  await window.evaluate(() => {
    (window as any).__downloads = [];
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) {
        (window as any).__downloads.push({ name: this.download, href: this.href });
        return;
      }
      originalClick.call(this);
    };
    URL.revokeObjectURL = () => {};
  });

  for (const id of ['export-bib', 'export-ris', 'export-notes', 'export-md', 'export-csv']) {
    await window.click(`#${id}`);
  }
  await expect
    .poll(async () => window.evaluate(() => (window as any).__downloads.length))
    .toBe(5);

  const downloads = await window.evaluate(async () =>
    Promise.all(
      (window as any).__downloads.map(async (entry: any) => ({
        name: entry.name,
        text: await (await fetch(entry.href)).text()
      }))
    )
  );
  const byName = new Map(downloads.map((entry: any) => [entry.name, entry.text]));
  expect(byName.get('library.bib')).toContain('Imported Bib');
  expect(byName.get('library.ris')).toContain('Imported RIS');
  expect(byName.get('annotations.json')).toContain('Utility note');
  expect(byName.get('library.md')).toContain('Utility Alpha');
  expect(byName.get('library.csv')).toContain('Utility Alpha');

  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, backupPath);
  await window.click('#backup');
  await expect(window.locator('#status')).toContainText('backup salvo');
  expect(fs.existsSync(backupPath)).toBe(true);

  await window.evaluate(async () => {
    await (window as any).cite.data.call('library:delete', 'util-a');
  });
  await app.evaluate(({ dialog }, source) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });
  }, backupPath);
  await window.click('#restore');
  await expect(window.locator('#status')).toContainText('restaurado');
  await expect
    .poll(async () => window.evaluate(async () => Boolean(await (window as any).cite.data.call('library:get', 'util-a'))))
    .toBe(true);

  await window.click('.nav-item[data-view="trash"]');
  await expect(window.locator('#empty-trash')).toBeEnabled();
  await window.click('#empty-trash');
  await expect(window.locator('#status')).toContainText('lixeira esvaziada: 1');
  await expect(window.locator('#empty-trash')).toBeDisabled();

  await window.click('#open-integrations');
  await expect(window.locator('#integrations-modal')).toBeVisible();
  await window.click('#close-integrations');
  await expect(window.locator('#integrations-modal')).toBeHidden();

  await app.evaluate(({ app }) => app.quit());
  await app.close();
  for (const file of [bibPath, risPath, notesPath, backupPath]) fs.rmSync(file, { force: true });
});
