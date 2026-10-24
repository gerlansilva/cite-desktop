import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';

function get(url: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = https.get(url, { rejectUnauthorized: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
  });
}

test('installs the local Word add-in from the home screen', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cite-word-setup-'));
  const profile = path.join(root, 'profile');
  const storageDir = path.join(root, 'Cite');
  const configPath = path.join(root, 'storage.json');
  const wefDir = path.join(root, 'wef');
  const port = 23211;

  const app = await electron.launch({
    args: ['.', `--user-data-dir=${profile}`],
    cwd: process.cwd(),
    env: {
      ...process.env,
      CITE_FORCE_STORAGE_SETUP: '1',
      CITE_STORAGE_CONFIG: configPath,
      CITE_DEFAULT_STORAGE_DIR: storageDir,
      CITE_WORD_ADDIN_DIR: path.join(root, 'addin'),
      CITE_WORD_WEF_DIR: wefDir,
      CITE_WORD_TRUST: 'skip',
      CITE_WORD_PORT: String(port),
      CITE_NO_OPEN: '1'
    }
  });

  let home: any;
  for (let i = 0; i < 120; i++) {
    home = app.windows().find((w: any) => w.url().includes('home.html'));
    if (home) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!home) throw new Error('home window not found');
  await home.waitForLoadState('domcontentloaded');

  await expect(home.locator('#word-status')).toContainText('Ainda não instalado no Word');
  await home.click('#word-install');
  await expect(home.locator('#word-status')).toContainText(`Instalado · https://localhost:${port}`, { timeout: 20000 });
  await expect(home.locator('#word-install')).toHaveText('Reinstalar');

  const manifestPath = path.join(wefDir, 'cite-word.xml');
  expect(fs.existsSync(manifestPath)).toBe(true);
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  expect(manifest).toContain(`https://localhost:${port}/taskpane.html`);
  expect(manifest).not.toContain('__PORT__');

  const ping = await get(`https://localhost:${port}/ping`);
  expect(ping.status).toBe(200);
  expect(JSON.parse(ping.body).app).toBe('Cite');

  const pane = await get(`https://localhost:${port}/taskpane.html`);
  expect(pane.status).toBe(200);
  expect(pane.body).toContain('Biblioteca do Cite');

  await app.evaluate(({ app: electronApp }) => electronApp.quit());
  await app.close();
  fs.rmSync(root, { recursive: true, force: true });
});
