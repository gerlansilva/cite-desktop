const { app, BrowserWindow, Menu, ipcMain, shell, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');
const { attachmentsDir, cleanupOrphans, safeName, saveAttachment } = require('./storage');
const Citations = require('./src/citations');
const BibTeX = require('./src/bibtex');
const I18n = require('./src/i18n');
const t = I18n.t;

const APP_NAME = 'Cite';
const LEGACY_APP_NAME = 'RefDesk';
const STORAGE_CONFIG = process.env.CITE_STORAGE_CONFIG ||
  path.join(app.getPath('appData'), APP_NAME, 'storage.json');
const INTEGRATIONS_CONFIG = process.env.CITE_INTEGRATIONS_CONFIG ||
  path.join(app.getPath('appData'), APP_NAME, 'integrations.json');
const SETTINGS_CONFIG = path.join(app.getPath('userData'), 'settings.json');
let pendingAttachmentRebase = null;
let storageSetup = null;

function samePath(a, b) {
  return path.resolve(a) === path.resolve(b);
}

function readStorageConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(STORAGE_CONFIG, 'utf8'));
    return config && typeof config.storageDir === 'string' ? config : null;
  } catch {
    return null;
  }
}

function readRawStorageConfig() {
  try {
    return JSON.parse(fs.readFileSync(STORAGE_CONFIG, 'utf8')) || {};
  } catch {
    return {};
  }
}

function readLanguage() {
  try {
    const settings = JSON.parse(fs.readFileSync(SETTINGS_CONFIG, 'utf8'));
    return settings.language === 'tet' ? 'tet' : 'pt';
  } catch {
    return 'pt';
  }
}

function writeLanguage(language) {
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_CONFIG, 'utf8')) || {};
  } catch {}
  settings.language = language === 'tet' ? 'tet' : 'pt';
  fs.mkdirSync(path.dirname(SETTINGS_CONFIG), { recursive: true });
  fs.writeFileSync(SETTINGS_CONFIG, JSON.stringify(settings, null, 2));
}

function writeStorageConfig(dir, rebaseFrom = null) {
  const previous = readRawStorageConfig();
  fs.mkdirSync(path.dirname(STORAGE_CONFIG), { recursive: true });
  const payload = { ...previous, storageDir: dir };
  if (rebaseFrom) payload.rebaseFrom = rebaseFrom;
  else delete payload.rebaseFrom;
  fs.writeFileSync(STORAGE_CONFIG, JSON.stringify(payload, null, 2));
}

function readIntegrationsConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(INTEGRATIONS_CONFIG, 'utf8'));
    return config && typeof config === 'object' ? config : {};
  } catch {
    return {};
  }
}

function writeIntegrationsConfig(config) {
  fs.mkdirSync(path.dirname(INTEGRATIONS_CONFIG), { recursive: true });
  fs.writeFileSync(INTEGRATIONS_CONFIG, JSON.stringify(config, null, 2));
}

function encryptToken(token) {
  if (!token) return undefined;
  if (safeStorage.isEncryptionAvailable()) {
    return `v1:${safeStorage.encryptString(token).toString('base64')}`;
  }
  return `plain:${Buffer.from(token, 'utf8').toString('base64')}`;
}

function decryptToken(value) {
  if (!value) return '';
  try {
    if (value.startsWith('v1:')) {
      return safeStorage.decryptString(Buffer.from(value.slice(3), 'base64'));
    }
    if (value.startsWith('plain:')) return Buffer.from(value.slice(6), 'base64').toString('utf8');
  } catch {}
  return '';
}

function githubSettings() {
  const github = readIntegrationsConfig().github || {};
  return {
    repo: github.repo || '',
    branch: github.branch || 'main',
    folder: github.folder || 'cite',
    token: decryptToken(github.token)
  };
}

function githubApiBase() {
  return (process.env.CITE_GITHUB_API || 'https://api.github.com').replace(/\/$/, '');
}

async function githubRequest(url, token, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Cite/0.2.0',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(30000)
  });
  if (res.status === 404) return { notFound: true, response: res };
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub HTTP ${res.status}${text ? `: ${text.slice(0, 180)}` : ''}`);
  }
  return { response: res, json: await res.json().catch(() => null) };
}

async function publishGithubFile({ token, repo, branch, filePath, content, message }) {
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  const url = `${githubApiBase()}/repos/${repo}/contents/${encodedPath}`;
  const existing = await githubRequest(`${url}?ref=${encodeURIComponent(branch)}`, token);
  const body = {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch
  };
  if (existing.json?.sha) body.sha = existing.json.sha;
  const result = await githubRequest(url, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return {
    path: filePath,
    url: result.json?.content?.html_url || `https://github.com/${repo}/blob/${branch}/${filePath}`
  };
}

function githubBibliographyPayload(pubs) {
  const styles = ['ABNT', 'APA', 'MLA', 'Harvard', 'Vancouver', 'Chicago'];
  return {
    version: 1,
    generator: 'Cite',
    generatedAt: new Date().toISOString(),
    styles,
    items: pubs.map((pub) => ({
      id: pub._id,
      type: pub.type || 'article',
      title: pub.title,
      authors: pub.authors || [],
      year: pub.year,
      journal: pub.journal,
      fullJournal: pub.fullJournal,
      volume: pub.volume,
      issue: pub.issue,
      pages: pub.pages,
      doi: pub.doi,
      url: pub.url,
      publisher: pub.publisher,
      place: pub.place,
      issn: pub.issn,
      isbn: pub.isbn,
      conference: pub.conference,
      proceedings: pub.proceedings,
      university: pub.university,
      thesisType: pub.thesisType,
      institution: pub.institution,
      reportNumber: pub.reportNumber,
      website: pub.website,
      accessed: pub.accessed,
      language: pub.language,
      tags: pub.tags || [],
      abstract: pub.abstract,
      citations: Object.fromEntries(styles.map((style) => [style, Citations.format(style, pub)]))
    }))
  };
}

