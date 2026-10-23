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
  await window.waitForFunction(() => Boolean((window as any).cite));
  return window;
}

async function chooseLanguage(window: any, language: 'pt' | 'tet') {
  await window.click(`.lang-btn[data-lang="${language}"]`).catch(() => {});
  await window.waitForTimeout(600);
  await window.waitForFunction(() => Boolean((window as any).cite));
}

test('interface can be switched to Tetun Dili and keeps user data intact', async () => {
  const app = await launchApp();
  const window = await openLocal(app);

  await window.evaluate(async () => {
    await (window as any).cite.data.call('library:put', {
      _id: 'tet-data',
      title: 'Livro',
      authors: ['Silva, G.'],
      tags: ['Verde']
    });
  });
  await window.fill('#search', 'Livro');
  await window.fill('#search', '');

  await chooseLanguage(window, 'tet');

  await expect(window.locator('#view-title')).toHaveText('Referénsia hotu');
  await expect(window.locator('.sidebar-head > span')).toHaveText('Biblioteka');
  await expect(window.locator('#search')).toHaveAttribute('placeholder', 'Buka iha biblioteka');
  await expect(window.locator('.tools > summary')).toContainText('Ferramenta sira');
  await expect(window.locator('.footer-credit')).toHaveText(
    "Ferramenta ne'e dezenvolve husi Gerlan Silva da Silva, doutorandu iha Edukasaun iha Universidade Federal de São Carlos (UFSCar)."
  );
  await expect(window.locator('#orcid-link')).toHaveAttribute(
    'href', 'https://orcid.org/0000-0002-9996-9983'
  );
  await expect(window.locator('#list')).toContainText('Livro');
  await expect(window.locator('#list')).not.toContainText('Livru');
  expect(await window.evaluate(() => (window as any).cite.settings.getLanguage())).toBe('tet');

  const menuLabels = await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()?.items.map((item: any) => item.label)
  );
  expect(menuLabels).toContain('Arkivu');

  await window.reload();
  await window.waitForFunction(() => Boolean((window as any).cite));
  await expect(window.locator('#search')).toHaveAttribute('placeholder', 'Buka iha biblioteka');

  await chooseLanguage(window, 'pt');
  await expect(window.locator('#view-title')).toHaveText('Todas as referências');
  await expect(window.locator('#search')).toHaveAttribute('placeholder', 'Pesquisar biblioteca');
  await expect(window.locator('.footer-credit')).toHaveText(
    'Ferramenta desenvolvida por Gerlan Silva da Silva, doutorando em Educação na Universidade Federal de São Carlos (UFSCar).'
  );

  await app.evaluate(({ app }) => app.quit());
  await app.close();
});
