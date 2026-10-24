import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function launchSetup(env: Record<string, string> = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cite-setup-profile-'));
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${profile}`],
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
      CITE_FORCE_STORAGE_SETUP: '1',
      CITE_NO_OPEN: '1'
    }
  });

  const windowFor = async (part: string) => {
    for (let i = 0; i < 120; i++) {
      const found = app.windows().find((w) => w.url().includes(part));
      if (found) return found;
      await new Promise((r) => setTimeout(r, 100));
    }
    return undefined;
  };

  const window = await windowFor('setup.html');
  if (window) await window.waitForLoadState('domcontentloaded');
  return { app, window, windowFor };
}

test('deleted library shows the recovery screen instead of failing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cite-setup-missing-'));
  const missingDir = path.join(root, 'biblioteca-apagada');
  const configPath = path.join(root, 'storage.json');
  fs.writeFileSync(configPath, JSON.stringify({ storageDir: missingDir }));

  const { app, window, windowFor } = await launchSetup({ CITE_STORAGE_CONFIG: configPath });
  if (!window) throw new Error('setup window not found');

  await expect(window.locator('#title')).toContainText('não está mais acessível');
  await expect(window.locator('#path')).toHaveText(missingDir);
  await expect(window.locator('#default')).toBeVisible();
  await expect(window.locator('#choose')).toBeVisible();
  expect(await windowFor('ui.html')).toBeUndefined();
  expect(fs.existsSync(missingDir)).toBe(false);

  await app.evaluate(({ app: electronApp }) => electronApp.quit());
  await app.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test('first run creates the default library and opens an empty library', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cite-setup-default-'));
  const libraryDir = path.join(root, 'Cite');
  const configPath = path.join(root, 'storage.json');

  const { app } = await launchSetup({
    CITE_STORAGE_CONFIG: configPath,
    CITE_DEFAULT_STORAGE_DIR: libraryDir
  });

  let window: any;
  for (let i = 0; i < 120; i++) {
    window = app.windows().find((w) => w.url().includes('ui.html'));
    if (window) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!window) throw new Error('library window not found');

  await window.waitForLoadState('domcontentloaded');
  await expect(window.locator('#list')).toContainText('Sua biblioteca está vazia');
  expect(fs.existsSync(libraryDir)).toBe(true);
  expect(JSON.parse(fs.readFileSync(configPath, 'utf8')).storageDir).toBe(libraryDir);

  await app.evaluate(({ app: electronApp }) => electronApp.quit());
  await app.close();
  fs.rmSync(root, { recursive: true, force: true });
});