function hasAppData(dir) {
  return ['IndexedDB', 'Local Storage', 'attachments'].some((entry) =>
    fs.existsSync(path.join(dir, entry))
  );
}

function migrateStorage(source, target) {
  if (samePath(source, target) || !hasAppData(source) || hasAppData(target)) return false;
  if (path.resolve(target).startsWith(`${path.resolve(source)}${path.sep}`)) return false;
  fs.mkdirSync(target, { recursive: true });
  const skip = new Set([
    'Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache',
    'ShaderCache', 'SingletonCookie', 'SingletonLock', 'SingletonSocket', 'storage.json'
  ]);
  fs.cpSync(source, target, {
    recursive: true,
    filter: (entry) => !skip.has(path.basename(entry))
  });
  return true;
}

function defaultLibraryDir() {
  return path.resolve(
    process.env.CITE_DEFAULT_STORAGE_DIR || path.join(app.getPath('documents'), 'Cite')
  );
}

function applyStorageChoice(dir) {
  try {
    const target = path.resolve(dir);
    fs.mkdirSync(target, { recursive: true });
    fs.accessSync(target, fs.constants.W_OK);
    const source = storageSetup?.type === 'unwritable' ? storageSetup.path : null;
    const migrated = source ? migrateStorage(source, target) : false;
    writeStorageConfig(target, migrated ? path.join(source, 'attachments') : null);
    app.relaunch();
    app.exit(0);
    return { ok: true, path: target };
  } catch (err) {
    console.error('Falha ao configurar a pasta de dados:', err.message);
    return { ok: false, error: err.message };
  }
}

function prepareStorage() {
  // Testes e execuções isoladas já informam a pasta de dados pelo Chromium.
  if (app.commandLine.hasSwitch('user-data-dir') && process.env.CITE_FORCE_STORAGE_SETUP !== '1') return;

  const source = app.getPath('userData');
  const envDir = process.env.CITE_STORAGE_DIR;
  if (envDir) {
    const dir = path.resolve(envDir);
    fs.mkdirSync(dir, { recursive: true });
    if (migrateStorage(source, dir)) {
      pendingAttachmentRebase = {
        from: path.join(source, 'attachments'),
        to: path.join(dir, 'attachments')
      };
    }
    app.setPath('userData', dir);
    return;
  }

  const config = readStorageConfig();
  if (!config?.storageDir) {
    const dir = defaultLibraryDir();
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      const migrated = migrateStorage(source, dir);
      writeStorageConfig(dir, migrated ? path.join(source, 'attachments') : null);
      app.setPath('userData', dir);
      if (migrated) {
        pendingAttachmentRebase = {
          from: path.join(source, 'attachments'),
          to: path.join(dir, 'attachments')
        };
      }
    } catch (err) {
      storageSetup = { type: 'first-run', path: dir, error: err.message };
    }
    return;
  }

  const dir = path.resolve(config.storageDir);
  try {
    if (!fs.statSync(dir).isDirectory()) throw new Error('not a directory');
    fs.accessSync(dir, fs.constants.W_OK);
  } catch (err) {
    storageSetup = {
      type: fs.existsSync(dir) ? 'unwritable' : 'missing',
      path: dir,
      error: err.message
    };
    return;
  }
  app.setPath('userData', dir);
  if (config.rebaseFrom) {
    pendingAttachmentRebase = {
      from: config.rebaseFrom,
      to: path.join(dir, 'attachments')
    };
  }
}

ipcMain.handle('storage:setup:state', () => ({
  issue: storageSetup,
  defaultPath: defaultLibraryDir()
}));

ipcMain.handle('storage:setup:choose', async (event) => {
  const parent = BrowserWindow.fromWebContents(event.sender);
  const issuePath = storageSetup?.path;
  const options = {
    title: t('Escolha uma pasta para o Cite'),
    buttonLabel: t('Usar esta pasta'),
    defaultPath: issuePath ? path.dirname(issuePath) : app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory']
  };
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths?.length) return { canceled: true };
  return applyStorageChoice(result.filePaths[0]);
});

ipcMain.handle('storage:setup:default', () => applyStorageChoice(defaultLibraryDir()));

ipcMain.handle('storage:setup:quit', () => {
  app.quit();
  return { ok: true };
});

function migrateLegacyUserData() {
  if (app.commandLine.hasSwitch('user-data-dir')) return;
  try {
    const appData = app.getPath('appData');
    const target = path.join(appData, APP_NAME);
    const legacy = path.join(appData, LEGACY_APP_NAME);
    if (!fs.existsSync(legacy)) return;
    const targetHasData = ['IndexedDB', 'Local Storage', 'Preferences'].some((entry) =>
      fs.existsSync(path.join(target, entry))
    );
    if (targetHasData) return;
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(legacy, target);
  } catch (err) {
    console.error('Falha ao migrar os dados do RefDesk:', err.message);
  }
}

app.setName(APP_NAME);
migrateLegacyUserData();
prepareStorage();

let dataWorker = null;
let dataRequestId = 0;
let resolveDataWorkerReady;
const dataWorkerReady = new Promise((resolve) => (resolveDataWorkerReady = resolve));
const pendingDataCalls = new Map();

function createDataWorker() {
  dataWorker = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false
    }
  });
  dataWorker.webContents.on('did-finish-load', () => resolveDataWorkerReady());
  dataWorker.loadFile(path.join(__dirname, 'src', 'data-worker.html'));
}

