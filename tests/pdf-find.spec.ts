import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { makePdf } from './pdf';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function makeTallPdf(filePath: string, text: string) {
  const stream = `BT /F1 14 Tf 1 0 0 1 20 1900 Tm (${text} top) Tj 1 0 0 1 20 100 Tm (${text} bottom) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 2000] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf +=
    `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  fs.writeFileSync(filePath, pdf);
  return filePath;
}

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

test('find in PDF highlights matches and navigates', async () => {
  const app = await launchApp();
  const window = await openLocal(app);

  const pdfPath = path.join(os.tmpdir(), `cite-find-${Date.now()}.pdf`);
  makePdf(pdfPath, 'Findable formation information');
  await window.setInputFiles('#file', pdfPath);
  const row = window.locator('#attachments li').filter({ hasText: path.basename(pdfPath) });
  await expect(row).toContainText(path.basename(pdfPath));
  await row.getByRole('button', { name: 'Visualizar' }).click();

  const frame = window.frameLocator('#pdf-frame');
  await frame.locator('canvas').first().waitFor({ timeout: 15000 });
  await expect(frame.locator('.textLayer span').first()).toContainText('Findable');
  await frame.locator('#find-input').fill('Findable');
  await expect(frame.locator('#find-count')).toContainText('1 de 1', { timeout: 10000 });
  await expect(frame.locator('mark.find-hit').first()).toHaveText('Findable');
  await expect(frame.locator('mark.find-hit.current')).toHaveCount(1);

  await frame.locator('#find-input').fill('absent-term');
  await expect(frame.locator('#find-count')).toContainText('0 resultados');

  // Do not match a query in the middle of a larger word (formation ≠ information).
  await frame.locator('#find-input').fill('formation');
  await expect(frame.locator('#find-count')).toContainText('1 de 1');
  await expect(frame.locator('mark.find-hit')).toHaveCount(1);
  await expect(frame.locator('mark.find-hit')).toHaveText('formation');

  await app.evaluate(({ app }) => app.quit());
  await app.close();
});

test('find navigation keeps the current hit in view', async () => {
  const app = await launchApp();
  const window = await openLocal(app);

  const pdfPath = path.join(os.tmpdir(), `cite-find-tall-${Date.now()}.pdf`);
  makeTallPdf(pdfPath, 'Findable');
  await window.setInputFiles('#file', pdfPath);
  const row = window.locator('#attachments li').filter({ hasText: path.basename(pdfPath) });
  await expect(row).toContainText(path.basename(pdfPath));
  await row.getByRole('button', { name: 'Visualizar' }).click();

  const frame = window.frameLocator('#pdf-frame');
  await frame.locator('canvas').first().waitFor({ timeout: 15000 });
  await expect(frame.locator('.textLayer span').first()).toContainText('Findable');
  await frame.locator('#find-input').fill('Findable');
  await expect(frame.locator('#find-count')).toContainText('1 de 2', { timeout: 10000 });

  await frame.locator('#find-input').press('Enter');
  await expect(frame.locator('#find-count')).toContainText('2 de 2');
  const visible = await frame.locator('body').evaluate(() => {
    const hit = document.querySelector('mark.find-hit.current') as HTMLElement | null;
    const main = document.querySelector('#main') as HTMLElement | null;
    if (!hit || !main) return false;
    const hitRect = hit.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    return hitRect.bottom > mainRect.top && hitRect.top < mainRect.bottom;
  });
  expect(visible).toBe(true);

  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
