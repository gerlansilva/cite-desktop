import { test, expect } from '@playwright/test';
import { launchApp, openCreate } from './launch';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makePdf } from './pdf';

test('local library UI adds a reference', async () => {
  const app = await launchApp();
  await app.firstWindow();

  await app.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById('open-local');
    item?.click();
  });

  let window: any;
  for (let i = 0; i < 50; i++) {
    window = app.windows().find((w) => w.url().includes('ui.html'));
    if (window) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!window) throw new Error('local library window not found');

  await window.waitForLoadState('domcontentloaded');
  const uniqueTitle = `Playwright Paper ${Date.now()}`;
  await openCreate(window);
  await window.fill('#title', uniqueTitle);
  await window.fill('#authors', 'Silva, G.');
  await window.fill('#year', '2026');
  await window.fill('#folder', 'Thesis');
  await window.click('button[type="submit"]');

  await expect(window.locator('#list')).toContainText(uniqueTitle);
  await expect(window.locator('#count')).toContainText(/referência/);

  // Attach a PDF to the reference (metadata goes to the oplog)
  const pubPdf = path.join(os.tmpdir(), `ppd-pub-${Date.now()}.pdf`);
  makePdf(pubPdf, 'Linked attachment');
  const pubRow = window.locator('#list li').filter({ hasText: uniqueTitle });
  await pubRow.locator('strong').click();
  await expect(window.locator('#pub-details')).toContainText(uniqueTitle);
  const chooserPromise = window.waitForEvent('filechooser');
  await pubRow.getByRole('button', { name: 'Anexar' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(pubPdf);
  await expect(pubRow.locator('[data-attachments]')).toContainText(path.basename(pubPdf));
  const secondPdf = path.join(os.tmpdir(), `ppd-pub2-${Date.now()}.pdf`);
  makePdf(secondPdf, 'Second linked attachment');
  const chooser2Promise = window.waitForEvent('filechooser');
  await pubRow.getByRole('button', { name: 'Anexar' }).click();
  const chooser2 = await chooser2Promise;
  await chooser2.setFiles(secondPdf);
  await expect(pubRow.locator('[data-attachments]')).toContainText('Anexos (2)');
  await expect(pubRow.locator('[data-attachments]')).toContainText(path.basename(secondPdf));
  const storedAttachments = await window.evaluate(async () =>
    (window as any).cite.data.call('attachments:all')
  );
  const linkedRecord = storedAttachments.find((a: any) => a.name === path.basename(pubPdf));
  expect(linkedRecord.text).toContain('Linked attachment');
  await window.fill('#search', 'Linked attachment');
  await expect(pubRow).toBeVisible();
  await expect(pubRow.locator('mark')).toHaveText(/linked attachment/i);
  await window.fill('#search', '');
  const oplog = await window.evaluate(async () => (window as any).cite.data.call('changes:all'));
  expect(oplog.some((c: any) => c.mcollection === 'Attachments' && c.action === 'insert')).toBe(true);

  // Folder filter
  await window.selectOption('#folder-filter', 'Thesis');
  await expect(window.locator('#list')).toContainText(uniqueTitle);
  await window.selectOption('#folder-filter', '');

  // Star and trash lifecycle
  let trashRow = window.locator('#list li').filter({ hasText: uniqueTitle });
  await trashRow.getByRole('button', { name: 'Favoritar' }).click();
  await expect(trashRow).toContainText('★');
  await expect(trashRow.getByRole('button', { name: 'Remover' })).toBeVisible();
  await window.click('.nav-item[data-view="starred"]');
  await expect(window.locator('#view-title')).toHaveText('Favoritos');
  await expect(trashRow).toContainText(uniqueTitle);
  await window.click('.nav-item[data-view="all"]');
  await expect(window.locator('#view-title')).toHaveText('Todas as referências');
  await trashRow.getByRole('button', { name: 'Remover' }).click();
  await expect(trashRow.getByRole('button', { name: 'Favoritar' })).toBeVisible();
  await trashRow.getByRole('button', { name: 'Lixeira' }).click();
  await expect(trashRow).toHaveCount(0);
  await window.check('#show-trashed');
  await expect(trashRow).toContainText(uniqueTitle);
  await trashRow.getByRole('button', { name: 'Restaurar' }).click();
  await expect(trashRow.getByRole('button', { name: 'Lixeira' })).toBeVisible();
  await window.uncheck('#show-trashed');

  // Duplicate detection
  const dupTitle = `Duplicate ${Date.now()}`;
  await window.evaluate(async (title) => {
    const api = (window as any).cite;
    await api.data.call('library:put', { _id: `dup-a-${Date.now()}`, title });
    await api.data.call('library:put', { _id: `dup-b-${Date.now()}`, title });
  }, dupTitle);
  await window.click('.tools summary');
  await window.click('#duplicates');
  await expect(window.locator('#status')).toContainText('grupo(s) de duplicatas');
  await window.click('#merge-dups');
  await expect(window.locator('#status')).toContainText('mesclada(s)');
  expect(await window.locator('#list li').filter({ hasText: dupTitle }).count()).toBe(1);

  // Edit title inline (the new item is the last one)
  const editedTitle = `${uniqueTitle} edited`;
  const row = window.locator('#list li').last();
  await row.getByRole('button', { name: 'Editar' }).click();
  await row.locator('input:not([type="checkbox"])').fill(editedTitle);
  await row.getByRole('button', { name: 'Salvar' }).click();
  await expect(window.locator('#list')).toContainText(editedTitle);

  // Search filter
  await window.fill('#search', 'nonexistent-xyz');
  await expect(window.locator('#count')).toContainText('0 de');
  await expect(window.locator('#list')).toContainText('Nenhuma referência encontrada');
  await window.fill('#search', '');

  // Import BibTeX
  const bibPath = path.join(os.tmpdir(), `ppd-${Date.now()}.bib`);
  fs.writeFileSync(
    bibPath,
    '@article{bib2026,\n  title = {BibTeX Imported},\n  author = {Silva, G.},\n  year = {2026},\n  journal = {J}\n}\n'
  );
  await window.setInputFiles('#bibfile', bibPath);
  await expect(window.locator('#list')).toContainText('BibTeX Imported');

  // Import RIS
  const risPath = path.join(os.tmpdir(), `ppd-${Date.now()}.ris`);
  fs.writeFileSync(
    risPath,
    'TY  - JOUR\nTI  - RIS Imported\nAU  - Silva, G.\nPY  - 2026\nJO  - J\nER  - \n'
  );
  await window.setInputFiles('#risfile', risPath);
  await expect(window.locator('#list')).toContainText('RIS Imported');

  // Bulk attach two PDFs
  const bulk1 = path.join(os.tmpdir(), `ppd-bulk-1-${Date.now()}.pdf`);
  const bulk2 = path.join(os.tmpdir(), `ppd-bulk-2-${Date.now()}.pdf`);
  makePdf(bulk1, 'Bulk one');
  makePdf(bulk2, 'Bulk two');
  await window.setInputFiles('#file', [bulk1, bulk2]);
  await expect(window.locator('#attachments')).toContainText(path.basename(bulk1));
  await expect(window.locator('#attachments')).toContainText(path.basename(bulk2));

  // Attach a PDF and open the embedded viewer
  const pdfPath = path.join(os.tmpdir(), `ppd-viewer-${Date.now()}.pdf`);
  makePdf(pdfPath);
  await window.setInputFiles('#file', pdfPath);
  await expect(window.locator('#attachments')).toContainText('.pdf');
  const viewerRow = window.locator('#attachments li').filter({ hasText: path.basename(pdfPath) });
  await viewerRow.getByRole('button', { name: 'Visualizar' }).click();
  await expect(window.locator('#viewer')).toBeVisible();
  await expect(window.locator('#pdf-frame')).toHaveAttribute('src', /\.pdf/);
  const frame = window.frameLocator('#pdf-frame');
  await expect
    .poll(
      async () => frame.locator('body').evaluate(() => document.querySelectorAll('canvas').length),
      { timeout: 15000 }
    )
    .toBeGreaterThanOrEqual(1);
  await window.click('#close-viewer');

  // Notes
  await viewerRow.getByRole('button', { name: 'Anotações' }).click();
  await expect(window.locator('#notes-modal')).toBeVisible();
  await expect(window.locator('#notes-title')).toContainText(path.basename(pdfPath));
  await window.fill('#note-page', '1');
  await window.fill('#note-text', 'Important finding');
  await window.click('#add-note');
  await expect(window.locator('#notes-list')).toContainText('p. 1 — Important finding');
  await window.click('#close-notes');
  const allNotes = await window.evaluate(async () => (window as any).cite.data.call('notes:all'));
  expect(allNotes.some((n: any) => n.text === 'Important finding')).toBe(true);

  // Full-text search in notes
  await window.fill('#search', 'Important finding');
  await expect(window.locator('#notes-results')).toContainText('Important finding');
  await window.fill('#search', '');

  // Reopen viewer to see the page-level highlight overlay
  await viewerRow.getByRole('button', { name: 'Visualizar' }).click();
  const frame2 = window.frameLocator('#pdf-frame');
  await frame2.locator('canvas').first().waitFor({ timeout: 15000 });
  await expect(frame2.locator('.hl')).toContainText('Important finding', { timeout: 15000 });

  // Select text and create a highlight from the PDF
  const span = frame2.locator('.textLayer span').first();
  await span.waitFor({ timeout: 15000 });
  await span.selectText();
  await frame2.locator('body').dispatchEvent('mouseup', { clientX: 120, clientY: 120 });
  await frame2.getByRole('button', { name: 'Destacar' }).click();
  await expect(frame2.locator('.hl-rect[title="Highlight me"]').first()).toBeVisible({ timeout: 15000 });

  // Delete key removes the selected reference
  await window.click('#close-viewer');
  const deleteTitle = `Delete key ${Date.now()}`;
  await openCreate(window);
  await window.fill('#title', deleteTitle);
  await window.click('button[type="submit"]');
  const deleteRow = window.locator('#list li').filter({ hasText: deleteTitle });
  await expect(deleteRow).toHaveCount(1);
  await deleteRow.locator('strong').click();
  window.once('dialog', (dialog: any) => dialog.accept());
  await window.keyboard.press('Delete');
  await expect(deleteRow).toHaveCount(0);

  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