function dataCall(method, args) {
  return new Promise((resolve, reject) => {
    if (!dataWorker) return reject(new Error('Data worker not ready'));
    const id = ++dataRequestId;
    pendingDataCalls.set(id, { resolve, reject });
    dataWorker.webContents.send('data:request', { id, method, args });
  });
}

ipcMain.on('data:response', (_event, { id, result, error }) => {
  const pending = pendingDataCalls.get(id);
  if (!pending) return;
  pendingDataCalls.delete(id);
  if (error) pending.reject(new Error(error));
  else pending.resolve(result);
});

ipcMain.handle('data:call', (_event, method, args) => dataCall(method, args));

async function reconcileAttachments() {
  try {
    await dataWorkerReady;
    const records = await dataCall('attachments:all');
    const keep = records.map((r) => r.path).filter(Boolean);
    cleanupOrphans(keep, 24 * 60 * 60 * 1000);
  } catch {}
}

function buildSetupMenu() {
  const isMac = process.platform === 'darwin';
  const quit = { role: 'quit', label: t('Sair do Cite') };
  const template = isMac
    ? [
        {
          label: 'Cite',
          submenu: [
            { role: 'about', label: t('Sobre o Cite') },
            { type: 'separator' },
            quit
          ]
        },
        { label: t('Arquivo'), submenu: [quit] }
      ]
    : [{ label: t('Arquivo'), submenu: [quit] }];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createSetupWindow() {
  const win = new BrowserWindow({
    width: 640,
    height: 700,
    minWidth: 520,
    minHeight: 520,
    title: 'Cite',
    backgroundColor: '#f3f6f9',
    webPreferences: {
      preload: path.join(__dirname, 'setup-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile(path.join(__dirname, 'src', 'setup.html'), { query: { lang: readLanguage() } });
  return win;
}

function createWindow() {
  const existing = BrowserWindow.getAllWindows().find(
    (win) => !win.isDestroyed() && win.webContents.getURL().includes('ui.html')
  );
  if (existing) {
    existing.focus();
    return existing;
  }
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 620,
    title: 'Cite',
    backgroundColor: '#f3f6f9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile(path.join(__dirname, 'src', 'ui.html'), { query: { lang: readLanguage() } });
  return win;
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const fileMenu = {
    label: t('Arquivo'),
    submenu: [
      { id: 'open-local', label: t('Abrir biblioteca'), accelerator: 'CmdOrCtrl+O', click: createWindow },
      { type: 'separator' },
      isMac
        ? { role: 'close', label: t('Fechar janela') }
        : { role: 'quit', label: t('Sair do Cite') }
    ]
  };
  const editMenu = {
    label: t('Editar'),
    submenu: [
      { role: 'undo', label: t('Desfazer') },
      { role: 'redo', label: t('Refazer') },
      { type: 'separator' },
      { role: 'cut', label: t('Recortar') },
      { role: 'copy', label: t('Copiar') },
      { role: 'paste', label: t('Colar') },
      { role: 'selectAll', label: t('Selecionar tudo') }
    ]
  };
  const viewMenu = {
    label: t('Visualizar'),
    submenu: [
      { role: 'reload', label: t('Recarregar') },
      { role: 'forceReload', label: t('Forçar recarga') },
      { role: 'toggleDevTools', label: t('Ferramentas de desenvolvedor') },
      { type: 'separator' },
      { role: 'resetZoom', label: t('Zoom real') },
      { role: 'zoomIn', label: t('Ampliar') },
      { role: 'zoomOut', label: t('Reduzir') },
      { type: 'separator' },
      { role: 'togglefullscreen', label: t('Tela cheia') }
    ]
  };
  const windowMenu = {
    label: t('Janela'),
    submenu: [
      { role: 'minimize', label: t('Minimizar') },
      ...(isMac ? [{ role: 'zoom', label: t('Zoom') }] : []),
      { role: 'close', label: t('Fechar') }
    ]
  };
  const helpMenu = {
    label: t('Ajuda'),
    submenu: [
      {
        label: t('Sobre o Cite'),
        click: () =>
          dialog.showMessageBox({
            type: 'info',
            title: 'Cite',
            message: `Cite ${app.getVersion()}`,
            detail: t('Gerenciador de referências local inspirado no Paperpile')
          })
      }
    ]
  };
  const appMenu = {
    label: 'Cite',
    submenu: [
      { role: 'about', label: t('Sobre o Cite') },
      { type: 'separator' },
      { role: 'services', label: t('Serviços') },
      { type: 'separator' },
      { role: 'hide', label: t('Ocultar Cite') },
      { role: 'hideOthers', label: t('Ocultar outros') },
      { role: 'unhide', label: t('Mostrar tudo') },
      { type: 'separator' },
      { role: 'quit', label: t('Sair do Cite') }
    ]
  };
  const template = isMac
    ? [appMenu, fileMenu, editMenu, viewMenu, windowMenu]
    : [fileMenu, editMenu, viewMenu, windowMenu, helpMenu];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  I18n.setLanguage(readLanguage());
  if (storageSetup) {
    buildSetupMenu();
    createSetupWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createSetupWindow();
    });
    return;
  }
  buildMenu();
  createDataWorker();
  await dataWorkerReady;
  if (pendingAttachmentRebase) {
    try {
      await dataCall('attachments:rebasePaths', pendingAttachmentRebase);
      const config = readStorageConfig();
      if (config?.rebaseFrom) writeStorageConfig(config.storageDir, null);
    } catch (err) {
      console.error('Falha ao atualizar os caminhos dos anexos:', err.message);
    }
    pendingAttachmentRebase = null;
  }
  createWindow();
  reconcileAttachments();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.handle('settings:get-language', () => readLanguage());

ipcMain.handle('settings:set-language', (_event, language) => {
  const next = language === 'tet' ? 'tet' : 'pt';
  writeLanguage(next);
  I18n.setLanguage(next);
  buildMenu();
  return next;
});

ipcMain.handle('shell:openPath', (_event, filePath) => shell.openPath(filePath));

ipcMain.handle('shell:openExternal', (_event, url) => {
  if ((process.env.CITE_NO_OPEN || process.env.REFDESK_NO_OPEN) === '1') return { opened: false, url };
  shell.openExternal(url);
  return { opened: true, url };
});

function mapCrossrefWork(m, fallbackDoi = '') {
  const doi = m.DOI || fallbackDoi;
  return {
    _id: `doi-${(doi || crypto.randomUUID()).replace(/[^\w.-]/g, '_')}`,
    citekey: (doi || crypto.randomUUID()).replace(/[^\w.-]/g, '_'),
    type: 'article',
    title: Array.isArray(m.title) ? m.title[0] : m.title,
    authors: (m.author || []).map((a) => [a.given, a.family].filter(Boolean).join(' ')),
    year: m.issued?.['date-parts']?.[0]?.[0],
    journal: Array.isArray(m['container-title']) ? m['container-title'][0] : m['container-title'],
    volume: m.volume,
    issue: m.issue,
    pages: m.page || m['article-number'],
    publisher: m.publisher,
    place: m['publisher-location'],
    issn: Array.isArray(m.ISSN) ? m.ISSN[0] : m.ISSN,
    language: m.language,
    doi: doi || undefined,
    url: m.URL,
    pdf_url: (m.link || [])
      .filter((l) => /application\/pdf/i.test(l['content-type'] || '') && l.URL)
      .map((l) => l.URL)[0],
    abstract: m.abstract ? String(m.abstract).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : undefined
  };
}

function mergeMetadata(...sources) {
  const merged = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source || {})) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value) && !value.length) continue;
      if (merged[key] === undefined || merged[key] === '') merged[key] = value;
    }
  }
  return merged;
}

