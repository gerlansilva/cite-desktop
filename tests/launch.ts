import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function openCreate(window: any) {
  if (!(await window.locator('#create-modal').isVisible())) {
    await window.click('#add-menu-button');
    await window.click('#create-new');
    await window.locator('#create-modal').waitFor({ state: 'visible' });
  }
}

export async function launchApp(env: Record<string, string> = {}, options: { userDataDir?: string } = {}) {
  const userDataDir = options.userDataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'ppd-test-'));
  return electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env: { ...process.env, CITE_SKIP_HOME: '1', ...env }
  });
}
