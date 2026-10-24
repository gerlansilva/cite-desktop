import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function launch(profile: string, configPath: string, libraryDir: string) {
  return electron.launch({
    args: ['.', `--user-data-dir=${profile}`],
    cwd: process.cwd(),
    env: {
      ...process.env,
      CITE_FORCE_STORAGE_SETUP: '1',
      CITE_STORAGE_CONFIG: configPath,
      CITE_DEFAULT_STORAGE_DIR: libraryDir,
      CITE_NO_OPEN: '1'
    }
  });
}

async function windowFor(app: any, part: string) {
  for (let i = 0; i < 120; i++) {
    const found = app.windows().find((w: any) => w.url().includes(part));
    if (found) return found;
    await new Promise((r) => setTimeout(r, 100));
  }
  return undefined;
}

test('home screen shows the library and starts the main actions', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cite-home-'));
  const profile = path.join(root, 'profile');
  const libraryDir = path.join(root, 'Cite');
  const configPath = path.join(root, 'storage.json');

  let app = await launch(profile, configPath, libraryDir);
  let home = await windowFor(app, 'home.html');
  if (!home) throw new Error('home window not found');
  await home.waitForLoadState('domcontentloaded');

  await expect(home.locator('h1')).toContainText('Bem-vindo ao Cite');
  await expect(home.locator('#library-stats')).toHaveText('0 referências');
  await expect(home.locator('#library-path')).toHaveText(libraryDir);
  await expect(home.locator('#recent-empty')).toBeVisible();

  await home.click('#new-reference');
  const library = await windowFor(app, 'ui.html');
  if (!library) throw new Error('library window not found');
  await library.waitForLoadState('domcontentloaded');
  await expect(library.locator('#create-modal')).toBeVisible();

  const title = `Referência inicial ${Date.now()}`;
  await library.fill('#title', title);
  await library.fill('#authors', 'Silva, Gerlan');
  await library.fill('#year', '2026');
  await library.click('button[type="submit"]');
  await expect(library.locator('#list')).toContainText(title);

  await app.evaluate(({ app: electronApp }) => electronApp.quit());
  await app.close();

  app = await launch(profile, configPath, libraryDir);
  home = await windowFor(app, 'home.html');
  if (!home) throw new Error('home window not found after restart');
  await home.waitForLoadState('domcontentloaded');
  await expect(home.locator('#library-stats')).toHaveText('1 referência');
  await expect(home.locator('#recent-list')).toContainText(title);

  await home.locator('#recent-list .recent-item').first().click();
  const reopenedLibrary = await windowFor(app, 'ui.html');
  if (!reopenedLibrary) throw new Error('library window not found from the recent list');
  await reopenedLibrary.waitForLoadState('domcontentloaded');
  await expect(reopenedLibrary.locator('#pub-details')).toContainText(title);

  await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById('open-home')?.click());
  const reopenedHome = await windowFor(app, 'home.html');
  if (!reopenedHome) throw new Error('home window not found from the menu');
  await expect(reopenedHome.locator('h1')).toContainText('Bem-vindo ao Cite');

  await app.evaluate(({ app: electronApp }) => electronApp.quit());
  await app.close();
  fs.rmSync(root, { recursive: true, force: true });
});