async function lookupCrossrefMetadata(doi) {
  if (!doi) return null;
  const base = process.env.CITE_CROSSREF_URL || process.env.REFDESK_CROSSREF_URL || 'https://api.crossref.org/works';
  try {
    const res = await request(`${base}/${encodeURIComponent(doi)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return mapCrossrefWork(json.message || {}, doi);
  } catch {
    return null;
  }
}

const NETWORK_TIMEOUT_MS = 20000;

function request(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: { 'User-Agent': 'Cite/0.2.0', ...(options.headers || {}) },
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS)
  });
}

ipcMain.handle('doi:lookup', async (_event, doi) => {
  const base = process.env.CITE_CROSSREF_URL || process.env.REFDESK_CROSSREF_URL || 'https://api.crossref.org/works';
  const res = await request(`${base}/${encodeURIComponent(doi)}`);
  if (!res.ok) throw new Error(`Falha na consulta do DOI: HTTP ${res.status}`);
  const json = await res.json();
  return mapCrossrefWork(json.message || {}, doi);
});

ipcMain.handle('doi:search', async (_event, query) => searchCrossref(query));

const TRANSLATE_LANGUAGES = new Set(['pt', 'en', 'es', 'fr', 'de', 'it', 'ja', 'zh', 'tet']);

async function translateText(text, target) {
  const value = String(text || '').trim();
  if (!value) return '';
  if (value.length > 5000) throw new Error('O trecho selecionado é longo demais para tradução.');
  const language = TRANSLATE_LANGUAGES.has(String(target || '')) ? String(target) : 'pt';
  const configuredUrl = process.env.CITE_TRANSLATE_URL;
  if (configuredUrl) {
    const res = await request(`${configuredUrl}?q=${encodeURIComponent(value)}&target=${encodeURIComponent(language)}`);
    if (!res.ok) throw new Error(`Falha na tradução: HTTP ${res.status}`);
    const json = await res.json();
    const translated = json.translatedText || json.translation || json.text;
    if (!translated) throw new Error('A tradução não retornou texto.');
    return String(translated);
  }
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(language)}` +
    `&dt=t&q=${encodeURIComponent(value)}`;
  const res = await request(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
    }
  });
  if (!res.ok) throw new Error(`Falha na tradução: HTTP ${res.status}`);
  const json = await res.json();
  const translated = (json?.[0] || []).map((part) => part?.[0] || '').join('');
  if (!translated) throw new Error('A tradução não retornou texto.');
  return translated;
}

ipcMain.handle('translation:translate', async (_event, { text, target } = {}) =>
  translateText(text, target)
);

const SEARCH_PAGE_SIZE = 10;

function searchPageOptions(offset, limit) {
  const parsedOffset = Number(offset);
  const parsedLimit = Number(limit);
  return {
    start: Number.isFinite(parsedOffset) && parsedOffset > 0 ? Math.floor(parsedOffset) : 0,
    size:
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(50, Math.floor(parsedLimit))
        : SEARCH_PAGE_SIZE
  };
}

async function searchCrossref(query, options = {}) {
  const base = process.env.CITE_CROSSREF_URL || process.env.REFDESK_CROSSREF_URL || 'https://api.crossref.org/works';
  if (!query || !String(query).trim()) return [];
  const { start, size } = searchPageOptions(options.offset, options.limit);
  const res = await request(
    `${base}?query.bibliographic=${encodeURIComponent(query)}&rows=${size}&offset=${start}&select=DOI,title,author,issued,container-title,volume,issue,page,publisher,URL,abstract,link`
  );
  if (!res.ok) throw new Error(`Falha na busca no Crossref: HTTP ${res.status}`);
  const json = await res.json();
  return (json.message?.items || []).map((m) => mapCrossrefWork(m));
}

