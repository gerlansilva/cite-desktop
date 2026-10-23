const { _electron } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppd-preview-'));
  const app = await _electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: path.join(__dirname, '..')
  });
  await app.firstWindow();
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById('open-local')?.click());
  let win;
  for (let i = 0; i < 100; i++) {
    win = app.windows().find((w) => w.url().includes('ui.html'));
    if (win) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!win) throw new Error('local window not found');
  await win.waitForLoadState('domcontentloaded');

  await win.evaluate(async () => {
    const api = window.cite;
    const thesis = await api.data.call('collections:save', { name: 'Tese' });
    await api.data.call('collections:save', { name: 'Aprendizado de máquina', cParent: thesis._id });
    await api.data.call('collections:save', { name: 'Para ler' });
    const pubs = [
      {
        _id: 'demo-1',
        title: 'Attention Is All You Need',
        authors: ['Vaswani, A.', 'Shazeer, N.', 'Parmar, N.'],
        year: '2017',
        journal: 'NeurIPS',
        folder: 'Aprendizado de máquina',
        starred: true,
        doi: '10.48550/arXiv.1706.03762'
      },
      {
        _id: 'demo-2',
        title: 'BERT: Pre-training of Deep Bidirectional Transformers',
        authors: ['Devlin, J.', 'Chang, M.-W.', 'Lee, K.'],
        year: '2019',
        journal: 'NAACL',
        folder: 'Aprendizado de máquina',
        doi: '10.18653/v1/N19-1423'
      },
      {
        _id: 'demo-3',
        title: 'Deep Residual Learning for Image Recognition',
        authors: ['He, K.', 'Zhang, X.', 'Ren, S.'],
        year: '2016',
        journal: 'CVPR',
        folder: 'Para ler'
      },
      {
        _id: 'demo-4',
        title: 'The Structure of Scientific Revolutions',
        authors: ['Kuhn, T. S.'],
        year: '1962',
        journal: 'University of Chicago Press',
        folder: 'Tese',
        abstract: 'A study of how scientific paradigms change over time.'
      }
    ];
    for (const pub of pubs) await api.data.call('library:put', pub);
  });

  await win.fill('#search', 'e');
  await win.fill('#search', '');
  await win.locator('#list li').first().locator('strong').click();
  await win.setViewportSize({ width: 1440, height: 900 });
  fs.mkdirSync(path.join(__dirname, '..', 'dist'), { recursive: true });
  await win.screenshot({ path: path.join(__dirname, '..', 'dist', 'ui-preview.png') });

  await app.evaluate(({ app }) => app.quit());
  await app.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
