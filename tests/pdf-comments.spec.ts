import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { makePdf } from './pdf';
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
  return window;
}

test('comments stay anchored to PDF highlights and can be edited', async () => {
  const exportPath = path.join(os.tmpdir(), `cite-export-${Date.now()}.md`);
  const app = await launchApp({ CITE_EXPORT_PATH: exportPath });
  const window = await openLocal(app);

  const pdfPath = path.join(os.tmpdir(), `cite-comment-${Date.now()}.pdf`);
  makePdf(pdfPath, 'Commentable sentence');
  await window.setInputFiles('#file', pdfPath);
  const row = window.locator('#attachments li').filter({ hasText: path.basename(pdfPath) });
  await row.getByRole('button', { name: 'Visualizar' }).click();

  const frame = window.frameLocator('#pdf-frame');
  await frame.locator('canvas').first().waitFor({ timeout: 15000 });
  const span = frame.locator('.textLayer span').first();
  await expect(span).toContainText('Commentable');
  await span.selectText();
  await frame.locator('body').dispatchEvent('mouseup', { clientX: 120, clientY: 120 });
  await frame.getByRole('button', { name: 'Comentar' }).click();
  await expect(frame.locator('#comment-editor')).toBeVisible();
  await frame.locator('#comment-text').fill('Meu comentário ancorado');
  await frame.locator('#comment-save').click();

  await expect(frame.locator('.comment-badge')).toHaveCount(1);
  await expect(frame.locator('.hl-rect[title="Meu comentário ancorado"]')).toHaveCount(1);
  await expect(frame.locator('#ann-list')).toContainText('Commentable sentence');
  await expect(frame.locator('#ann-list')).toContainText('Meu comentário ancorado');
  await expect(frame.locator('#ann-count')).toHaveText('(1)');
  await expect(frame.locator('#comments-panel')).toBeVisible();
  await expect(frame.locator('#comment-cards')).toContainText('Meu comentário ancorado');
  await expect(frame.locator('#comment-cards')).not.toContainText('Commentable sentence');
  const annotationFont = await frame
    .locator('.ann-quote')
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const commentFont = await frame
    .locator('.comment-panel-text')
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(annotationFont).toBeGreaterThanOrEqual(14);
  expect(commentFont).toBeGreaterThanOrEqual(14);
  await frame.locator('#collapse-comments').click();
  await expect(frame.locator('#comments-panel')).toBeHidden();
  await frame.locator('#comment-tool').click();
  await expect(frame.locator('#comments-panel')).toBeVisible();

  const saved = await window.evaluate(async () => (window as any).cite.data.call('notes:all'));
  const note = saved.find((n: any) => n.comment === 'Meu comentário ancorado');
  expect(note).toBeTruthy();
  expect(note.text).toBe('Commentable sentence');
  expect(note.page).toBe('1');
  expect(Array.isArray(note.rects)).toBe(true);
  expect(note.rects.length).toBeGreaterThan(0);

  await frame.locator('.comment-badge').click();
  await expect(frame.locator('#comment-text')).toHaveValue('Meu comentário ancorado');
  await frame.locator('#comment-menu-button').click();
  await frame.locator('.comment-color[data-color="#f7b6d2"]').click();
  await expect(frame.locator('.hl-rect').first()).toHaveCSS('background-color', 'rgb(247, 182, 210)');
  await expect(frame.locator('.ann-card').first()).toHaveAttribute('data-color', '#f7b6d2');
  await expect(frame.locator('.comment-panel-card').first()).toHaveAttribute('data-color', '#f7b6d2');
  await frame.locator('#comment-text').fill('Comentário atualizado');
  await frame.locator('#comment-save').click();
  await expect(frame.locator('#ann-list')).toContainText('Comentário atualizado');

  // Changing the color from the annotation card updates the PDF and the comments panel.
  await frame.locator('.ann-card .note-color-button').first().click();
  await frame.locator('.note-color-menu [data-color="#9ed7f7"]').click();
  await expect(frame.locator('.hl-rect').first()).toHaveCSS('background-color', 'rgb(158, 215, 247)');
  await expect(frame.locator('.ann-card').first()).toHaveAttribute('data-color', '#9ed7f7');
  await expect(frame.locator('.comment-panel-card').first()).toHaveAttribute('data-color', '#9ed7f7');

  // And the reverse: changing it from the comments panel updates the annotation and the PDF.
  await frame.locator('.comment-panel-card .note-color-button').first().click();
  await frame.locator('.note-color-menu [data-color="#a7e8a7"]').click();
  await expect(frame.locator('.hl-rect').first()).toHaveCSS('background-color', 'rgb(167, 232, 167)');
  await expect(frame.locator('.ann-card').first()).toHaveAttribute('data-color', '#a7e8a7');
  await expect(frame.locator('.comment-panel-card').first()).toHaveAttribute('data-color', '#a7e8a7');

  await frame.locator('#export-annotations-button').click();
  await expect.poll(() => fs.existsSync(exportPath), { timeout: 5000 }).toBe(true);
  const exported = fs.readFileSync(exportPath, 'utf8');
  expect(exported).toContain('Commentable sentence');
  expect(exported).toContain('Comentário atualizado');
  expect(exported).toContain('Página 1');

  await frame.locator('#hide-annotations').click();
  await expect(frame.locator('#annotations')).toBeHidden();
  await frame.locator('#show-annotations').click();
  await expect(frame.locator('#annotations')).toBeVisible();
  await frame.locator('.ann-card').first().click();
  await expect(frame.locator('#comment-editor')).toBeVisible();
  await expect(frame.locator('#comment-text')).toHaveValue('Comentário atualizado');
  await frame.locator('#comment-cancel').click();

  await window.click('#close-viewer');
  await window.fill('#search', 'Comentário atualizado');
  await expect(window.locator('#notes-results')).toContainText('Comentário atualizado');
  await window.fill('#search', '');
  await row.getByRole('button', { name: 'Visualizar' }).click();
  const frame2 = window.frameLocator('#pdf-frame');
  await frame2.locator('canvas').first().waitFor({ timeout: 15000 });
  await frame2.locator('.comment-badge').waitFor({ timeout: 15000 });
  await expect(frame2.locator('#ann-list')).toContainText('Comentário atualizado');
  await frame2.locator('.comment-badge').click();
  await frame2.locator('#comment-editor').press('Delete');
  await expect(frame2.locator('.comment-badge')).toHaveCount(0);
  await expect(frame2.locator('#ann-list')).toContainText('Selecione um trecho');

  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