function parseArxivEntries(xml) {
  const pick = (entry, tag) => {
    const match = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
    return match ? match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : undefined;
  };
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => {
    const entry = match[1];
    const id = pick(entry, 'id') || '';
    const arxivId = id.match(/\/abs\/(.+)$/)?.[1];
    const published = pick(entry, 'published') || '';
    const authors = [...entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/g)].map((a) =>
      a[1].replace(/\s+/g, ' ').trim()
    );
    return {
      _id: `arxiv-${id.split('/').pop() || crypto.randomUUID()}`,
      citekey: `arxiv-${id.split('/').pop() || crypto.randomUUID()}`,
      title: pick(entry, 'title'),
      authors,
      year: published.slice(0, 4) || undefined,
      journal: pick(entry, 'arxiv:journal_ref') || 'arXiv',
      doi: pick(entry, 'arxiv:doi'),
      url: id,
      pdf_url: arxivId ? `https://arxiv.org/pdf/${arxivId}` : undefined,
      abstract: pick(entry, 'summary')
    };
  });
}

async function searchArxiv(query, options = {}) {
  if (!query || !String(query).trim()) return [];
  const base = process.env.CITE_ARXIV_URL || process.env.REFDESK_ARXIV_URL || 'https://export.arxiv.org/api/query';
  const { start, size } = searchPageOptions(options.offset, options.limit);
  const url = `${base}?search_query=all:${encodeURIComponent(query)}&start=${start}&max_results=${size}`;
  const res = await request(url);
  if (!res.ok) throw new Error(`Falha na busca no arXiv: HTTP ${res.status}`);
  return parseArxivEntries(await res.text());
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseGoogleScholar(html, limit = SEARCH_PAGE_SIZE) {
  const blocks = html.split('<div class="gs_r ').slice(1);
  return blocks
    .slice(0, limit)
    .map((block) => {
      const heading = block.match(/<h3 class="gs_rt"[^>]*>([\s\S]*?)<\/h3>/);
      const link = heading?.[1].match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      const title = stripHtml(link ? link[2] : heading?.[1] || '');
      if (!title) return null;
      const meta = stripHtml(block.match(/<div class="gs_a">([\s\S]*?)<\/div>/)?.[1] || '');
      const abstract = stripHtml(block.match(/<div class="gs_rs">([\s\S]*?)<\/div>/)?.[1] || '') || undefined;
      const year = meta.match(/\b(?:19|20)\d{2}\b/)?.[0];
      const segments = meta.split(' - ');
      let journal;
      if (segments.length > 1) {
        const sourcePart = segments.slice(1).find((part) => /\b(?:19|20)\d{2}\b/.test(part)) || segments[1];
        journal = sourcePart.replace(/,?\s*(?:19|20)\d{2}\b/, '').replace(/[,;\s]+$/, '').trim() || undefined;
      }
      const authorPart = segments[0] || '';
      const authors = authorPart
        ? authorPart
            .split(',')
            .map((name) => name.replace(/…/g, '').trim())
            .filter(Boolean)
        : [];
      let url = link ? stripHtml(link[1]) : undefined;
      if (url?.startsWith('/')) url = `https://scholar.google.com${url}`;
      if (url) {
        try {
          const parsed = new URL(url);
          if (/scholar\.google\./i.test(parsed.hostname) && parsed.pathname.includes('scholar_url')) {
            url = parsed.searchParams.get('url') || url;
          }
        } catch {}
      }
      const pdfHref = block.match(/<div class="gs_or_ggsm"[^>]*>\s*<a[^>]*href="([^"]+)"/)?.[1];
      let pdfUrl = pdfHref ? stripHtml(pdfHref) : undefined;
      if (pdfUrl?.startsWith('/')) pdfUrl = `https://scholar.google.com${pdfUrl}`;
      const originalPdfUrl = pdfUrl;
      if (pdfUrl) {
        try {
          const parsed = new URL(pdfUrl);
          if (/scholar\.google\./i.test(parsed.hostname) && parsed.pathname.includes('scholar_url')) {
            pdfUrl = parsed.searchParams.get('url') || pdfUrl;
          }
        } catch {}
      }
      if (!pdfUrl && url && /\.pdf(?:$|[?#])/i.test(url)) pdfUrl = url;
      const key = crypto.createHash('sha1').update(url || title).digest('hex').slice(0, 12);
      return {
        _id: `google-${key}`,
        citekey: `google-${key}`,
        type: 'article',
        title,
        authors,
        year,
        journal,
        url,
        pdf_url: pdfUrl,
        pdf_url_alt: originalPdfUrl && originalPdfUrl !== pdfUrl ? originalPdfUrl : undefined,
        abstract
      };
    })
    .filter(Boolean);
}

async function searchGoogleScholar(query, options = {}) {
  if (!query || !String(query).trim()) return [];
  const base = process.env.CITE_GOOGLE_SCHOLAR_URL || 'https://scholar.google.com/scholar';
  const { start, size } = searchPageOptions(options.offset, options.limit);
  const url = `${base}?hl=pt-BR&as_sdt=0,5&start=${start}&num=${size}&q=${encodeURIComponent(query)}`;
  const res = await request(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
    }
  });
  if (!res.ok) throw new Error(`Falha na busca no Google Acadêmico: HTTP ${res.status}`);
  const html = await res.text();
  if (/unusual traffic|not a robot|recaptcha|captcha/i.test(html)) {
    throw new Error('O Google Acadêmico pediu verificação. Tente novamente mais tarde ou use outra base.');
  }
  return parseGoogleScholar(html, size);
}

async function searchPubMed(query, options = {}) {
  if (!query || !String(query).trim()) return [];
  const base = process.env.CITE_PUBMED_URL || process.env.REFDESK_PUBMED_URL || 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
  const { start, size } = searchPageOptions(options.offset, options.limit);
  const searchRes = await request(
    `${base}/esearch.fcgi?db=pubmed&retmode=json&retstart=${start}&retmax=${size}&term=${encodeURIComponent(query)}`
  );
  if (!searchRes.ok) throw new Error(`Falha na busca no PubMed: HTTP ${searchRes.status}`);
  const searchJson = await searchRes.json();
  const ids = searchJson.esearchresult?.idlist || [];
  if (!ids.length) return [];

  const summaryRes = await request(`${base}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`);
  if (!summaryRes.ok) throw new Error(`Falha nos detalhes do PubMed: HTTP ${summaryRes.status}`);
  const summaryJson = await summaryRes.json();
  return ids.map((id) => {
    const item = summaryJson.result?.[id] || {};
    const pmcid = (item.articleids || []).find((a) => a.idtype === 'pmc')?.value;
    return {
      _id: `pubmed-${id}`,
      citekey: `pubmed-${id}`,
      title: item.title,
      authors: (item.authors || []).map((a) => a.name),
      year: (item.pubdate || item.epubdate || '').slice(0, 4) || undefined,
      journal: item.fulljournalname || item.source,
      volume: item.volume,
      issue: item.issue,
      pages: item.pages,
      doi: (item.articleids || []).find((a) => a.idtype === 'doi')?.value,
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      pdf_url: pmcid ? `https://europepmc.org/articles/${pmcid}?pdf=render` : undefined
    };
  });
}

ipcMain.handle('metadata:search', async (_event, { source, query, offset, limit } = {}) => {
  const options = { offset, limit };
  if (source === 'arxiv') return searchArxiv(query, options);
  if (source === 'pubmed') return searchPubMed(query, options);
  if (source === 'google') return searchGoogleScholar(query, options);
  return searchCrossref(query, options);
});

ipcMain.handle('metadata:lookup', async (_event, { doi, url } = {}) => {
  let result = {};
  if (url && /^https?:/i.test(url)) {
    try {
      const res = await request(url, { headers: { Accept: 'text/html,application/xhtml+xml' } });
      if (res.ok) {
        const html = await res.text();
        result = mergeMetadata(result, htmlCitationMetadata(html));
      }
    } catch {}
  }
  const targetDoi = doi || result.doi;
  if (targetDoi) {
    const crossref = await lookupCrossrefMetadata(targetDoi);
    if (crossref) result = mergeMetadata(result, crossref);
  }
  if (!result.title && !result.doi) {
    throw new Error(t('Não foi possível obter metadados deste DOI ou endereço.'));
  }
  return result;
});

ipcMain.handle('integrations:github:get', async () => {
  const settings = githubSettings();
  return {
    repo: settings.repo,
    branch: settings.branch,
    folder: settings.folder,
    hasToken: Boolean(settings.token)
  };
});

ipcMain.handle('integrations:github:save', async (_event, payload = {}) => {
  const current = readIntegrationsConfig();
  const repo = String(payload.repo || '').trim();
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) throw new Error('Use o repositório no formato usuario/repositorio.');
  const github = {
    repo,
    branch: String(payload.branch || 'main').trim() || 'main',
    folder: String(payload.folder || 'cite').replace(/^\/+|\/+$/g, '') || 'cite'
  };
  const token = String(payload.token || '').trim();
  if (token) github.token = encryptToken(token);
  else if (current.github?.token) github.token = current.github.token;
  writeIntegrationsConfig({ ...current, github });
  return {
    repo: github.repo,
    branch: github.branch,
    folder: github.folder,
    hasToken: Boolean(github.token)
  };
});

ipcMain.handle('integrations:github:publish', async () => {
  const settings = githubSettings();
  if (!settings.repo || !settings.token) {
    throw new Error('Configure o repositório e o token do GitHub antes de publicar.');
  }
  const pubs = (await dataCall('library:all')).filter((pub) => !pub.trashed);
  const folder = settings.folder.replace(/^\/+|\/+$/g, '');
  const jsonPath = `${folder}/bibliography.json`;
  const bibPath = `${folder}/references.bib`;
  const payload = JSON.stringify(githubBibliographyPayload(pubs), null, 2);
  const bib = BibTeX.toBibtex(pubs);
  const stamp = new Date().toISOString();
  const files = [];
  files.push(
    await publishGithubFile({
      ...settings,
      filePath: jsonPath,
      content: `${payload}\n`,
      message: `Cite: atualizar bibliografia (${stamp})`
    })
  );
  files.push(
    await publishGithubFile({
      ...settings,
      filePath: bibPath,
      content: `${bib}\n`,
      message: `Cite: atualizar BibTeX (${stamp})`
    })
  );
  return {
    repo: settings.repo,
    branch: settings.branch,
    folder,
    count: pubs.length,
    files,
    repoUrl: `https://github.com/${settings.repo}`
  };
});

function pdfFileName(name) {
  const base = String(name || 'artigo').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'artigo';
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}

function looksLikePdf(buffer) {
  if (!buffer?.length) return false;
  return buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'));
}

function htmlPageTitle(html) {
  const meta = html.match(
    /<meta[^>]+(?:name|property)=["'](?:citation_title|og:title|dc\.title)["'][^>]+content=["']([^"']+)["']/i
  ) || html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:citation_title|og:title|dc\.title)["']/i
  );
  if (meta?.[1]) return meta[1].replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? title.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
}

function metaContents(html, names) {
  const values = [];
  const namePattern = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["'](?:${namePattern})["'][^>]+content=["']([^"']*)["']`, 'gi'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:${namePattern})["']`, 'gi')
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html))) {
      const value = match[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
      if (value && !values.includes(value)) values.push(value);
    }
  }
  return values;
}

function htmlCitationMetadata(html) {
  const authors = metaContents(html, ['citation_author', 'dc.creator']);
  const date =
    metaContents(html, [
      'citation_publication_date',
      'dc.date.issued',
      'citation_date',
      'dc.date'
    ])[0] || '';
  const year = date.match(/\d{4}/)?.[0];
  const firstPage = metaContents(html, ['citation_firstpage', 'dc.identifier.firstpage'])[0];
  const lastPage = metaContents(html, ['citation_lastpage', 'dc.identifier.lastpage'])[0];
  const pageNumber = metaContents(html, ['dc.identifier.pagenumber', 'citation_pages'])[0];
  const pages =
    pageNumber || (firstPage ? (lastPage && lastPage !== firstPage ? `${firstPage}-${lastPage}` : firstPage) : lastPage);
  const conference = metaContents(html, ['citation_conference_title'])[0];
  return {
    type: conference ? 'conference' : 'article',
    title: metaContents(html, ['citation_title', 'dc.title', 'og:title'])[0] || htmlPageTitle(html),
    authors,
    year,
    journal: metaContents(html, ['citation_journal_title', 'dc.source'])[0],
    conference,
    volume: metaContents(html, ['citation_volume', 'dc.source.volume'])[0],
    issue: metaContents(html, ['citation_issue', 'dc.source.issue'])[0],
    pages,
    issn: metaContents(html, ['citation_issn', 'dc.source.issn'])[0],
    isbn: metaContents(html, ['citation_isbn'])[0],
    publisher: metaContents(html, ['citation_publisher'])[0],
    language: metaContents(html, ['citation_language', 'dc.language'])[0],
    doi: metaContents(html, ['citation_doi', 'dc.identifier.doi', 'dc.identifier']).find((v) => /^10\./.test(v)),
    url:
      metaContents(html, ['citation_public_url', 'dc.identifier.uri', 'og:url'])[0] || undefined,
    abstract: metaContents(html, ['citation_abstract', 'dc.description'])[0]
  };
}

function pdfLinksFromHtml(html, baseUrl) {
  const links = [];
  const patterns = [
    /<meta[^>]+(?:name|property)=["']citation_pdf_url["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']citation_pdf_url["']/gi,
    /<link[^>]+type=["']application\/pdf["'][^>]+href=["']([^"']+)["']/gi,
    /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/pdf["']/gi,
    /href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) && links.length < 8) {
      try {
        const absolute = new URL(match[1].replace(/&amp;/g, '&'), baseUrl).href;
        if (/^https?:/i.test(absolute) && !links.includes(absolute)) links.push(absolute);
      } catch {}
    }
  }
  return links;
}

async function fetchPdfCandidate(url, depth = 0) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(t('Endereço de PDF inválido.'));
  }
  if (!/^https?:$/i.test(parsed.protocol)) throw new Error(t('Endereço de PDF inválido.'));
  const res = await fetch(parsed.href, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Cite/0.2.0', Accept: 'application/pdf,text/html;q=0.9,*/*;q=0.8' },
    signal: AbortSignal.timeout(60000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = String(res.headers.get('content-type') || '').toLowerCase();
  const length = Number(res.headers.get('content-length') || 0);
  if (length > 100 * 1024 * 1024) throw new Error(t('PDF muito grande.'));
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 100 * 1024 * 1024) throw new Error(t('PDF muito grande.'));
  if (looksLikePdf(buf)) return { buffer: buf, url: res.url || parsed.href };
  if (type.includes('text/html') || /<html[\s>]/i.test(buf.subarray(0, 2048).toString('utf8'))) {
    if (depth >= 1) throw new Error(t('O link abriu uma página, não um PDF.'));
    const html = buf.subarray(0, 2 * 1024 * 1024).toString('utf8');
    const links = pdfLinksFromHtml(html, res.url || parsed.href);
    let metadata = htmlCitationMetadata(html);
    if (metadata.doi) {
      const crossref = await lookupCrossrefMetadata(metadata.doi);
      if (crossref) metadata = mergeMetadata(metadata, crossref);
    }
    let lastError = null;
    for (const link of links) {
      try {
        const result = await fetchPdfCandidate(link, depth + 1);
        return {
          ...result,
          type: metadata.type,
          title: result.title || metadata.title,
          authors: result.authors?.length ? result.authors : metadata.authors,
          year: result.year || metadata.year,
          journal: result.journal || metadata.journal,
          conference: result.conference || metadata.conference,
          volume: result.volume || metadata.volume,
          issue: result.issue || metadata.issue,
          pages: result.pages || metadata.pages,
          issn: result.issn || metadata.issn,
          isbn: result.isbn || metadata.isbn,
          publisher: result.publisher || metadata.publisher,
          place: result.place || metadata.place,
          language: result.language || metadata.language,
          abstract: result.abstract || metadata.abstract,
          doi: result.doi || metadata.doi,
          url: result.url || metadata.url
        };
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error(t('O link abriu uma página, não um PDF.'));
  }
  throw new Error(t('O arquivo baixado não é um PDF.'));
}

async function downloadPdfBuffer(url) {
  return (await fetchPdfCandidate(url)).buffer;
}

async function openAccessPdfCandidates(doi) {
  if (!doi) return [];
  const base = process.env.CITE_OPENALEX_URL || 'https://api.openalex.org';
  try {
    const res = await request(`${base}/works?filter=doi:${encodeURIComponent(doi)}&per-page=1`);
    if (!res.ok) return [];
    const json = await res.json();
    const work = json.results?.[0];
    if (!work) return [];
    const out = [];
    for (const loc of [work.best_oa_location, ...(work.locations || [])]) {
      if (!loc) continue;
      if (loc.pdf_url) out.push(loc.pdf_url);
      if (loc.landing_page_url && /\.pdf(?:$|[?#])/i.test(loc.landing_page_url)) out.push(loc.landing_page_url);
    }
    if (work.open_access?.oa_url && /\.pdf(?:$|[?#])/i.test(work.open_access.oa_url)) out.push(work.open_access.oa_url);
    return [...new Set(out)];
  } catch {
    return [];
  }
}

ipcMain.handle('pdf:download', async (_event, { url, altUrl, doi, name } = {}) => {
  const candidates = [];
  if (/^https?:/i.test(url || '')) candidates.push(url);
  if (/^https?:/i.test(altUrl || '')) candidates.push(altUrl);
  candidates.push(...(await openAccessPdfCandidates(doi)));
  const attempted = [...new Set(candidates.filter(Boolean))];
  if (!attempted.length) {
    throw new Error(t('Este resultado não informa um PDF de acesso aberto. Use “Anexar PDF” para escolher um arquivo baixado manualmente.'));
  }
  let lastError = null;
  for (const candidate of attempted) {
    try {
      const found = await fetchPdfCandidate(candidate);
      const fileName = pdfFileName(name);
      const saved = saveAttachment(fileName, found.buffer);
      return {
        ok: true,
        ...saved,
        name: fileName,
        url: found.url || candidate,
        type: found.type,
        title: found.title || name,
        authors: found.authors,
        year: found.year,
        journal: found.journal,
        conference: found.conference,
        volume: found.volume,
        issue: found.issue,
        pages: found.pages,
        issn: found.issn,
        isbn: found.isbn,
        publisher: found.publisher,
        place: found.place,
        language: found.language,
        abstract: found.abstract,
        doi: found.doi
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    t('Não foi possível baixar o PDF automaticamente{details}. O artigo pode estar protegido ou o link pode ter expirado. Use “Anexar PDF” para escolher o arquivo.', {
      details: lastError?.message ? ` (${lastError.message})` : ''
    })
  );
});

function defaultBackupName() {
  const stamp = new Date().toISOString().slice(0, 10);
  return `cite-backup-${stamp}.json.gz`;
}

async function createBackup(targetPath) {
  await dataWorkerReady;
  let filePath = targetPath || process.env.CITE_BACKUP_PATH || process.env.REFDESK_BACKUP_PATH;
  if (!filePath) {
    const result = await dialog.showSaveDialog({
      title: t('Fazer backup da biblioteca'),
      defaultPath: path.join(app.getPath('documents'), defaultBackupName()),
      filters: [{ name: t('Backup do Cite'), extensions: ['gz'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    filePath = result.filePath;
  }

  const data = await dataCall('db:export');
  const attachments = {};
  for (const fileName of fs.readdirSync(attachmentsDir())) {
    attachments[fileName] = fs.readFileSync(path.join(attachmentsDir(), fileName)).toString('base64');
  }
  const payload = { version: 1, createdAt: new Date().toISOString(), data, attachments };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, zlib.gzipSync(Buffer.from(JSON.stringify(payload))));
  return {
    ok: true,
    path: filePath,
    references: data.Library?.length || 0,
    attachments: Object.keys(attachments).length
  };
}

async function restoreBackup(sourcePath) {
  await dataWorkerReady;
  let filePath = sourcePath || process.env.CITE_RESTORE_PATH || process.env.REFDESK_RESTORE_PATH;
  if (!filePath) {
    const result = await dialog.showOpenDialog({
      title: t('Restaurar biblioteca do Cite'),
      properties: ['openFile'],
      filters: [{ name: t('Backup do Cite'), extensions: ['gz', 'json'] }]
    });
    if (result.canceled || !result.filePaths?.length) return { canceled: true };
    filePath = result.filePaths[0];
  }

  const raw = fs.readFileSync(filePath);
  const payload = JSON.parse(
    (filePath.endsWith('.gz') ? zlib.gunzipSync(raw) : raw).toString('utf8')
  );
  if (!payload?.data) throw new Error(t('Arquivo de backup inválido'));

  for (const fileName of fs.readdirSync(attachmentsDir())) {
    fs.unlinkSync(path.join(attachmentsDir(), fileName));
  }
  for (const [fileName, base64] of Object.entries(payload.attachments || {})) {
    fs.writeFileSync(path.join(attachmentsDir(), fileName), Buffer.from(base64, 'base64'));
  }
  await dataCall('db:import', payload.data);
  return {
    ok: true,
    path: filePath,
    references: payload.data.Library?.length || 0,
    attachments: Object.keys(payload.attachments || {}).length
  };
}

ipcMain.handle('backup:create', (_event, targetPath) => createBackup(targetPath));
ipcMain.handle('backup:restore', (_event, sourcePath) => restoreBackup(sourcePath));

ipcMain.handle('annotations:export', async (_event, { content, defaultName } = {}) => {
  let filePath = process.env.CITE_EXPORT_PATH;
  if (!filePath) {
    const result = await dialog.showSaveDialog({
      title: t('Exportar anotações'),
      defaultPath: path.join(app.getPath('documents'), defaultName || 'cite-anotacoes.md'),
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: t('Texto'), extensions: ['txt'] }
      ]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    filePath = result.filePath;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, String(content || ''), 'utf8');
  return { ok: true, path: filePath };
});

ipcMain.handle('pdf:openWindow', (_event, filePath) => {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    title: t('Visualizador de PDF'),
    webPreferences: { sandbox: true }
  });
  win.loadFile(filePath);
  return { ok: true };
});

app.on('window-all-closed', () => {
  app.quit();
});
