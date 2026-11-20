const api = window.cite;
const assetVersion = new URL(document.currentScript?.src || location.href).searchParams.get('v') || '';
const i18n = window.CiteI18n;
const t = i18n?.t || ((text) => text);

async function saveTextFile(content, name, filter) {
  if (api.files?.saveText) {
    const result = await api.files.saveText({ content, name, filter });
    return result || { canceled: true };
  }
  const blob = new Blob([content], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  return { ok: true };
}
const listEl = document.getElementById('list');
const notesResultsEl = document.getElementById('notes-results');
const notesPanelEl = document.getElementById('notes-panel');
const attachmentsEl = document.getElementById('attachments');
const countEl = document.getElementById('count');
const statusEl = document.getElementById('status');
const viewerEl = document.getElementById('viewer');
const pdfFrame = document.getElementById('pdf-frame');
const searchEl = document.getElementById('search');
const folderFilterEl = document.getElementById('folder-filter');
const showTrashedEl = document.getElementById('show-trashed');
const collectionNameEl = document.getElementById('collection-name');
const collectionParentEl = document.getElementById('collection-parent');
const collectionsListEl = document.getElementById('collections-list');
const tagsSectionEl = document.getElementById('tags-section');
const tagsListEl = document.getElementById('tags-list');
const moveTargetEl = document.getElementById('move-target');
const sortSelectEl = document.getElementById('sort-select');
const viewTitleEl = document.getElementById('view-title');
const pubDetailsEl = document.getElementById('pub-details');
const folderOptionsEl = document.getElementById('folder-options');
const filterPanelEl = document.getElementById('filter-panel');
const createModal = document.getElementById('create-modal');
const pasteModal = document.getElementById('paste-modal');
const integrationsModal = document.getElementById('integrations-modal');
let currentView = 'all';
let selectedPubId = null;
const CITATION_STYLES = ['ABNT', 'APA', 'MLA', 'Harvard', 'Vancouver', 'Chicago'];
const savedCitationStyle = localStorage.getItem('cite-citation-style');
let citationStyle = CITATION_STYLES.includes(savedCitationStyle) ? savedCitationStyle : 'APA';
const COLLECTION_COLORS = ['#0052CC', '#22C55E', '#3B82F6', '#EF6B5B', '#D9C9A7', '#8B5CF6', '#F59E0B', '#EC4899'];
let collectionColorMenu = null;

const THEME_KEY = 'cite-theme';
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = themeToggle.querySelector('use');

function pathToFileUrl(filePath) {
  const normalized = String(filePath).replace(/\\/g, '/');
  const absolute = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `file://${encodeURI(absolute).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
}

function fileUrlToPath(fileUrl) {
  try {
    const url = new URL(fileUrl);
    if (url.protocol !== 'file:') return fileUrl;
    const decoded = decodeURIComponent(url.pathname);
    if (/^\/[A-Za-z]:\//.test(decoded)) {
      return decoded.slice(1).replace(/\//g, '\\');
    }
    if (url.hostname) {
      return `\\\\${url.hostname}${decoded.replace(/\//g, '\\')}`;
    }
    return decoded;
  } catch {
    return fileUrl;
  }
}

function storedTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyTheme(theme, options = {}) {
  const value = theme === 'dark' ? 'dark' : 'light';
  const { persist = true, notifyViewer = true, announce = false } = options;
  document.documentElement.dataset.theme = value;
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch {}
  }
  themeIcon.setAttribute('href', value === 'dark' ? '#i-sun' : '#i-moon');
  themeToggle.title = value === 'dark' ? t('Tema claro') : t('Tema escuro');
  themeToggle.setAttribute('aria-label', themeToggle.title);
  themeToggle.dataset.theme = value;
  if (notifyViewer && pdfFrame?.contentWindow) {
    pdfFrame.contentWindow.postMessage({ type: 'ppd-theme', theme: value }, '*');
  }
  if (announce) {
    statusEl.textContent = t(value === 'dark' ? 'Tema escuro ativo' : 'Tema claro ativo');
  }
}

applyTheme(storedTheme(), { persist: false });
themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', { announce: true });
});

function defaultCollectionColor(name) {
  let hash = 0;
  for (const char of String(name || '')) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return COLLECTION_COLORS[hash % COLLECTION_COLORS.length];
}

function collectionColor(col) {
  return /^#[0-9a-f]{6}$/i.test(String(col?.color || ''))
    ? col.color
    : defaultCollectionColor(col?.name);
}

function closeCollectionColorMenu() {
  collectionColorMenu?.remove();
  collectionColorMenu = null;
}

function openCollectionColorMenu(anchor, col, currentColor) {
  closeCollectionColorMenu();
  const menu = document.createElement('div');
  menu.className = 'collection-color-menu';
  menu.setAttribute('role', 'menu');
  for (const color of COLLECTION_COLORS) {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.className = 'collection-color-choice';
    choice.dataset.color = color;
    choice.style.background = color;
    choice.title = t('Cor da coleção');
    choice.setAttribute('aria-label', t('Cor da coleção'));
    if (color === currentColor) choice.classList.add('selected');
    choice.onclick = async (event) => {
      event.stopPropagation();
      closeCollectionColorMenu();
      await api.data.call('collections:save', { ...col, color });
      await refresh();
    };
    menu.appendChild(choice);
  }
  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  const width = menu.offsetWidth || 124;
  const height = menu.offsetHeight || 76;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const top = rect.bottom + 6 + height > window.innerHeight - 8
    ? Math.max(8, rect.top - height - 6)
    : rect.bottom + 6;
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  collectionColorMenu = menu;
  setTimeout(() => {
    document.addEventListener('mousedown', (event) => {
      if (!menu.contains(event.target)) closeCollectionColorMenu();
    }, { once: true });
  }, 0);
}
const PUB_TYPE_LABELS = {
  article: t('Artigo de periódico'),
  book: t('Livro'),
  chapter: t('Capítulo de livro'),
  conference: t('Artigo de conferência'),
  thesis: t('Tese ou dissertação'),
  report: t('Relatório'),
  webpage: t('Página da web'),
  newspaper: t('Artigo de jornal'),
  magazine: t('Artigo de revista')
};
const PUB_TYPE_FIELDS = {
  article: ['journal', 'volume', 'issue', 'pages', 'issn'],
  book: ['publisher', 'place', 'edition', 'isbn', 'pages'],
  chapter: ['bookTitle', 'editors', 'publisher', 'place', 'edition', 'pages', 'isbn'],
  conference: ['conference', 'proceedings', 'place', 'publisher', 'pages'],
  thesis: ['university', 'thesisType', 'place', 'pages'],
  report: ['institution', 'reportNumber', 'place', 'pages'],
  webpage: ['website', 'accessed'],
  newspaper: ['journal', 'place', 'section', 'pages'],
  magazine: ['journal', 'volume', 'issue', 'pages', 'issn']
};
const EDIT_COMMON_FIELDS = ['title', 'authors', 'year', 'language', 'doi', 'url', 'folder', 'tags'];
const EDIT_TYPE_FIELDS = [...new Set(Object.values(PUB_TYPE_FIELDS).flat())];
const EDIT_FIELD_LABELS = {
  journal: t('Periódico'),
  volume: t('Volume'),
  issue: t('Número'),
  pages: t('Páginas'),
  issn: 'ISSN',
  publisher: t('Editora'),
  place: t('Local'),
  edition: t('Edição'),
  isbn: 'ISBN',
  bookTitle: t('Título do livro'),
  editors: t('Editores'),
  conference: t('Evento'),
  proceedings: t('Anais'),
  university: t('Universidade'),
  thesisType: t('Tipo de tese'),
  institution: t('Instituição'),
  reportNumber: t('Número do relatório'),
  website: t('Site'),
  accessed: t('Acesso em'),
  section: t('Seção')
};
let currentTag = null;
let currentFilter = null;
let expandedPubId = null;
let lastRefreshData = { items: [], allNotes: [], allAttachments: [] };
const searchInclude = {
  abstract: localStorage.getItem('cite-search-abstract') !== '0',
  notes: localStorage.getItem('cite-search-notes') !== '0',
  pdf: localStorage.getItem('cite-search-pdf') !== '0'
};
const notesModal = document.getElementById('notes-modal');
const editModal = document.getElementById('edit-modal');
const searchModal = document.getElementById('search-modal');
const searchResultsEl = document.getElementById('search-results');
const searchQueryEl = document.getElementById('search-query');
let editingPub = null;
const notesList = document.getElementById('notes-list');
const notesTitle = document.getElementById('notes-title');
const noteText = document.getElementById('note-text');
let currentAttachment = null;
let pendingPub = null;

function icon(name, cls = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', cls);
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

function closeMenus(except) {
  for (const menu of document.querySelectorAll('.menu')) {
    if (menu !== except) menu.hidden = true;
  }
  document.getElementById('add-menu-button')?.setAttribute('aria-expanded', 'false');
}

function toggleMenu(button, menu) {
  const willOpen = menu.hidden;
  closeMenus(menu);
  menu.hidden = !willOpen;
  button?.setAttribute('aria-expanded', String(willOpen));
}

function openCreateModal() {
  closeMenus();
  createModal.hidden = false;
  document.getElementById('title').focus();
}

function openSearchModal() {
  closeMenus();
  searchModal.hidden = false;
  searchQueryEl.focus();
}

function esc(value) {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

async function extractPdfText(file) {
  try {
    if (!window.PdfText) return undefined;
    const buffer = await file.arrayBuffer();
    const text = await window.PdfText.extractText(new Uint8Array(buffer));
    return text || undefined;
  } catch {
    return undefined;
  }
}

async function renderNotes() {
  if (!currentAttachment) return;
  const notes = await api.data.call('notes:list', currentAttachment);
  notesList.innerHTML = '';
  for (const note of notes) {
    const li = document.createElement('li');
    if (note.color) {
      li.style.background = note.color;
      li.style.padding = '4px';
      li.style.borderRadius = '4px';
    }
    const quote = document.createElement('div');
    quote.textContent = `${note.page ? `p. ${note.page} — ` : ''}${note.text} `;
    li.appendChild(quote);
    if (note.comment) {
      const comment = document.createElement('div');
      comment.className = 'note-comment';
      comment.textContent = t('Comentário: {text}', { text: note.comment });
      li.appendChild(comment);
    }
    const del = document.createElement('button');
    del.textContent = t('Excluir');
    del.className = 'secondary';
    del.onclick = async () => {
      await api.data.call('notes:delete', note._id);
      await renderNotes();
    };
    li.appendChild(del);
    notesList.appendChild(li);
  }
}

document.getElementById('close-notes').onclick = () => (notesModal.hidden = true);
document.getElementById('add-note').onclick = async () => {
  if (!currentAttachment || !noteText.value.trim()) return;
  await api.data.call('notes:add', {
    attachment_id: currentAttachment,
    page: document.getElementById('note-page').value || undefined,
    color: document.getElementById('note-color').value,
    type: 'highlight',
    text: noteText.value.trim(),
    created_at: Date.now()
  });
  noteText.value = '';
  document.getElementById('note-page').value = '';
  await renderNotes();
};
document.getElementById('close-viewer').onclick = () => {
  viewerEl.hidden = true;
  pdfFrame.src = 'about:blank';
};

// Collapsible side panels
const sidebarEl = document.getElementById('sidebar');
const detailsPanelEl = document.getElementById('details-panel');
const showSidebarButton = document.getElementById('show-sidebar');
const showDetailsButton = document.getElementById('show-details');
function setSidebarCollapsed(collapsed) {
  sidebarEl.classList.toggle('collapsed', collapsed);
  showSidebarButton.hidden = !collapsed;
  localStorage.setItem('cite-sidebar-collapsed', collapsed ? '1' : '0');
}
function setDetailsCollapsed(collapsed) {
  detailsPanelEl.classList.toggle('collapsed', collapsed);
  showDetailsButton.hidden = !collapsed;
  localStorage.setItem('cite-details-collapsed', collapsed ? '1' : '0');
}
document.getElementById('collapse-sidebar').onclick = () => setSidebarCollapsed(true);
document.getElementById('show-sidebar').onclick = () => setSidebarCollapsed(false);
document.getElementById('collapse-details').onclick = () => setDetailsCollapsed(true);
document.getElementById('show-details').onclick = () => setDetailsCollapsed(false);
setSidebarCollapsed(localStorage.getItem('cite-sidebar-collapsed') === '1');
setDetailsCollapsed(localStorage.getItem('cite-details-collapsed') === '1');

// Menus and quick actions
const addMenuButton = document.getElementById('add-menu-button');
const addMenu = document.getElementById('add-menu');
const searchMenu = document.getElementById('search-menu');
addMenuButton.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleMenu(addMenuButton, addMenu);
});
document.getElementById('search-options').addEventListener('click', (event) => {
  event.stopPropagation();
  toggleMenu(document.getElementById('search-options'), searchMenu);
});
document.getElementById('menu-upload').onclick = () => {
  closeMenus();
  document.getElementById('file').click();
};
document.getElementById('create-new').onclick = openCreateModal;
document.getElementById('menu-search').onclick = openSearchModal;
document.getElementById('menu-paste').onclick = () => {
  closeMenus();
  pasteModal.hidden = false;
  document.getElementById('paste-text').focus();
};
document.getElementById('menu-pdf-url').onclick = () => {
  closeMenus();
  document.getElementById('url-modal').hidden = false;
  document.getElementById('pdf-url').focus();
};
document.getElementById('close-url').onclick = () => (document.getElementById('url-modal').hidden = true);
document.getElementById('import-pdf-url').onclick = () => {
  const url = document.getElementById('pdf-url').value.trim();
  if (!url) return;
  importPdfFromUrl(url)
    .then(() => {
      document.getElementById('url-modal').hidden = true;
      document.getElementById('pdf-url').value = '';
    })
    .catch(() => {});
};
document.getElementById('pdf-url').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    document.getElementById('import-pdf-url').click();
  }
});
document.getElementById('menu-import').onclick = () => {
  closeMenus();
  document.getElementById('bibfile').click();
};
document.getElementById('search-online-item').onclick = openSearchModal;
document.getElementById('search-quick').onclick = () => {
  closeMenus();
  searchEl.focus();
};
function insertSearchToken(token, select = false) {
  const current = searchEl.value;
  const prefix = current && !current.endsWith(' ') ? ' ' : '';
  searchEl.value = `${current}${prefix}${token}`;
  searchEl.focus();
  const start = searchEl.value.length - (select ? 0 : token.length);
  searchEl.setSelectionRange(start, searchEl.value.length);
  closeMenus();
}
document.querySelectorAll('[data-search-field]').forEach((chip) => {
  chip.onclick = () => insertSearchToken(`${chip.dataset.searchField}:`, true);
});
document.getElementById('search-phrase').onclick = () => {
  const value = searchEl.value.trim();
  searchEl.value = value ? `"${value.replace(/^"|"$/g, '')}"` : '""';
  searchEl.focus();
  const start = searchEl.value.length - 1;
  searchEl.setSelectionRange(start, start);
  closeMenus();
};
document.getElementById('search-exclude').onclick = () => {
  if (!searchEl.value.trim().startsWith('-')) searchEl.value = `-${searchEl.value}`;
  searchEl.focus();
  closeMenus();
};
for (const [id, key, storageKey] of [
  ['include-abstract', 'abstract', 'cite-search-abstract'],
  ['include-notes', 'notes', 'cite-search-notes'],
  ['include-pdf', 'pdf', 'cite-search-pdf']
]) {
  const box = document.getElementById(id);
  box.checked = searchInclude[key];
  box.onchange = () => {
    searchInclude[key] = box.checked;
    localStorage.setItem(storageKey, box.checked ? '1' : '0');
    refresh().catch(() => {});
  };
}
document.getElementById('close-create').onclick = () => (createModal.hidden = true);
document.getElementById('close-paste').onclick = () => (pasteModal.hidden = true);
document.getElementById('close-integrations').onclick = () => (integrationsModal.hidden = true);

function setGithubStatus(message, isError = false) {
  const status = document.getElementById('github-status');
  status.textContent = message;
  status.style.color = isError ? '#b42318' : '';
}

function updateGithubBibliographyUrl(repo, branch, folder) {
  const input = document.getElementById('github-bibliography-url');
  const button = document.getElementById('copy-github-url');
  if (!repo) {
    input.hidden = true;
    button.hidden = true;
    return;
  }
  const cleanFolder = String(folder || 'cite').replace(/^\/+|\/+$/g, '');
  input.value = `https://raw.githubusercontent.com/${repo}/${branch || 'main'}/${cleanFolder}/bibliography.json`;
  input.hidden = false;
  button.hidden = false;
}

async function loadGithubSettings() {
  const repoButton = document.getElementById('open-github-repo');
  try {
    const settings = await api.integrations.github.get();
    document.getElementById('github-repo').value = settings.repo || '';
    document.getElementById('github-branch').value = settings.branch || 'main';
    document.getElementById('github-folder').value = settings.folder || 'cite';
    document.getElementById('github-token').value = '';
    document.getElementById('github-token').placeholder = settings.hasToken
      ? t('Token salvo — deixe em branco para manter')
      : t('Token do GitHub (contents: write)');
    repoButton.hidden = !settings.repo;
    updateGithubBibliographyUrl(settings.repo, settings.branch, settings.folder);
  } catch (err) {
    setGithubStatus(t('erro ao carregar configuração: {msg}', { msg: err.message }), true);
  }
}

document.getElementById('open-integrations').onclick = async () => {
  closeMenus();
  integrationsModal.hidden = false;
  setGithubStatus('');
  await loadGithubSettings();
};

document.getElementById('save-github').onclick = async () => {
  setGithubStatus(t('salvando…'));
  try {
    const settings = await api.integrations.github.save({
      repo: document.getElementById('github-repo').value,
      branch: document.getElementById('github-branch').value,
      folder: document.getElementById('github-folder').value,
      token: document.getElementById('github-token').value
    });
    document.getElementById('github-repo').value = settings.repo;
    document.getElementById('github-branch').value = settings.branch;
    document.getElementById('github-folder').value = settings.folder;
    document.getElementById('github-token').value = '';
    document.getElementById('github-token').placeholder = settings.hasToken
      ? t('Token salvo — deixe em branco para manter')
      : t('Token do GitHub (contents: write)');
    document.getElementById('open-github-repo').hidden = false;
    updateGithubBibliographyUrl(settings.repo, settings.branch, settings.folder);
    setGithubStatus(t('configuração salva'));
  } catch (err) {
    setGithubStatus(t('erro ao salvar: {msg}', { msg: err.message }), true);
  }
};

document.getElementById('publish-github').onclick = async () => {
  const button = document.getElementById('publish-github');
  button.disabled = true;
  setGithubStatus(t('publicando biblioteca…'));
  try {
    const result = await api.integrations.github.publish();
    document.getElementById('open-github-repo').hidden = false;
    updateGithubBibliographyUrl(result.repo, result.branch, result.folder);
    setGithubStatus(
      t('{n} referência(s) publicada(s) em {repo}/{folder} ({branch}).', {
        n: result.count,
        repo: result.repo,
        folder: result.folder,
        branch: result.branch
      })
    );
  } catch (err) {
    setGithubStatus(t('erro ao publicar: {msg}', { msg: err.message }), true);
  } finally {
    button.disabled = false;
  }
};

document.getElementById('open-github-repo').onclick = () => {
  const repo = document.getElementById('github-repo').value.trim();
  if (repo) api.shell.openExternal(`https://github.com/${repo}`);
};
document.getElementById('copy-github-url').onclick = async () => {
  const value = document.getElementById('github-bibliography-url').value;
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    setGithubStatus(t('URL copiada'));
  } catch {
    document.getElementById('github-bibliography-url').select();
    setGithubStatus(t('selecione e copie a URL'));
  }
};
document.getElementById('close-notes-2').onclick = () => (notesModal.hidden = true);
document.getElementById('cancel-edit-2').onclick = () => {
  editModal.hidden = true;
  editingPub = null;
};
document.getElementById('paste-import').onclick = async () => {
  const text = document.getElementById('paste-text').value.trim();
  if (!text) return;
  try {
    if (/^TY\s{2}-/m.test(text)) {
      const entries = window.RIS.parseRIS(text);
      for (const entry of entries) await api.data.call('library:put', entry);
      statusEl.textContent = t('{n} referência(s) importada(s)', { n: entries.length });
    } else if (/^@\w+\s*[{(]/m.test(text)) {
      const entries = window.BibTeX.parseBibtex(text);
      for (const entry of entries) await api.data.call('library:put', entry);
      statusEl.textContent = t('{n} referência(s) importada(s)', { n: entries.length });
    } else {
      const doi = text.match(/10\.\d{4,9}\/[-._;()/:a-z0-9]+/i)?.[0];
      if (doi) {
        const pub = await api.doi.lookup(doi);
        await api.data.call('library:put', pub);
        statusEl.textContent = t('DOI adicionado');
      } else {
        const url = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => /^https?:\/\//i.test(line));
        if (!url) throw new Error(t('Não encontrei um DOI, link, BibTeX ou RIS válido.'));
        await importPdfFromUrl(url);
      }
    }
    document.getElementById('paste-text').value = '';
    pasteModal.hidden = true;
    await refresh();
  } catch (err) {
    statusEl.textContent = t('erro ao colar: {msg}', { msg: err.message });
  }
};

const selectMenu = document.getElementById('select-menu');
document.getElementById('select-menu-button').addEventListener('click', (event) => {
  event.stopPropagation();
  toggleMenu(document.getElementById('select-menu-button'), selectMenu);
});
document.getElementById('select-all-item').onclick = () => {
  document.querySelectorAll('#list input.select-pub').forEach((box) => (box.checked = true));
  document.getElementById('select-all').checked = true;
  closeMenus();
};
document.getElementById('clear-selection-item').onclick = () => {
  document.querySelectorAll('#list input.select-pub').forEach((box) => (box.checked = false));
  document.getElementById('select-all').checked = false;
  closeMenus();
};
document.getElementById('select-all').addEventListener('change', (event) => {
  document.querySelectorAll('#list input.select-pub').forEach((box) => (box.checked = event.target.checked));
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.menu, #add-menu-button, #search-options, #select-menu-button')) closeMenus();
});
document.addEventListener('keydown', (event) => {
  const typing = /input|textarea|select/i.test(event.target?.tagName || '');
  const modalOpen = [...document.querySelectorAll('.modal:not([hidden])')].length > 0;
  if (event.key === '/' && !typing) {
    event.preventDefault();
    searchEl.focus();
  } else if (event.key.toLowerCase() === 'n' && !typing && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    openCreateModal();
  } else if (event.key.toLowerCase() === 'p' && !typing && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    pasteModal.hidden = false;
    document.getElementById('paste-text').focus();
  } else if ((event.key === 'Delete' || event.key === 'Backspace') && !typing && !modalOpen && selectedPubId) {
    const pub = lastRefreshData.items.find((item) => item._id === selectedPubId);
    if (pub) {
      event.preventDefault();
      const permanent = currentView === 'trash' || pub.trashed;
      if (permanent && !confirm(t('Excluir permanentemente "{title}"?', { title: pub.title || 'esta referência' }))) return;
      (async () => {
        if (permanent) {
          await api.data.call('library:delete', pub._id);
          statusEl.textContent = t('referência excluída permanentemente');
        } else {
          await api.data.call('library:put', { ...pub, trashed: true });
          statusEl.textContent = t('referência movida para a lixeira');
        }
        selectedPubId = null;
        await refresh();
      })().catch((err) => {
        statusEl.textContent = t('erro ao excluir: {msg}', { msg: err.message });
      });
    }
  } else if (event.key === 'Escape') {
    closeMenus();
  }
});

window.addEventListener('message', async (event) => {
  if (event.data?.type === 'ppd-notes-request') {
    const notes = await api.data.call('notes:list', event.data.attachment);
    event.source?.postMessage({ type: 'ppd-notes', notes }, '*');
  }
  if (event.data?.type === 'ppd-add-highlight' || event.data?.type === 'ppd-add-annotation') {
    const {
      attachment,
      page,
      text,
      rects,
      parts,
      comment,
      color,
      mode,
      kind,
      shape,
      points,
      fontFamily,
      fontSize,
      bold,
      italic
    } = event.data;
    await api.data.call('notes:add', {
      attachment_id: attachment,
      page,
      text,
      rects,
      parts,
      comment: comment || '',
      color: color || '#ffe268',
      type: kind || 'highlight',
      mode: mode || (kind ? undefined : 'highlight'),
      shape,
      points,
      fontFamily,
      fontSize,
      bold,
      italic,
      created_at: Date.now()
    });
    const notes = await api.data.call('notes:list', attachment);
    event.source?.postMessage({ type: 'ppd-notes', notes }, '*');
  }
  if (event.data?.type === 'ppd-set-theme') {
    applyTheme(event.data.theme, { notifyViewer: false });
  }
  if (event.data?.type === 'ppd-translate') {
    const { requestId, text, target } = event.data;
    try {
      const translated = await api.translation.translate({ text, target });
      event.source?.postMessage({ type: 'ppd-translation', requestId, translated }, '*');
    } catch (err) {
      event.source?.postMessage(
        { type: 'ppd-translation', requestId, error: String(err.message || err) },
        '*'
      );
    }
  }
  if (event.data?.type === 'ppd-open-external') {
    await api.shell.openPath(fileUrlToPath(event.data.path));
  }
  if (event.data?.type === 'ppd-close-viewer') {
    viewerEl.hidden = true;
    pdfFrame.src = 'about:blank';
  }
  if (event.data?.type === 'ppd-update-note') {
    const { attachment, noteId, comment, color } = event.data;
    const patch = { _id: noteId };
    if (comment !== undefined) patch.comment = comment || '';
    if (color) patch.color = color;
    await api.data.call('notes:update', patch);
    const notes = await api.data.call('notes:list', attachment);
    event.source?.postMessage({ type: 'ppd-notes', notes }, '*');
  }
  if (event.data?.type === 'ppd-delete-note') {
    const { attachment, noteId } = event.data;
    await api.data.call('notes:delete', noteId);
    const notes = await api.data.call('notes:list', attachment);
    event.source?.postMessage({ type: 'ppd-notes', notes }, '*');
  }
  if (event.data?.type === 'ppd-export-notes') {
    try {
      const result = await exportAnnotations(event.data.attachment);
      if (result?.canceled) return;
      event.source?.postMessage({ type: 'ppd-toast', message: t('Anotações exportadas') }, '*');
      statusEl.textContent = t('anotações exportadas');
    } catch (err) {
      event.source?.postMessage({ type: 'ppd-toast', message: t('Erro ao exportar: {msg}', { msg: err.message }) }, '*');
      statusEl.textContent = t('erro ao exportar: {msg}', { msg: err.message });
    }
  }
});

function cleanNoteText(value) {
  return String(value || '')
    .replace(/\u00ad/g, '')
    .replace(/([a-zà-ÿ])-\s*\n\s*([a-zà-ÿ])/g, '$1$2')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function noteColorName(color) {
  const name = {
    '#ffe268': 'amarelo',
    '#a7e8a7': 'verde',
    '#9ed7f7': 'azul',
    '#f7b6d2': 'rosa',
    '#f6b26b': 'laranja',
    '#d9c2f0': 'roxo',
    '#ff9b9b': 'vermelho',
    '#b9e4d0': 'menta',
    '#d7dde5': 'cinza',
    '#ffffff': 'branco'
  }[String(color || '').toLowerCase()] || color || '';
  return t(name);
}

function exportSlug(value) {
  return String(value || 'anotacoes')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'anotacoes';
}

async function exportAnnotations(attachmentId) {
  const [notes, attachments, library] = await Promise.all([
    api.data.call('notes:list', attachmentId),
    api.data.call('attachments:all'),
    api.data.call('library:all')
  ]);
  const attachment = attachments.find((item) => item._id === attachmentId);
  const publication = library.find((item) => item._id === attachment?.pub_id);
  const title = publication?.title || attachment?.name || t('Documento');
  const ordered = notes
    .slice()
    .sort((a, b) => Number(a.page || 0) - Number(b.page || 0) || Number(a.created_at || 0) - Number(b.created_at || 0));
  const lines = [
    `# ${t('Anotações')} — ${title}`,
    '',
    t('Exportado em {date}.', { date: new Date().toLocaleString(i18n?.getLanguage() === 'tet' ? 'pt-PT' : 'pt-BR') }),
    '',
    ordered.length === 1
      ? t('Total: {n} anotação.', { n: ordered.length })
      : t('Total: {n} anotações.', { n: ordered.length }),
    ''
  ];
  if (!ordered.length) {
    lines.push(t('Nenhuma anotação neste documento.'));
  }
  const shapeLabels = {
    rectangle: t('Retângulo'),
    oval: t('Oval'),
    arrow: t('Seta'),
    pencil: t('Desenho')
  };
  for (const note of ordered) {
    const quote = cleanNoteText(note.text) ||
      (note.type === 'shape' ? shapeLabels[note.shape] || t('Forma') : note.type === 'text' ? t('Texto') : t('Anotação'));
    lines.push('---', '', t('## Página {page}', { page: note.page || '—' }), '');
    lines.push(...quote.split('\n').map((line) => `> ${line}`), '');
    if (note.comment) {
      lines.push(t('**Comentário:** {text}', { text: note.comment }), '');
    }
    const color = noteColorName(note.color);
    if (color) lines.push(t('**Cor:** {color}', { color }), '');
  }
  const content = `${lines.join('\n').trim()}\n`;
  return api.annotations.export({
    content,
    defaultName: `cite-anotacoes-${exportSlug(title)}.md`
  });
}

function orderCollections(collections) {
  const byParent = new Map();
  for (const col of collections) {
    const key = col.cParent || '';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(col);
  }
  const out = [];
  const walk = (parent, depth) => {
    for (const col of (byParent.get(parent) || []).sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
      if (out.some((o) => o.col._id === col._id)) continue;
      out.push({ col, depth });
      walk(col._id, depth + 1);
    }
  };
  walk('', 0);
  for (const col of collections) {
    if (!out.some((o) => o.col._id === col._id)) out.push({ col, depth: 0 });
  }
  return out;
}

function collectionDescendantIds(id, collections) {
  const descendants = new Set();
  const walk = (parentId) => {
    for (const col of collections) {
      if (col.cParent !== parentId || descendants.has(col._id)) continue;
      descendants.add(col._id);
      walk(col._id);
    }
  };
  walk(id);
  return descendants;
}

function setEditFieldValue(key, value, overwrite = false) {
  if (value === undefined || value === null || value === '') return;
  const text = Array.isArray(value) ? value.join(', ') : String(value);
  if (!text.trim()) return;
  const el = editFieldElement(key);
  if (!el) return;
  if (overwrite || !el.value.trim()) el.value = text.trim();
}

function applyEditMetadata(meta) {
  if (!meta) return;
  const currentType = normalizePubType(document.getElementById('edit-type').value);
  const nextType = normalizePubType(meta.type || currentType);
  if (meta.type && currentType === 'article' && nextType !== 'article') {
    document.getElementById('edit-type').value = nextType;
    updateEditFieldVisibility(nextType);
  }
  for (const key of ['title', 'year', 'journal', 'volume', 'issue', 'pages', 'issn', 'isbn', 'publisher', 'place', 'edition', 'bookTitle', 'editors', 'conference', 'proceedings', 'university', 'thesisType', 'institution', 'reportNumber', 'website', 'accessed', 'section', 'doi', 'url', 'language']) {
    setEditFieldValue(key, meta[key]);
  }
  setEditFieldValue('authors', meta.authors);
  setEditFieldValue('tags', meta.tags);
  if (meta.abstract) {
    const abstract = document.getElementById('edit-abstract');
    if (!abstract.value.trim()) {
      abstract.value = String(meta.abstract).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }
}

function openEditReference(pub) {
  editingPub = pub;
  const type = normalizePubType(pub.type);
  document.getElementById('edit-type').value = type;
  for (const key of [...EDIT_COMMON_FIELDS, ...EDIT_TYPE_FIELDS]) {
    if (key === 'authors' || key === 'tags') continue;
    const el = editFieldElement(key);
    if (el) el.value = pub[key] ?? '';
  }
  document.getElementById('edit-authors').value = (pub.authors || []).join('; ');
  document.getElementById('edit-tags').value = (pub.tags || []).join(', ');
  document.getElementById('edit-abstract').value = pub.abstract || '';
  const metadataStatus = document.getElementById('metadata-status');
  if (metadataStatus) metadataStatus.textContent = '';
  updateEditFieldVisibility(type);
  editModal.hidden = false;
  document.getElementById('edit-title').focus();
}

document.getElementById('refresh-metadata').onclick = async () => {
  const status = document.getElementById('metadata-status');
  const button = document.getElementById('refresh-metadata');
  const doi = document.getElementById('edit-doi').value.trim();
  const url = document.getElementById('edit-url').value.trim() || editingPub?.url || editingPub?.doi;
  if (!doi && !url) {
    status.textContent = t('Informe um DOI ou URL para buscar.');
    return;
  }
  button.disabled = true;
  status.textContent = t('buscando metadados…');
  try {
    if (!api.metadata?.lookup) throw new Error(t('recurso indisponível nesta versão'));
    const meta = await api.metadata.lookup({ doi: doi || undefined, url: url || undefined });
    applyEditMetadata(meta);
    status.textContent = t('metadados atualizados');
  } catch (err) {
    status.textContent = t('não foi possível atualizar: {msg}', { msg: err.message });
  } finally {
    button.disabled = false;
  }
};

document.getElementById('edit-type').addEventListener('change', (event) => {
  updateEditFieldVisibility(event.target.value);
});

document.getElementById('cancel-edit').onclick = () => {
  editModal.hidden = true;
  editingPub = null;
};

document.getElementById('save-edit').onclick = async () => {
  if (!editingPub) return;
  const title = document.getElementById('edit-title').value.trim();
  if (!title) return;
  const type = normalizePubType(document.getElementById('edit-type').value);
  const updated = { ...editingPub, title, type };
  const authors = parseAuthorsInput(document.getElementById('edit-authors').value);
  if (authors.length) updated.authors = authors;
  else delete updated.authors;
  const tags = document
    .getElementById('edit-tags')
    .value.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (tags.length) updated.tags = [...new Set(tags)];
  else delete updated.tags;
  const abstract = document.getElementById('edit-abstract').value.trim();
  if (abstract) updated.abstract = abstract;
  else delete updated.abstract;
  const visibleFields = new Set([...EDIT_COMMON_FIELDS, ...(PUB_TYPE_FIELDS[type] || [])]);
  for (const key of ['year', 'language', 'doi', 'url', 'folder', ...EDIT_TYPE_FIELDS]) {
    if (!visibleFields.has(key)) {
      delete updated[key];
      continue;
    }
    const el = editFieldElement(key);
    const value = el ? el.value.trim() : '';
    if (value) updated[key] = value;
    else delete updated[key];
  }
  await api.data.call('library:put', updated);
  editModal.hidden = true;
  editingPub = null;
  await refresh();
};

async function copyToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  statusEl.textContent = t('copiado: {label}', { label });
}

function noteCountForPub(pub, allNotes, allAttachments) {
  const ids = new Set(allAttachments.filter((a) => a.pub_id === pub._id).map((a) => a._id));
  return allNotes.filter((n) => ids.has(n.attachment_id)).length;
}

function filterCounts(items, allNotes, allAttachments) {
  const keys = new Map();
  for (const pub of items) {
    const key = (pub.doi || pub.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (key) keys.set(key, (keys.get(key) || 0) + 1);
  }
  const duplicateKeys = new Set([...keys.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  const hasPdf = (pub) => allAttachments.some((a) => a.pub_id === pub._id);
  const hasNotes = (pub) => noteCountForPub(pub, allNotes, allAttachments) > 0;
  return {
    duplicates: items.filter((pub) => {
      const key = (pub.doi || pub.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
      return duplicateKeys.has(key);
    }).length,
    incomplete: items.filter((pub) => !pub.doi || !pub.journal || !pub.year).length,
    hasPdf: items.filter(hasPdf).length,
    noPdf: items.filter((pub) => !hasPdf(pub)).length,
    otherFiles: 0,
    noOtherFiles: items.length,
    inFolder: items.filter((pub) => !!pub.folder).length,
    notInFolder: items.filter((pub) => !pub.folder).length,
    hasLabel: items.filter((pub) => (pub.tags || []).length > 0).length,
    noLabel: items.filter((pub) => !(pub.tags || []).length).length,
    hasNotes: items.filter(hasNotes).length,
    noNotes: items.filter((pub) => !hasNotes(pub)).length
  };
}

function parseAuthorsInput(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  if (text.includes(';') || text.includes('\n')) {
    return text
      .split(/[;\n]+/)
      .map((author) => author.trim())
      .filter(Boolean);
  }
  const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 1) return parts;
  const isGivenName = (part) => /^(?:[A-ZÀ-Ý][\p{L}.'-]*|[A-Z]\.(?:\s*[A-Z]\.)*)$/u.test(part);
  const authors = [];
  for (let index = 0; index < parts.length; index++) {
    if (index + 1 < parts.length && isGivenName(parts[index + 1])) {
      authors.push(`${parts[index]}, ${parts[index + 1]}`);
      index++;
    } else {
      authors.push(parts[index]);
    }
  }
  return authors;
}

function normalizePubType(value) {
  return window.Citations?.normalizeType
    ? window.Citations.normalizeType(value)
    : String(value || '').toLowerCase().includes('book')
      ? 'book'
      : 'article';
}

function pubType(pub) {
  return PUB_TYPE_LABELS[normalizePubType(pub?.type)] || PUB_TYPE_LABELS.article;
}

function editFieldElement(key) {
  return (
    document.querySelector(`[data-edit-field="${key}"]`) ||
    document.getElementById(`edit-${key}`) ||
    null
  );
}

function updateEditFieldVisibility(type) {
  const normalized = normalizePubType(type);
  const visible = new Set(PUB_TYPE_FIELDS[normalized] || []);
  for (const key of EDIT_TYPE_FIELDS) {
    const el = editFieldElement(key);
    if (el) el.hidden = !visible.has(key);
  }
}

let createFieldValues = {};
function renderCreateFields(type) {
  const container = document.getElementById('create-fields');
  if (!container) return;
  for (const el of container.querySelectorAll('[data-create-field]')) {
    createFieldValues[el.dataset.createField] = el.value;
  }
  container.innerHTML = '';
  for (const key of PUB_TYPE_FIELDS[normalizePubType(type)] || []) {
    const input = document.createElement('input');
    input.dataset.createField = key;
    input.placeholder = EDIT_FIELD_LABELS[key] || key;
    input.value = createFieldValues[key] || '';
    container.appendChild(input);
  }
}

function renderFilterPanel() {
  const { items, allNotes, allAttachments } = lastRefreshData;
  const c = filterCounts(items, allNotes, allAttachments);
  const rows = [
    ['duplicates', t('Duplicadas'), c.duplicates, 'copy'],
    ['incomplete', t('Incompletas'), c.incomplete, 'note'],
    ['has-pdf', t('Com PDF'), c.hasPdf, 'file'],
    ['no-pdf', t('Sem PDF'), c.noPdf, 'file'],
    ['other-files', t('Outros arquivos'), c.otherFiles, 'paperclip'],
    ['no-other-files', t('Sem outros arquivos'), c.noOtherFiles, 'paperclip'],
    ['in-folder', t('Em coleção'), c.inFolder, 'folder'],
    ['not-in-folder', t('Sem coleção'), c.notInFolder, 'folder'],
    ['has-label', t('Com etiqueta'), c.hasLabel, 'tag'],
    ['no-label', t('Sem etiqueta'), c.noLabel, 'tag'],
    ['has-notes', t('Com anotações'), c.hasNotes, 'message'],
    ['no-notes', t('Sem anotações'), c.noNotes, 'message']
  ];
  const types = new Map();
  for (const pub of items) {
    const type = pubType(pub);
    types.set(type, (types.get(type) || 0) + 1);
  }
  filterPanelEl.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'filter-head';
  const title = document.createElement('h3');
  title.textContent = t('Filtro');
  head.appendChild(title);
  const clear = document.createElement('button');
  clear.className = 'icon-button';
  clear.title = t('Limpar filtro');
  clear.setAttribute('aria-label', t('Limpar filtro'));
  clear.appendChild(icon('x', 'icon sm'));
  clear.onclick = () => {
    currentFilter = null;
    refresh().catch(() => {});
  };
  clear.hidden = !currentFilter;
  head.appendChild(clear);
  filterPanelEl.appendChild(head);
  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '1fr';
  for (const [value, label, count, iconName] of rows) {
    const button = document.createElement('button');
    button.className = 'filter-row' + (currentFilter === value ? ' active' : '');
    button.dataset.filter = value;
    button.appendChild(icon(iconName, 'icon'));
    const text = document.createElement('span');
    text.textContent = label;
    button.appendChild(text);
    const number = document.createElement('span');
    number.className = 'n';
    number.textContent = String(count);
    button.appendChild(number);
    button.onclick = () => {
      currentFilter = currentFilter === value ? null : value;
      refresh().catch(() => {});
    };
    grid.appendChild(button);
  }
  filterPanelEl.appendChild(grid);
  const typeWrap = document.createElement('div');
  typeWrap.className = 'filter-type';
  const typeTitle = document.createElement('div');
  typeTitle.className = 'filter-head';
  const typeH = document.createElement('h3');
  typeH.textContent = t('Tipo');
  typeTitle.appendChild(typeH);
  typeWrap.appendChild(typeTitle);
  const typeGrid = document.createElement('div');
  typeGrid.style.display = 'grid';
  typeGrid.style.gridTemplateColumns = '1fr';
  for (const [type, count] of [...types.entries()].sort((a, b) => b[1] - a[1])) {
    const button = document.createElement('button');
    button.className = 'filter-row' + (currentFilter === `type:${type}` ? ' active' : '');
    button.appendChild(icon('file', 'icon'));
    const text = document.createElement('span');
    text.textContent = type;
    button.appendChild(text);
    const number = document.createElement('span');
    number.className = 'n';
    number.textContent = String(count);
    button.appendChild(number);
    button.onclick = () => {
      currentFilter = currentFilter === `type:${type}` ? null : `type:${type}`;
      refresh().catch(() => {});
    };
    typeGrid.appendChild(button);
  }
  typeWrap.appendChild(typeGrid);
  filterPanelEl.appendChild(typeWrap);
}

function detailRow(label, value, url) {
  const row = document.createElement('div');
  row.className = 'detail-row';
  const labelEl = document.createElement('div');
  labelEl.className = 'label';
  labelEl.textContent = label;
  const valueEl = document.createElement('div');
  valueEl.className = 'value';
  if (url && value) {
    const a = document.createElement('a');
    a.href = url;
    a.textContent = value;
    a.onclick = (event) => {
      event.preventDefault();
      api.shell.openExternal(url);
    };
    valueEl.appendChild(a);
  } else {
    valueEl.textContent = value || '—';
  }
  row.append(labelEl, valueEl);
  return row;
}

function renderPubDetails(pub) {
  pubDetailsEl.innerHTML = '';
  document.getElementById('details-bar-title').textContent = pub ? t('Referência') : t('Filtros');
  if (!pub) {
    pubDetailsEl.hidden = true;
    filterPanelEl.hidden = false;
    renderFilterPanel();
    return;
  }
  pubDetailsEl.hidden = false;
  filterPanelEl.hidden = true;
  const head = document.createElement('div');
  head.className = 'details-head';
  const title = document.createElement('h3');
  title.textContent = pub.title || t('(sem título)');
  const editButton = document.createElement('button');
  editButton.className = 'icon-button';
  editButton.title = t('Editar metadados');
  editButton.setAttribute('aria-label', t('Editar metadados'));
  editButton.appendChild(icon('pen', 'icon sm'));
  editButton.onclick = () => openEditReference(pub);
  const closeButton = document.createElement('button');
  closeButton.className = 'icon-button';
  closeButton.title = t('Fechar detalhes');
  closeButton.setAttribute('aria-label', t('Fechar detalhes'));
  closeButton.appendChild(icon('x', 'icon sm'));
  closeButton.onclick = () => {
    selectedPubId = null;
    refresh().catch(() => {});
  };
  head.append(title, editButton, closeButton);
  pubDetailsEl.appendChild(head);

  const type = normalizePubType(pub.type);
  const rows = [
    [t('Tipo'), pubType(pub)],
    [t('Autores'), (pub.authors || []).join(', ')],
    [t('Publicado'), pub.year],
    [t('Idioma'), pub.language || 'pt']
  ];
  const typeRows = {
    article: ['journal', 'fullJournal', 'volume', 'issue', 'pages', 'issn'],
    book: ['publisher', 'place', 'edition', 'isbn', 'pages'],
    chapter: ['bookTitle', 'editors', 'publisher', 'place', 'edition', 'pages', 'isbn'],
    conference: ['conference', 'proceedings', 'place', 'publisher', 'pages'],
    thesis: ['university', 'thesisType', 'place', 'pages'],
    report: ['institution', 'reportNumber', 'place', 'pages'],
    webpage: ['website', 'accessed'],
    newspaper: ['journal', 'place', 'section', 'pages'],
    magazine: ['journal', 'volume', 'issue', 'pages', 'issn']
  };
  const typeLabels = {
    ...EDIT_FIELD_LABELS,
    fullJournal: t('Periódico completo'),
    website: t('Site'),
    accessed: t('Acessado em')
  };
  for (const key of typeRows[type] || []) {
    rows.push([typeLabels[key] || key, pub[key]]);
  }
  rows.push(
    ['DOI', pub.doi, pub.doi ? `https://doi.org/${pub.doi}` : undefined],
    ['URL', pub.url, pub.url]
  );
  for (const [label, value, url] of rows) {
    if (!value) continue;
    pubDetailsEl.appendChild(detailRow(label, value, url));
  }
  const added = pub.created_at ? new Date(pub.created_at) : null;
  if (added && !Number.isNaN(added.getTime())) {
    pubDetailsEl.appendChild(
      detailRow(t('Adicionado'), added.toLocaleDateString(i18n?.getLanguage() === 'tet' ? 'pt-PT' : 'pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }))
    );
  }
  if (pub.tags?.length) {
    const tags = document.createElement('div');
    tags.className = 'detail-block';
    const label = document.createElement('div');
    label.className = 'label';
    label.style.color = '#7d8793';
    label.style.marginBottom = '4px';
    label.textContent = t('Etiquetas');
    tags.appendChild(label);
    for (const tag of pub.tags) {
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = tag;
      tags.appendChild(pill);
    }
    pubDetailsEl.appendChild(tags);
  }
  if (pub.abstract) {
    const abstract = document.createElement('div');
    abstract.className = 'detail-block';
    const label = document.createElement('div');
    label.className = 'label';
    label.style.color = '#7d8793';
    label.style.marginBottom = '4px';
    label.textContent = t('Resumo');
    abstract.append(label, document.createTextNode(pub.abstract));
    pubDetailsEl.appendChild(abstract);
  }
  const copyActions = document.createElement('div');
  copyActions.className = 'detail-actions';
  const styleSelect = document.createElement('select');
  styleSelect.id = 'cite-style';
  for (const style of CITATION_STYLES) {
    const option = document.createElement('option');
    option.value = style;
    option.textContent = style;
    styleSelect.appendChild(option);
  }
  styleSelect.value = citationStyle;
  styleSelect.onchange = () => {
    citationStyle = styleSelect.value;
    localStorage.setItem('cite-citation-style', citationStyle);
  };
  const copyCitation = document.createElement('button');
  copyCitation.textContent = t('Copiar citação');
  copyCitation.className = 'btn small';
  copyCitation.onclick = () =>
    copyToClipboard(window.Citations.format(citationStyle, pub), citationStyle);
  const copyBibtex = document.createElement('button');
  copyBibtex.textContent = t('Copiar BibTeX');
  copyBibtex.className = 'btn small';
  copyBibtex.onclick = () => copyToClipboard(window.BibTeX.toBibtex([pub]), 'BibTeX');
  const copyRis = document.createElement('button');
  copyRis.textContent = t('Copiar RIS');
  copyRis.className = 'btn small';
  copyRis.onclick = () => copyToClipboard(window.RIS.toRIS([pub]), 'RIS');
  copyActions.append(styleSelect, copyCitation, copyBibtex, copyRis);
  pubDetailsEl.appendChild(copyActions);
}

function pdfSnippetElement(text, q) {
  const index = text.toLowerCase().indexOf(q);
  if (index < 0) return null;
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + q.length + 80);
  const div = document.createElement('div');
  div.className = 'pdf-snippet';
  div.dataset.pdfSnippet = '';
  div.append(`${start > 0 ? '…' : ''}${text.slice(start, index)}`);
  const mark = document.createElement('mark');
  mark.textContent = text.slice(index, index + q.length);
  div.appendChild(mark);
  div.append(`${text.slice(index + q.length, end)}${end < text.length ? '…' : ''}`);
  return div;
}

function pubKey(pub) {
  return (pub.doi || pub.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function noteTextForPub(pub, allNotes, allAttachments) {
  const ids = new Set(allAttachments.filter((a) => a.pub_id === pub._id).map((a) => a._id));
  return allNotes
    .filter((n) => ids.has(n.attachment_id))
    .map((n) => `${n.text || ''} ${n.comment || ''}`)
    .join(' ');
}

function fieldValues(pub, field, allNotes, allAttachments) {
  const linked = allAttachments.filter((a) => a.pub_id === pub._id);
  switch (field) {
    case 'title':
      return [pub.title || ''];
    case 'author':
      return [pub.authors || []];
    case 'year':
      return [pub.year || ''];
    case 'journal':
      return [pub.journal || '', pub.fullJournal || ''];
    case 'abstract':
      return [pub.abstract || ''];
    case 'doi':
      return [pub.doi || ''];
    case 'label':
      return [pub.tags || []];
    case 'folder':
      return [pub.folder || ''];
    case 'type':
      return [pubType(pub)];
    case 'notes':
      return [noteTextForPub(pub, allNotes, allAttachments)];
    case 'pdf':
      return linked.map((a) => `${a.name || ''} ${a.text || ''}`);
    default: {
      const values = [
        pub.title,
        (pub.authors || []).join(' '),
        pub.year,
        pub.journal,
        pub.fullJournal,
        pub.publisher,
        pub.place,
        pub.edition,
        pub.isbn,
        pub.issn,
        pub.bookTitle,
        pub.editors,
        pub.conference,
        pub.proceedings,
        pub.university,
        pub.thesisType,
        pub.institution,
        pub.reportNumber,
        pub.website,
        pub.accessed,
        pub.section,
        pub.language,
        pub.doi,
        pub.url,
        (pub.tags || []).join(' '),
        pub.folder,
        ...linked.map((a) => a.name)
      ];
      if (searchInclude.abstract) values.push(pub.abstract);
      if (searchInclude.notes) values.push(noteTextForPub(pub, allNotes, allAttachments));
      if (searchInclude.pdf) values.push(...linked.map((a) => a.text));
      return values;
    }
  }
}

function normalizeSearchField(field) {
  const key = String(field || '').toLowerCase();
  return {
    título: 'title', titulo: 'title', title: 'title',
    autor: 'author', autores: 'author', author: 'author',
    ano: 'year', year: 'year',
    periódico: 'journal', periodico: 'journal', revista: 'journal', journal: 'journal',
    resumo: 'abstract', abstract: 'abstract',
    doi: 'doi',
    etiqueta: 'label', label: 'label', tag: 'label',
    coleção: 'folder', colecao: 'folder', folder: 'folder',
    notas: 'notes', notes: 'notes',
    pdf: 'pdf', tipo: 'type', type: 'type'
  }[key] || 'any';
}

function parseSearchQuery(q) {
  const tokens = String(q || '').match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  return tokens
    .map((raw) => {
      let token = raw;
      const neg = token.startsWith('-');
      if (neg) token = token.slice(1);
      let field = 'any';
      const match = token.match(/^([^:]+):(.*)$/);
      if (match) {
        field = normalizeSearchField(match[1]);
        token = match[2];
      }
      token = token.replace(/^"|"$/g, '').toLowerCase();
      return { term: token, field, neg };
    })
    .filter((token) => token.term);
}

function matchesSearch(pub, tokens, allNotes, allAttachments) {
  if (!tokens.length) return true;
  return tokens.every((token) => {
    const haystack = fieldValues(pub, token.field, allNotes, allAttachments)
      .join(' ')
      .toLowerCase();
    const found = haystack.includes(token.term);
    return token.neg ? !found : found;
  });
}

function matchesFilter(pub, allNotes, allAttachments, duplicateKeys) {
  if (!currentFilter) return true;
  const linked = allAttachments.filter((a) => a.pub_id === pub._id);
  if (currentFilter === 'duplicates') return duplicateKeys.has(pubKey(pub));
  if (currentFilter === 'incomplete') return !pub.doi || !pub.journal || !pub.year;
  if (currentFilter === 'has-pdf') return linked.length > 0;
  if (currentFilter === 'no-pdf') return linked.length === 0;
  if (currentFilter === 'other-files') return false;
  if (currentFilter === 'no-other-files') return true;
  if (currentFilter === 'in-folder') return !!pub.folder;
  if (currentFilter === 'not-in-folder') return !pub.folder;
  if (currentFilter === 'has-label') return (pub.tags || []).length > 0;
  if (currentFilter === 'no-label') return !(pub.tags || []).length;
  if (currentFilter === 'has-notes') return noteCountForPub(pub, allNotes, allAttachments) > 0;
  if (currentFilter === 'no-notes') return noteCountForPub(pub, allNotes, allAttachments) === 0;
  if (currentFilter.startsWith('type:')) return pubType(pub) === currentFilter.slice(5);
  return true;
}

function openViewerForAttachment(file, key, displayName) {
  viewerEl.hidden = false;
  (async () => {
    let viewerKey = key;
    try {
      const [records, allNotes] = await Promise.all([
        api.data.call('attachments:all'),
        api.data.call('notes:all')
      ]);
      const record = records.find(
        (rec) => rec.path === file.path || (rec.hash && file.name.startsWith(rec.hash + '-'))
      );
      if (record) {
        viewerKey = record._id;
        const aliases = new Set([key, file.name, file.path]);
        for (const note of allNotes) {
          if (aliases.has(note.attachment_id) && note.attachment_id !== viewerKey) {
            await api.data.call('notes:update', { _id: note._id, attachment_id: viewerKey });
          }
        }
      }
    } catch {}
    pdfFrame.onload = async () => {
      try {
        const notes = await api.data.call('notes:list', viewerKey);
        pdfFrame.contentWindow?.postMessage({ type: 'ppd-notes', notes }, '*');
      } catch {}
      try {
        const bytes = await api.attachments.read(file.path);
        pdfFrame.contentWindow?.postMessage({ type: 'ppd-file', bytes }, '*');
      } catch (err) {
        statusEl.textContent = t('não foi possível abrir o PDF: {msg}', { msg: err.message });
      }
    };
    pdfFrame.src = `pdf-viewer.html?v=${assetVersion}&path=${encodeURIComponent(file.path)}&attachment=${encodeURIComponent(viewerKey)}&lang=${encodeURIComponent(i18n?.getLanguage() || 'pt')}&theme=${encodeURIComponent(document.documentElement.dataset.theme || 'light')}`;
  })();
}

async function refresh() {
  const [items, allNotes, allAttachments, collections] = await Promise.all([
    api.data.call('library:all'),
    api.data.call('notes:all'),
    api.data.call('attachments:all'),
    api.data.call('collections:all')
  ]);
  const folder = folderFilterEl.value;
  const rawQuery = searchEl.value.trim();
  const q = rawQuery.toLowerCase();
  const tokens = parseSearchQuery(rawQuery);
  const duplicateGroups = new Map();
  for (const pub of items) {
    const key = pubKey(pub);
    if (key) duplicateGroups.set(key, (duplicateGroups.get(key) || 0) + 1);
  }
  const duplicateKeys = new Set([...duplicateGroups.entries()].filter(([, n]) => n > 1).map(([key]) => key));
  const baseItems = items.filter((pub) => {
    if (currentView === 'trash') return !!pub.trashed;
    if (!showTrashedEl.checked && pub.trashed) return false;
    if (currentView === 'starred' && !pub.starred) return false;
    if (currentTag && !(pub.tags || []).includes(currentTag)) return false;
    if (folder && pub.folder !== folder) return false;
    return true;
  });
  const filtered = baseItems.filter(
    (pub) =>
      matchesFilter(pub, allNotes, allAttachments, duplicateKeys) &&
      matchesSearch(pub, tokens, allNotes, allAttachments)
  );

  const trashCount = items.filter((p) => p.trashed).length;
  document.getElementById('nav-count-all').textContent = String(items.filter((p) => !p.trashed).length);
  document.getElementById('nav-count-starred').textContent = String(items.filter((p) => !p.trashed && p.starred).length);
  document.getElementById('nav-count-trash').textContent = String(trashCount);
  const emptyTrashButton = document.getElementById('empty-trash');
  if (emptyTrashButton) {
    emptyTrashButton.disabled = trashCount === 0;
    emptyTrashButton.title = trashCount ? t('Esvaziar lixeira') : t('A lixeira está vazia');
  }
  const deleteSelectedButton = document.getElementById('delete-selected');
  if (deleteSelectedButton) {
    const label = currentView === 'trash'
      ? t('Excluir permanentemente selecionados')
      : t('Mover selecionados para a lixeira');
    deleteSelectedButton.title = label;
    deleteSelectedButton.setAttribute('aria-label', label);
  }
  viewTitleEl.textContent = currentTag
    ? t('Etiqueta: {tag}', { tag: currentTag })
    : currentView === 'starred'
      ? t('Favoritos')
      : currentView === 'trash'
        ? t('Lixeira')
        : t('Todas as referências');
  countEl.textContent =
    rawQuery || folder || currentFilter
      ? t('{n} de {m} referências', { n: filtered.length, m: baseItems.length })
      : t('{n} referências', { n: baseItems.length });

  const ordered = orderCollections(collections);
  const collectionNames = new Set(ordered.map((o) => o.col.name));
  const legacyFolders = [...new Set(items.map((p) => p.folder).filter((f) => f && !collectionNames.has(f)))].sort();
  const current = folderFilterEl.value;
  folderFilterEl.innerHTML = `<option value="">${t('Todas as coleções')}</option>`;
  for (const { col, depth } of ordered) {
    const opt = document.createElement('option');
    opt.value = col.name;
    opt.textContent = `${'— '.repeat(depth)}${col.name}`;
    folderFilterEl.appendChild(opt);
  }
  for (const f of legacyFolders) {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    folderFilterEl.appendChild(opt);
  }
  folderFilterEl.value = [...folderFilterEl.options].some((o) => o.value === current) ? current : '';

  folderOptionsEl.innerHTML = '';
  for (const name of [...ordered.map((o) => o.col.name), ...legacyFolders]) {
    const opt = document.createElement('option');
    opt.value = name;
    folderOptionsEl.appendChild(opt);
  }

  const currentParent = collectionParentEl.value;
  collectionParentEl.innerHTML = `<option value="">${t('Sem coleção superior')}</option>`;
  for (const { col, depth } of ordered) {
    const opt = document.createElement('option');
    opt.value = col._id;
    opt.textContent = `${'— '.repeat(depth)}${col.name}`;
    collectionParentEl.appendChild(opt);
  }
  collectionParentEl.value = [...collectionParentEl.options].some((o) => o.value === currentParent)
    ? currentParent
    : '';

  const currentTarget = moveTargetEl.value;
  moveTargetEl.innerHTML = `<option value="">${t('Mover para…')}</option>`;
  for (const { col, depth } of ordered) {
    const opt = document.createElement('option');
    opt.value = col.name;
    opt.textContent = `${'— '.repeat(depth)}${col.name}`;
    moveTargetEl.appendChild(opt);
  }
  moveTargetEl.value = [...moveTargetEl.options].some((o) => o.value === currentTarget) ? currentTarget : '';

  const counts = new Map();
  for (const p of items) {
    if (p.folder) counts.set(p.folder, (counts.get(p.folder) || 0) + 1);
  }
  const childrenByParent = new Map();
  for (const { col } of ordered) {
    if (!col.cParent) continue;
    if (!childrenByParent.has(col.cParent)) childrenByParent.set(col.cParent, []);
    childrenByParent.get(col.cParent).push(col);
  }
  const totalForCollection = (col, seen = new Set()) => {
    if (seen.has(col._id)) return 0;
    seen.add(col._id);
    let total = counts.get(col.name) || 0;
    for (const child of childrenByParent.get(col._id) || []) {
      total += totalForCollection(child, seen);
    }
    return total;
  };
  collectionsListEl.innerHTML = '';
  for (const { col, depth } of ordered) {
    const li = document.createElement('li');
    const color = collectionColor(col);
    li.style.setProperty('--collection-color', color);
    li.classList.toggle('active', folderFilterEl.value === col.name);
    const colorButton = document.createElement('button');
    colorButton.type = 'button';
    colorButton.className = 'collection-color';
    colorButton.dataset.color = color;
    colorButton.style.background = color;
    colorButton.title = t('Cor da coleção');
    colorButton.setAttribute('aria-label', t('Cor da coleção'));
    colorButton.onclick = (event) => {
      event.stopPropagation();
      openCollectionColorMenu(colorButton, col, color);
    };
    const label = document.createElement('span');
    label.textContent = `${'— '.repeat(depth)}${col.name} (${totalForCollection(col)})`;
    label.title = col.name;
    label.onclick = () => {
      currentTag = null;
      folderFilterEl.value = col.name;
      refresh().catch(() => {});
    };
    const rename = document.createElement('button');
    rename.className = 'collection-action';
    rename.appendChild(icon('pen', 'icon sm'));
    rename.title = t('Renomear coleção');
    rename.setAttribute('aria-label', t('Renomear coleção'));
    rename.onclick = () => {
      const input = document.createElement('input');
      input.value = col.name;
      const save = document.createElement('button');
      save.textContent = t('Salvar');
      const cancel = document.createElement('button');
      cancel.textContent = t('Cancelar');
      cancel.style.marginLeft = '4px';
      li.dataset.editing = 'rename';
      li.replaceChildren(input, save, cancel);
      cancel.onclick = () => refresh();
      save.onclick = async () => {
        const name = input.value.trim();
        if (!name) return;
        const duplicate = ordered.some(
          ({ col: other }) =>
            other._id !== col._id && other.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()
        );
        if (duplicate) {
          statusEl.textContent = t('já existe uma coleção chamada “{name}”', { name });
          input.focus();
          return;
        }
        await api.data.call('collections:save', { ...col, name });
        const pubs = await api.data.call('library:all');
        for (const p of pubs.filter((p) => p.folder === col.name)) {
          await api.data.call('library:put', { ...p, folder: name });
        }
        statusEl.textContent = t('coleção renomeada: {name}', { name });
        await refresh();
      };
    };
    const move = document.createElement('button');
    move.className = 'collection-action';
    move.appendChild(icon('move', 'icon sm'));
    move.title = t('Mover coleção para outro nível');
    move.setAttribute('aria-label', t('Mover coleção'));
    move.onclick = () => {
      const forbidden = collectionDescendantIds(col._id, collections);
      forbidden.add(col._id);
      const parentSelect = document.createElement('select');
      parentSelect.style.cssText = 'flex:1;min-width:0;padding:2px 4px;font-size:10px';
      const rootOption = document.createElement('option');
      rootOption.value = '';
      rootOption.textContent = t('Sem coleção superior');
      parentSelect.appendChild(rootOption);
      for (const { col: candidate, depth } of ordered) {
        if (forbidden.has(candidate._id)) continue;
        const option = document.createElement('option');
        option.value = candidate._id;
        option.textContent = `${'— '.repeat(depth)}${candidate.name}`;
        parentSelect.appendChild(option);
      }
      parentSelect.value = col.cParent || '';
      const save = document.createElement('button');
      save.textContent = t('Salvar');
      const cancel = document.createElement('button');
      cancel.textContent = t('Cancelar');
      li.dataset.editing = 'move';
      li.replaceChildren(parentSelect, save, cancel);
      cancel.onclick = () => refresh();
      save.onclick = async () => {
        const parentId = parentSelect.value;
        const { cParent: _cParent, ...rest } = col;
        await api.data.call('collections:save', parentId ? { ...rest, cParent: parentId } : rest);
        statusEl.textContent = parentId
          ? t('coleção movida: {name}', { name: col.name })
          : t('coleção movida para o nível superior: {name}', { name: col.name });
        await refresh();
      };
    };
    const del = document.createElement('button');
    del.className = 'collection-action';
    del.appendChild(icon('trash', 'icon sm'));
    del.title = t('Excluir coleção');
    del.setAttribute('aria-label', t('Excluir coleção'));
    del.onclick = async () => {
      const children = collections.filter((child) => child.cParent === col._id);
      for (const child of children) {
        const { cParent: _cParent, ...rest } = child;
        await api.data.call('collections:save', col.cParent ? { ...rest, cParent: col.cParent } : rest);
      }
      const pubs = await api.data.call('library:all');
      for (const p of pubs.filter((p) => p.folder === col.name)) {
        const { folder: _folder, ...rest } = p;
        await api.data.call('library:put', rest);
      }
      await api.data.call('collections:delete', col._id);
      statusEl.textContent = children.length
        ? t('coleção excluída: {name}; {n} subcoleção(ões) movida(s)', { name: col.name, n: children.length })
        : t('coleção excluída: {name}', { name: col.name });
      await refresh();
    };
    li.append(colorButton, label, move, rename, del);
    collectionsListEl.appendChild(li);
  }

  const tagCounts = new Map();
  for (const pub of items) {
    for (const tag of pub.tags || []) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  }
  tagsSectionEl.hidden = tagCounts.size === 0;
  tagsListEl.innerHTML = '';
  for (const [tag, tagCount] of [...tagCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.textContent = `${tag} (${tagCount})`;
    button.classList.toggle('active', currentTag === tag);
    button.onclick = () => {
      currentTag = currentTag === tag ? null : tag;
      refresh().catch(() => {});
    };
    li.appendChild(button);
    tagsListEl.appendChild(li);
  }

  const matchingNotes = rawQuery
    ? allNotes.filter((n) => `${n.text || ''} ${n.comment || ''} ${n.page || ''}`.toLowerCase().includes(q))
    : [];
  notesPanelEl.hidden = matchingNotes.length === 0;
  notesResultsEl.innerHTML = '';
  for (const note of matchingNotes) {
    const li = document.createElement('li');
    li.textContent = `${note.attachment_id}${note.page ? ` (p. ${note.page})` : ''}: ${note.text}`;
    if (note.comment) {
      const comment = document.createElement('div');
      comment.className = 'note-comment';
      comment.textContent = t('Comentário: {text}', { text: note.comment });
      li.appendChild(comment);
    }
    notesResultsEl.appendChild(li);
  }

  const sorted = [...filtered];
  if (sortSelectEl.value === 'title') {
    sorted.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  } else if (sortSelectEl.value === 'year') {
    sorted.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
  }

  lastRefreshData = { items: baseItems, allNotes, allAttachments };
  listEl.innerHTML = '';
  for (const pub of sorted) {
    const li = document.createElement('li');
    li.dataset.pubId = pub._id;
    if (pub._id === selectedPubId) li.classList.add('selected');
    li.addEventListener('click', (event) => {
      if (event.target.closest('button, input, select, a')) return;
      selectedPubId = pub._id;
      refresh().catch(() => {});
    });
    const select = document.createElement('input');
    select.type = 'checkbox';
    select.className = 'select-pub';
    select.dataset.pubId = pub._id;

    const info = document.createElement('div');
    info.className = 'ref-info';
    const titleLine = document.createElement('div');
    titleLine.className = 'ref-title-line';
    const title = document.createElement('strong');
    title.textContent = pub.title || '(sem título)';
    const star = document.createElement('button');
    star.className = 'star-btn' + (pub.starred ? ' starred' : '');
    star.setAttribute('aria-label', pub.starred ? t('Remover') : t('Favoritar'));
    star.title = pub.starred ? t('Remover dos favoritos') : t('Adicionar aos favoritos');
    star.textContent = pub.starred ? '★' : '☆';
    star.onclick = async () => {
      await api.data.call('library:put', { ...pub, starred: !pub.starred });
      await refresh();
    };
    titleLine.append(title, star);

    const meta = document.createElement('div');
    meta.className = 'ref-meta';
    const authors = document.createElement('span');
    authors.textContent = (pub.authors || []).join(', ');
    meta.appendChild(authors);
    if (pub.journal) {
      meta.append(document.createTextNode(' · '));
      const journal = document.createElement('span');
      journal.className = 'journal';
      journal.textContent = pub.journal;
      meta.appendChild(journal);
    }
    if (pub.year) {
      meta.append(document.createTextNode(' · '));
      const year = document.createElement('span');
      year.textContent = pub.year;
      meta.appendChild(year);
    }
    meta.append(document.createTextNode(' · '));
    const type = document.createElement('span');
    type.className = 'ref-type';
    type.textContent = pubType(pub);
    meta.appendChild(type);

    const linked = allAttachments.filter((a) => a.pub_id === pub._id);
    const footer = document.createElement('div');
    footer.className = 'ref-footer';
    const attachCount = document.createElement('button');
    attachCount.className = 'icon-button';
    attachCount.title = t('Anexos');
    attachCount.setAttribute('aria-label', t('Anexos'));
    attachCount.appendChild(icon('paperclip', 'icon sm'));
    if (linked.length) {
      const badge = document.createElement('span');
      badge.className = 'count-badge';
      badge.textContent = String(linked.length);
      attachCount.appendChild(badge);
    }
    attachCount.onclick = () => {
      expandedPubId = expandedPubId === pub._id ? null : pub._id;
      refresh().catch(() => {});
    };
    const noteCount = noteCountForPub(pub, allNotes, allAttachments);
    const noteIcon = document.createElement('button');
    noteIcon.className = 'icon-button';
    noteIcon.title = t('Anotações');
    noteIcon.setAttribute('aria-label', t('Anotações'));
    noteIcon.appendChild(icon('note', 'icon sm'));
    if (noteCount) {
      const badge = document.createElement('span');
      badge.className = 'count-badge';
      badge.textContent = String(noteCount);
      noteIcon.appendChild(badge);
    }
    noteIcon.onclick = () => {
      const first = linked[0];
      if (!first) return;
      currentAttachment = first._id;
      notesTitle.textContent = t('Anotações — {name}', { name: first.name || first._id });
      notesModal.hidden = false;
      renderNotes().catch(() => {});
    };
    footer.append(attachCount, noteIcon);
    if (linked.some((a) => a.text)) {
      const pdfIcon = document.createElement('span');
      pdfIcon.className = 'icon-button';
      pdfIcon.title = t('Texto do PDF indexado');
      pdfIcon.appendChild(icon('file', 'icon sm'));
      footer.appendChild(pdfIcon);
    }

    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const action = (name, label, handler, active = false) => {
      const button = document.createElement('button');
      button.className = 'icon-button' + (active ? ' active' : '');
      button.setAttribute('aria-label', label);
      button.title = label;
      button.appendChild(icon(name, 'icon sm'));
      button.onclick = handler;
      return button;
    };
    actions.appendChild(
      action('pen', t('Editar'), () => {
        const input = document.createElement('input');
        input.value = pub.title || '';
        const save = document.createElement('button');
        save.textContent = t('Salvar');
        save.className = 'btn small primary';
        const cancel = document.createElement('button');
        cancel.textContent = t('Cancelar');
        cancel.className = 'btn small';
        title.replaceWith(input);
        actions.replaceChildren(save, cancel);
        save.onclick = async () => {
          if (input.value.trim()) {
            await api.data.call('library:put', { ...pub, title: input.value.trim() });
            await refresh();
          }
        };
        cancel.onclick = () => refresh();
      })
    );
    actions.appendChild(
      action(pub.trashed ? 'refresh' : 'trash', pub.trashed ? t('Restaurar') : t('Lixeira'), async () => {
        await api.data.call('library:put', { ...pub, trashed: !pub.trashed });
        await refresh();
        await refreshAttachments();
      })
    );
    actions.appendChild(
      action('paperclip', t('Anexar'), () => {
        pendingPub = pub._id;
        document.getElementById('pub-file').click();
      })
    );
    actions.appendChild(
      action('trash', t('Excluir'), async () => {
        if (confirm(t('Excluir "{title}"?', { title: pub.title }))) {
          await api.data.call('library:delete', pub._id);
          await refresh();
          await refreshAttachments();
        }
      })
    );

    info.append(titleLine, meta);
    if (linked.length) {
      const files = document.createElement('div');
      files.className = 'ref-files';
      files.dataset.attachments = pub._id;
      files.textContent = t('Anexos ({n}): {names}', {
        n: linked.length,
        names: linked.map((a) => a.name || a._id).join(', ')
      });
      info.appendChild(files);
    }
    if (rawQuery) {
      const match = linked.find((a) => `${a.name || ''} ${a.text || ''}`.toLowerCase().includes(rawQuery.toLowerCase()));
      const source = match?.text?.toLowerCase().includes(rawQuery.toLowerCase()) ? match.text : match?.name;
      if (source) {
        const snippet = pdfSnippetElement(source, rawQuery.toLowerCase());
        if (snippet) info.appendChild(snippet);
      }
    }
    info.appendChild(footer);
    if (expandedPubId === pub._id && linked.length) {
      const sub = document.createElement('div');
      sub.className = 'attach-subrow';
      for (const att of linked) {
        const fileLine = document.createElement('div');
        fileLine.className = 'file-line';
        fileLine.appendChild(icon('file', 'icon sm'));
        const name = document.createElement('span');
        name.className = 'file-name';
        name.textContent = att.name || att._id;
        const size = document.createElement('span');
        size.className = 'file-meta';
        size.textContent = t('PDF principal · {size} KB', { size: Math.round((att.size || 0) / 1024) });
        fileLine.append(name, size);
        const subActions = document.createElement('div');
        subActions.className = 'sub-actions';
        const open = document.createElement('button');
        open.textContent = t('Abrir');
        open.className = 'btn small';
        open.onclick = () => api.shell.openPath(att.path);
        const view = document.createElement('button');
        view.textContent = t('Visualizar');
        view.className = 'btn small';
        view.onclick = () => openViewerForAttachment(att, att._id, att.name || att._id);
        const notes = document.createElement('button');
        notes.textContent = t('Anotações');
        notes.className = 'btn small';
        notes.onclick = () => {
          currentAttachment = att._id;
          notesTitle.textContent = t('Anotações — {name}', { name: att.name || att._id });
          notesModal.hidden = false;
          renderNotes().catch(() => {});
        };
        subActions.append(open, view, notes);
        sub.appendChild(fileLine);
        sub.appendChild(subActions);
      }
      info.appendChild(sub);
    }

    const side = document.createElement('div');
    side.className = 'ref-side';
    const pdf = document.createElement('button');
    pdf.className = 'pdf-btn';
    pdf.textContent = 'PDF';
    pdf.onclick = () => {
      if (linked[0]) openViewerForAttachment(linked[0], linked[0]._id, linked[0].name || linked[0]._id);
      else {
        pendingPub = pub._id;
        document.getElementById('pub-file').click();
      }
    };
    side.append(pdf, actions);

    li.append(select, info, side);
    listEl.appendChild(li);
  }

  if (filtered.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    const art = document.createElement('img');
    art.className = 'empty-art';
    art.src = './assets/empty-library.png';
    art.alt = '';
    const title = document.createElement('div');
    title.className = 'empty-title';
    title.textContent = baseItems.length === 0
      ? t('Sua biblioteca está vazia.')
      : t('Nenhuma referência encontrada.');
    const subtitle = document.createElement('div');
    subtitle.className = 'empty-subtitle';
    subtitle.textContent = baseItems.length === 0
      ? t('Envie um PDF ou busque artigos em bases públicas.')
      : t('Ajuste os filtros ou limpe a busca para ver sua biblioteca.');
    const action = document.createElement('button');
    action.className = 'empty-action';
    action.append(icon('search'), document.createTextNode(
      baseItems.length === 0 ? t('Buscar artigos') : t('Limpar filtros')
    ));
    action.onclick = () => {
      if (baseItems.length === 0) {
        openSearchModal();
      } else {
        currentFilter = null;
        searchEl.value = '';
        refresh().catch(() => {});
      }
    };
    empty.append(art, title, subtitle, action);
    listEl.appendChild(empty);
  }

  renderPubDetails(baseItems.find((p) => p._id === selectedPubId));
}

function formatFileSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

async function refreshAttachments() {
  const [files, records, pubs] = await Promise.all([
    api.attachments.list(),
    api.data.call('attachments:all'),
    api.data.call('library:all')
  ]);
  const includeTrashed = showTrashedEl.checked || currentView === 'trash';
  const pubById = new Map(
    pubs.filter((pub) => includeTrashed || !pub.trashed).map((pub) => [pub._id, pub])
  );
  const visibleRecords = records.filter((record) => pubById.has(record.pub_id));
  const byPath = new Map(files.map((file) => [file.path, file]));
  attachmentsEl.innerHTML = '';
  document.getElementById('attachments-section').hidden = visibleRecords.length === 0;

  function renderAttachment(li, file, key, name, meta) {
    const row = document.createElement('div');
    row.className = 'attachment-row';
    const iconWrap = document.createElement('span');
    iconWrap.className = 'attachment-icon';
    iconWrap.appendChild(icon('file', 'icon sm'));
    const copy = document.createElement('div');
    copy.className = 'attachment-copy';
    const nameEl = document.createElement('div');
    nameEl.className = 'attachment-name';
    nameEl.textContent = name;
    const metaEl = document.createElement('div');
    metaEl.className = 'attachment-meta';
    metaEl.textContent = meta;
    copy.append(nameEl, metaEl);
    row.append(iconWrap, copy);
    li.appendChild(row);
    if (!file) return;
    const actions = document.createElement('div');
    actions.className = 'attachment-actions';
    const view = document.createElement('button');
    view.textContent = t('Visualizar');
    view.className = 'secondary';
    view.onclick = () => openViewerForAttachment(file, key, name);
    const open = document.createElement('button');
    open.textContent = t('Abrir');
    open.className = 'secondary';
    open.onclick = () => api.shell.openPath(file.path);
    const notes = document.createElement('button');
    notes.textContent = t('Anotações');
    notes.className = 'secondary';
    notes.onclick = async () => {
      currentAttachment = key;
      notesTitle.textContent = t('Anotações — {name}', { name });
      notesModal.hidden = false;
      await renderNotes();
    };
    actions.append(view, open, notes);
    li.appendChild(actions);
  }

  for (const rec of visibleRecords) {
    const file =
      byPath.get(rec.path) || (rec.hash ? files.find((f) => f.name.startsWith(rec.hash + '-')) : undefined);
    const li = document.createElement('li');
    li.dataset.attachmentId = rec._id;
    const pub = pubById.get(rec.pub_id);
    const meta = [file ? formatFileSize(file.size) : t('arquivo ausente'), pub.title || rec.name || rec._id]
      .filter(Boolean)
      .join(' · ');
    renderAttachment(li, file, rec._id, rec.name || rec._id, meta);
    attachmentsEl.appendChild(li);
  }
}

document.getElementById('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('title').value.trim();
  if (!title) return;
  const type = normalizePubType(document.getElementById('type').value || 'article');
  const pub = {
    _id: crypto.randomUUID(),
    title,
    type,
    authors: parseAuthorsInput(document.getElementById('authors').value),
    year: document.getElementById('year').value || undefined,
    folder: document.getElementById('folder').value.trim() || undefined
  };
  for (const [key, value] of [
    ['doi', document.getElementById('create-doi').value],
    ['url', document.getElementById('create-url').value],
    ['language', document.getElementById('create-language').value]
  ]) {
    if (value.trim()) pub[key] = value.trim();
  }
  for (const input of document.querySelectorAll('#create-fields [data-create-field]')) {
    const value = input.value.trim();
    if (value) pub[input.dataset.createField] = value;
  }
  await api.data.call('library:put', pub);
  document.getElementById('add-form').reset();
  createFieldValues = {};
  renderCreateFields(document.getElementById('type').value || 'article');
  createModal.hidden = true;
  await refresh();
});

async function attachmentText(filePath) {
  try {
    const raw = await api.attachments.read(filePath);
    if (!raw) return undefined;
    const bytes =
      raw instanceof Uint8Array
        ? raw
        : Array.isArray(raw)
          ? new Uint8Array(raw)
          : new Uint8Array(raw.data || raw);
    return await window.PdfText?.extractText(bytes);
  } catch {
    return undefined;
  }
}

function pdfNameFromUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const last = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
    if (last && /\.pdf$/i.test(last)) return last;
    if (last) return `${last.replace(/[^\w.-]+/g, '_')}.pdf`;
  } catch {}
  return 'artigo.pdf';
}

function pdfTitleFromUrl(rawUrl, fallback) {
  const name = pdfNameFromUrl(rawUrl).replace(/\.pdf$/i, '');
  const clean = name
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean || fallback || 'PDF importado';
}

async function importPdfFromUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl).trim());
  } catch {
    statusEl.textContent = t('endereço de PDF inválido');
    throw new Error(t('Endereço de PDF inválido.'));
  }
  if (!/^https?:$/i.test(url.protocol)) {
    statusEl.textContent = t('use um link http(s) para importar o PDF');
    throw new Error(t('Endereço de PDF inválido.'));
  }
  const fallbackTitle = pdfTitleFromUrl(url.href);
  statusEl.textContent = t('baixando PDF…');
  let saved;
  try {
    saved = await api.pdf.download({
      url: url.href,
      name: fallbackTitle
    });
  } catch (err) {
    statusEl.textContent = t('não foi possível baixar o PDF: {msg}', { msg: err.message });
    throw err;
  }
  const title = saved.title && saved.title !== fallbackTitle ? saved.title : fallbackTitle;
  statusEl.textContent = t('extraindo texto do PDF…');
  const text = await attachmentText(saved.path);
  const pub = {
    _id: crypto.randomUUID(),
    type: normalizePubType(saved.type || 'article'),
    title,
    authors: Array.isArray(saved.authors) && saved.authors.length ? saved.authors : undefined,
    year: saved.year || undefined,
    journal: saved.journal || undefined,
    conference: saved.conference || undefined,
    volume: saved.volume || undefined,
    issue: saved.issue || undefined,
    pages: saved.pages || undefined,
    issn: saved.issn || undefined,
    isbn: saved.isbn || undefined,
    publisher: saved.publisher || undefined,
    place: saved.place || undefined,
    language: saved.language || undefined,
    abstract: saved.abstract || undefined,
    doi: saved.doi || undefined,
    url: url.href,
    accessed: new Date().toISOString().slice(0, 10),
    created_at: Date.now()
  };
  await api.data.call('library:put', pub);
  await api.data.call('attachments:add', {
    pub_id: pub._id,
    name: saved.name,
    path: saved.path,
    hash: saved.hash,
    size: saved.size,
    mime: 'application/pdf',
    text,
    created_at: Date.now()
  });
  statusEl.textContent = t('PDF importado: {title}', { title });
  await refresh();
  await refreshAttachments();
  return pub;
}

async function importDroppedPdfFiles(files) {
  let count = 0;
  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const saved = await api.attachments.save(file.name, Array.from(new Uint8Array(buffer)));
    const text = await extractPdfText(file);
    const title = file.name
      .replace(/\.pdf$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'PDF importado';
    const pub = {
      _id: crypto.randomUUID(),
      title,
      created_at: Date.now()
    };
    await api.data.call('library:put', pub);
    await api.data.call('attachments:add', {
      pub_id: pub._id,
      name: file.name,
      path: saved.path,
      hash: saved.hash,
      size: saved.size,
      mime: file.type || 'application/pdf',
      text,
      created_at: Date.now()
    });
    count += 1;
  }
  if (count) {
    await refresh();
    await refreshAttachments();
  }
  return count;
}

async function importPdfFiles(files) {
  if (!files.length) return 0;
  return importDroppedPdfFiles(files);
}

async function uploadPickedFiles() {
  const input = document.getElementById('file');
  const files = [...(input.files || [])];
  await importPdfFiles(files);
  input.value = '';
}

document.getElementById('upload')?.addEventListener('click', () => document.getElementById('file').click());
document.getElementById('file').addEventListener('change', () => uploadPickedFiles().catch(() => {}));

window.addEventListener('dragover', (event) => {
  const types = [...(event.dataTransfer?.types || [])];
  if (types.includes('Files') || types.includes('text/uri-list') || types.includes('text/plain') || types.includes('text/html')) {
    event.preventDefault();
    document.getElementById('drop-overlay').hidden = false;
  }
});

window.addEventListener('dragleave', (event) => {
  if (!event.relatedTarget) document.getElementById('drop-overlay').hidden = true;
});

window.addEventListener('drop', (event) => {
  document.getElementById('drop-overlay').hidden = true;
  const files = [...(event.dataTransfer?.files || [])].filter(
    (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  );
  if (files.length) {
    event.preventDefault();
    statusEl.textContent = t('importando {n} PDF(s)...', { n: files.length });
    importDroppedPdfFiles(files)
      .then((count) => {
        statusEl.textContent = t('{n} PDF(s) importado(s)', { n: count });
      })
      .catch((err) => {
        statusEl.textContent = t('erro ao importar: {msg}', { msg: err.message });
      });
    return;
  }
  const droppedText =
    event.dataTransfer?.getData('text/uri-list') ||
    event.dataTransfer?.getData('text/plain') ||
    event.dataTransfer?.getData('text/html') ||
    '';
  const url = String(droppedText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^https?:\/\//i.test(line));
  if (!url) return;
  event.preventDefault();
  importPdfFromUrl(url).catch(() => {});
});

document.getElementById('pub-file').addEventListener('change', async (e) => {
  const files = [...(e.target.files || [])];
  if (!files.length || !pendingPub) return;
  const pubId = pendingPub;
  pendingPub = null;
  statusEl.textContent = t('anexando...');
  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const saved = await api.attachments.save(file.name, Array.from(new Uint8Array(buffer)));
    await api.data.call('attachments:add', {
      pub_id: pubId,
      name: file.name,
      path: saved.path,
      hash: saved.hash,
      size: saved.size,
      mime: file.type || 'application/pdf',
      text: await extractPdfText(file)
    });
  }
  e.target.value = '';
  statusEl.textContent = t('anexado');
  await refresh();
  await refreshAttachments();
});

async function enrichPubMetadata(pub) {
  if (!api.metadata?.lookup) return pub;
  if (pub.doi && pub.volume && pub.issue && pub.pages) return pub;
  const url = pub.url || pub.pdf_url;
  if (!pub.doi && !url) return pub;
  try {
    const meta = await api.metadata.lookup({ doi: pub.doi, url });
    const merged = { ...pub };
    for (const key of [
      'type',
      'title',
      'authors',
      'year',
      'journal',
      'conference',
      'volume',
      'issue',
      'pages',
      'issn',
      'isbn',
      'publisher',
      'place',
      'language',
      'doi',
      'url',
      'abstract'
    ]) {
      const value = meta[key];
      const empty =
        merged[key] === undefined ||
        merged[key] === null ||
        merged[key] === '' ||
        (Array.isArray(merged[key]) && !merged[key].length);
      if (empty && value !== undefined && value !== null && value !== '') merged[key] = value;
    }
    if (!merged.accessed && !merged.doi && merged.url) {
      merged.accessed = new Date().toISOString().slice(0, 10);
    }
    return merged;
  } catch {
    return pub;
  }
}

function extractDoi(value) {
  const match = String(value || '')
    .trim()
    .match(/^(?:(?:https?:\/\/)?(?:dx\.)?doi\.org\/|doi:\s*)?(10\.\d{4,9}\/[-._;()/:a-z0-9]+)$/i);
  return match ? match[1] : null;
}

function renderSearchResult(pub) {
  const li = document.createElement('li');
  const title = document.createElement('strong');
  title.textContent = pub.title || '(sem título)';
  const meta = document.createElement('div');
  meta.className = 'muted';
  meta.textContent = [
    (pub.authors || []).join(', '),
    pub.year,
    pub.journal,
    pub.doi
  ]
    .filter(Boolean)
    .join(' · ');
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn primary';
  add.textContent = t('Adicionar');
  add.onclick = async () => {
    add.disabled = true;
    const enriched = await enrichPubMetadata(pub);
    await api.data.call('library:put', enriched);
    statusEl.textContent = t('adicionado pela busca');
    searchModal.hidden = true;
    await refresh();
  };
  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '6px';
  actions.style.alignItems = 'center';
  actions.appendChild(add);
  const hasPdfLink = /^https?:/i.test(pub.pdf_url || '') || /^https?:/i.test(pub.pdf_url_alt || '');
  if (hasPdfLink || pub.doi) {
    const download = document.createElement('button');
    download.textContent = t('Baixar PDF');
    download.className = 'secondary';
    download.title = t('Baixar o PDF de acesso aberto e anexar à referência');
    const downloadStatus = document.createElement('span');
    downloadStatus.className = 'muted';
    downloadStatus.style.fontSize = '11px';
    download.onclick = async () => {
      download.disabled = true;
      add.disabled = true;
      download.textContent = t('Baixando...');
      downloadStatus.textContent = t('buscando PDF de acesso aberto');
      try {
        const saved = await api.pdf.download({
          url: pub.pdf_url,
          altUrl: pub.pdf_url_alt,
          doi: pub.doi,
          name: pub.title || pub.citekey || 'artigo'
        });
        downloadStatus.textContent = t('extraindo texto do PDF…');
        let text;
        try {
          const raw = await api.attachments.read(saved.path);
          if (raw) {
            const bytes =
              raw instanceof Uint8Array
                ? raw
                : Array.isArray(raw)
                  ? new Uint8Array(raw)
                  : new Uint8Array(raw.data || raw);
            text = await window.PdfText?.extractText(bytes);
          }
        } catch {}
        const enriched = await enrichPubMetadata({
          ...pub,
          type: pub.type || saved.type,
          title: pub.title || saved.title,
          authors: pub.authors?.length ? pub.authors : saved.authors,
          year: pub.year || saved.year,
          journal: pub.journal || saved.journal,
          conference: pub.conference || saved.conference,
          volume: pub.volume || saved.volume,
          issue: pub.issue || saved.issue,
          pages: pub.pages || saved.pages,
          issn: pub.issn || saved.issn,
          publisher: pub.publisher || saved.publisher,
          place: pub.place || saved.place,
          language: pub.language || saved.language,
          abstract: pub.abstract || saved.abstract,
          doi: pub.doi || saved.doi
        });
        await api.data.call('library:put', enriched);
        await api.data.call('attachments:add', {
          pub_id: pub._id,
          name: saved.name,
          path: saved.path,
          hash: saved.hash,
          size: saved.size,
          mime: 'application/pdf',
          text,
          created_at: Date.now()
        });
        statusEl.textContent = t('PDF baixado e anexado');
        searchModal.hidden = true;
        await refresh();
        await refreshAttachments();
      } catch (err) {
        download.disabled = false;
        add.disabled = false;
        download.textContent = t('Baixar PDF');
        downloadStatus.textContent = String(err.message || t('não foi possível baixar o PDF'));
      }
    };
    actions.append(download, downloadStatus);
  } else {
    const hint = document.createElement('span');
    hint.className = 'muted';
    hint.style.fontSize = '11px';
    hint.textContent = t('Sem PDF automático disponível');
    actions.appendChild(hint);
  }
  li.append(title, meta, actions);
  searchResultsEl.appendChild(li);
}

const SEARCH_PAGE_SIZE = 10;
let onlineSearchState = null;

function searchSourceName(source) {
  return { crossref: 'Crossref', arxiv: 'arXiv', pubmed: 'PubMed', google: t('Google Acadêmico') }[source] ||
    'Crossref';
}

function setSearchMoreVisible(visible) {
  const wrap = document.getElementById('search-more');
  const button = document.getElementById('load-more-search');
  const status = document.getElementById('search-more-status');
  if (!wrap || !button) return;
  wrap.hidden = !visible;
  button.disabled = false;
  button.textContent = t('Carregar mais');
  if (status) status.textContent = '';
}

function updateSearchSummary(state = onlineSearchState) {
  const summary = document.getElementById('search-summary');
  if (!summary || !state) return;
  summary.textContent = t('{n} resultado(s) em {source}', {
    n: state.count,
    source: state.sourceName
  });
}

function searchHasMore(state, results) {
  if (!results.length) return false;
  // Google may return fewer than ten usable blocks on a full page.
  if (state.source === 'google') return results.length >= 8;
  return results.length >= SEARCH_PAGE_SIZE;
}

function appendSearchResults(results, state = onlineSearchState) {
  if (!state) return;
  for (const pub of results) {
    const key = pub._id || `${pub.title || ''}|${pub.year || ''}`;
    if (state.ids.has(key)) continue;
    state.ids.add(key);
    renderSearchResult(pub);
    state.count++;
  }
  state.offset += SEARCH_PAGE_SIZE;
  updateSearchSummary(state);
}

function showSearchError(err) {
  const details = String(err.message || '');
  const connectionIssue = /fetch failed|network|ENOTFOUND|EAI_AGAIN|ECONN|abort|timeout|timed out|HTTP 5/i.test(details);
  searchResultsEl.innerHTML = '';
  const li = document.createElement('li');
  li.className = 'muted';
  li.textContent = connectionIssue
    ? t('Não foi possível conectar à base de artigos. Verifique sua internet e tente novamente.')
    : t('Não foi possível concluir a busca. {msg}', { msg: details });
  const retry = document.createElement('button');
  retry.textContent = t('Tentar novamente');
  retry.className = 'secondary';
  retry.style.marginLeft = '8px';
  retry.onclick = () => runOnlineSearch();
  li.appendChild(retry);
  searchResultsEl.appendChild(li);
}

async function loadMoreSearch() {
  const state = onlineSearchState;
  const button = document.getElementById('load-more-search');
  const status = document.getElementById('search-more-status');
  const runButton = document.getElementById('run-search');
  if (!state || state.loading || !button) return;
  state.loading = true;
  runButton.disabled = true;
  button.disabled = true;
  button.textContent = t('Buscando...');
  if (status) status.textContent = '';
  try {
    const results = await api.metadata.search({
      source: state.source,
      query: state.query,
      offset: state.offset,
      limit: SEARCH_PAGE_SIZE
    });
    if (onlineSearchState !== state) return;
    if (!results.length) {
      state.hasMore = false;
      setSearchMoreVisible(false);
      return;
    }
    appendSearchResults(results, state);
    state.hasMore = searchHasMore(state, results);
    setSearchMoreVisible(state.hasMore);
  } catch (err) {
    const details = String(err.message || '');
    if (status) status.textContent = t('Não foi possível carregar mais resultados. {msg}', { msg: details });
    button.disabled = false;
    button.textContent = t('Carregar mais');
  } finally {
    state.loading = false;
    runButton.disabled = false;
  }
}

async function runOnlineSearch() {
  const query = searchQueryEl.value.trim();
  if (!query) {
    searchQueryEl.focus();
    return;
  }
  const source = document.getElementById('search-source').value;
  const doi = extractDoi(query);
  const sourceName = doi ? 'Crossref' : searchSourceName(source);
  const runButton = document.getElementById('run-search');
  if (runButton.disabled) return;
  runButton.disabled = true;
  runButton.textContent = t('Buscando...');
  onlineSearchState = null;
  setSearchMoreVisible(false);
  searchResultsEl.innerHTML = `<li class="muted">${
    doi ? t('consultando DOI...') : t('buscando em {source}...', { source: sourceName })
  }</li>`;
  try {
    if (doi) {
      const results = [await api.doi.lookup(doi)];
      searchResultsEl.innerHTML = '';
      const summary = document.createElement('li');
      summary.className = 'muted';
      summary.textContent = t('{n} resultado(s) em {source}', { n: results.length, source: sourceName });
      searchResultsEl.appendChild(summary);
      for (const pub of results) renderSearchResult(pub);
      return;
    }

    const state = {
      source,
      query,
      sourceName,
      offset: 0,
      count: 0,
      hasMore: false,
      loading: false,
      ids: new Set()
    };
    onlineSearchState = state;
    const results = await api.metadata.search({
      source,
      query,
      offset: 0,
      limit: SEARCH_PAGE_SIZE
    });
    searchResultsEl.innerHTML = '';
    const summary = document.createElement('li');
    summary.id = 'search-summary';
    summary.className = 'muted';
    searchResultsEl.appendChild(summary);
    appendSearchResults(results);
    state.hasMore = searchHasMore(state, results);
    setSearchMoreVisible(state.hasMore);
    if (!state.count) {
      searchResultsEl.innerHTML =
        `<li class="muted">${t('Nenhum artigo encontrado. Tente outras palavras-chave ou outra base de busca.')}</li>`;
    }
  } catch (err) {
    onlineSearchState = null;
    setSearchMoreVisible(false);
    showSearchError(err);
  } finally {
    runButton.disabled = false;
    runButton.textContent = t('Buscar');
  }
}

document.getElementById('open-search').onclick = () => {
  searchModal.hidden = false;
  searchQueryEl.focus();
};
document.getElementById('close-search').onclick = () => {
  searchModal.hidden = true;
};
document.getElementById('run-search').onclick = () => runOnlineSearch();
document.getElementById('load-more-search').onclick = () => loadMoreSearch();
searchQueryEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') runOnlineSearch();
});

document.getElementById('add-doi').addEventListener('click', async () => {
  const doi = document.getElementById('doi').value.trim();
  if (!doi) return;
  statusEl.textContent = t('consultando DOI...');
  try {
    const pub = await api.doi.lookup(doi);
    await api.data.call('library:put', pub);
    document.getElementById('doi').value = '';
    createModal.hidden = true;
    statusEl.textContent = t('DOI adicionado');
    await refresh();
  } catch (err) {
    statusEl.textContent = t('erro no DOI: {msg}', { msg: err.message });
  }
});

document.getElementById('import-bib').addEventListener('click', () => {
  document.getElementById('bibfile').click();
});

document.getElementById('bibfile').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const entries = window.BibTeX.parseBibtex(text);
  for (const entry of entries) await api.data.call('library:put', entry);
  e.target.value = '';
  await refresh();
});

document.getElementById('export-bib').addEventListener('click', async () => {
  const pubs = await api.data.call('library:all');
  const result = await saveTextFile(window.BibTeX.toBibtex(pubs), 'library.bib', 'BibTeX');
  if (result.canceled) statusEl.textContent = t('exportação cancelada');
});

document.getElementById('duplicates').addEventListener('click', async () => {
  const groups = await api.data.call('duplicates:find');
  const total = groups.reduce((n, g) => n + g.length, 0);
  statusEl.textContent = groups.length
    ? t('{n} grupo(s) de duplicatas, {m} referências', { n: groups.length, m: total })
    : t('nenhuma duplicata encontrada');
});

document.getElementById('merge-dups').addEventListener('click', async () => {
  const result = await api.data.call('duplicates:mergeAll');
  statusEl.textContent = result.merged
    ? t('{n} duplicata(s) mesclada(s) em {m} grupo(s)', { n: result.merged, m: result.groupCount })
    : t('nenhuma duplicata para mesclar');
  await refresh();
});

document.getElementById('import-ris').addEventListener('click', () => {
  document.getElementById('risfile').click();
});

document.getElementById('risfile').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const entries = window.RIS.parseRIS(await file.text());
  for (const entry of entries) await api.data.call('library:put', entry);
  e.target.value = '';
  await refresh();
});

document.getElementById('export-ris').addEventListener('click', async () => {
  const pubs = await api.data.call('library:all');
  const result = await saveTextFile(window.RIS.toRIS(pubs), 'library.ris', 'RIS');
  if (result.canceled) statusEl.textContent = t('exportação cancelada');
});

document.getElementById('import-notes').addEventListener('click', () => {
  document.getElementById('notesfile').click();
});

document.getElementById('notesfile').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const notes = JSON.parse(await file.text());
    if (!Array.isArray(notes)) throw new Error(t('Esperado um array JSON'));
    for (const note of notes) {
      const { _id, ...rest } = note;
      await api.data.call('notes:add', rest);
    }
    statusEl.textContent = t('{n} anotação(ões) importada(s)', { n: notes.length });
    await refresh();
  } catch (err) {
    statusEl.textContent = t('erro ao importar: {msg}', { msg: err.message });
  } finally {
    e.target.value = '';
  }
});

document.getElementById('export-notes').addEventListener('click', async () => {
  const notes = await api.data.call('notes:all');
  const result = await saveTextFile(JSON.stringify(notes, null, 2), 'annotations.json', 'JSON');
  if (result.canceled) statusEl.textContent = t('exportação cancelada');
});

document.getElementById('export-md').addEventListener('click', async () => {
  const [pubs, notes] = await Promise.all([
    api.data.call('library:all'),
    api.data.call('notes:all')
  ]);
  const result = await saveTextFile(
    window.MarkdownExport.toMarkdown(pubs, notes),
    'library.md',
    'Markdown'
  );
  if (result.canceled) statusEl.textContent = t('exportação cancelada');
});

document.getElementById('export-csv').addEventListener('click', async () => {
  const pubs = await api.data.call('library:all');
  const result = await saveTextFile(window.CSVExport.toCSV(pubs), 'library.csv', 'CSV');
  if (result.canceled) statusEl.textContent = t('exportação cancelada');
});

async function addCollection() {
  const name = collectionNameEl.value.trim();
  if (!name) {
    statusEl.textContent = t('digite um nome para a coleção');
    collectionNameEl.focus();
    return;
  }
  const collections = await api.data.call('collections:all');
  const duplicate = collections.some(
    (col) => String(col.name).trim().toLocaleLowerCase() === name.toLocaleLowerCase()
  );
  if (duplicate) {
    statusEl.textContent = t('já existe uma coleção chamada “{name}”', { name });
    collectionNameEl.select();
    return;
  }
  await api.data.call('collections:save', {
    name,
    cParent: collectionParentEl.value || undefined,
    color: COLLECTION_COLORS[collections.length % COLLECTION_COLORS.length]
  });
  collectionNameEl.value = '';
  statusEl.textContent = t('coleção criada: {name}', { name });
  await refresh();
}

document.getElementById('add-collection').addEventListener('click', addCollection);
collectionNameEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addCollection().catch((err) => (statusEl.textContent = t('erro ao criar coleção: {msg}', { msg: err.message })));
  }
});

document.getElementById('export-selected').addEventListener('click', async () => {
  const ids = [...document.querySelectorAll('#list input.select-pub:checked')].map((el) => el.dataset.pubId);
  if (!ids.length) {
    statusEl.textContent = t('selecione referências primeiro');
    return;
  }
  const pubs = await api.data.call('library:all');
  const selected = pubs.filter((p) => ids.includes(p._id));
  const result = await saveTextFile(window.BibTeX.toBibtex(selected), 'selected.bib', 'BibTeX');
  statusEl.textContent = result.canceled
    ? t('exportação cancelada')
    : t('{n} exportada(s)', { n: selected.length });
});

document.getElementById('delete-selected').addEventListener('click', async () => {
  const ids = [...document.querySelectorAll('#list input.select-pub:checked')].map((el) => el.dataset.pubId);
  if (!ids.length) {
    statusEl.textContent = t('selecione referências primeiro');
    return;
  }
  if (currentView === 'trash') {
    if (!confirm(t('Excluir permanentemente {n} referência(s)?', { n: ids.length }))) return;
    for (const id of ids) await api.data.call('library:delete', id);
    statusEl.textContent = t('{n} excluída(s) permanentemente', { n: ids.length });
  } else {
    const pubs = await api.data.call('library:all');
    for (const pub of pubs.filter((p) => ids.includes(p._id))) {
      await api.data.call('library:put', { ...pub, trashed: true });
    }
    statusEl.textContent = t('{n} movida(s) para a lixeira', { n: ids.length });
  }
  await refresh();
  await refreshAttachments();
});

document.getElementById('move-selected').addEventListener('click', async () => {
  const ids = [...document.querySelectorAll('#list input.select-pub:checked')].map((el) => el.dataset.pubId);
  if (!ids.length) return;
  const target = moveTargetEl.value;
  const pubs = await api.data.call('library:all');
  for (const pub of pubs.filter((p) => ids.includes(p._id))) {
    if (target) {
      await api.data.call('library:put', { ...pub, folder: target });
    } else {
      const { folder, ...rest } = pub;
      await api.data.call('library:put', rest);
    }
  }
  statusEl.textContent = t('{n} movida(s)', { n: ids.length });
  await refresh();
});

document.getElementById('empty-trash').addEventListener('click', async () => {
  const pubs = await api.data.call('library:all');
  const trashed = pubs.filter((p) => p.trashed);
  if (!trashed.length) {
    statusEl.textContent = t('a lixeira já está vazia');
    return;
  }
  if (!confirm(t('Excluir permanentemente {n} referência(s) da lixeira?', { n: trashed.length }))) {
    statusEl.textContent = t('esvaziamento cancelado');
    return;
  }
  for (const pub of trashed) await api.data.call('library:delete', pub._id);
  statusEl.textContent = t('lixeira esvaziada: {n}', { n: trashed.length });
  await refresh();
  await refreshAttachments();
});

document.getElementById('backup').addEventListener('click', async () => {
  statusEl.textContent = t('criando backup...');
  try {
    const result = await api.backup.create();
    statusEl.textContent = result.canceled
      ? t('backup cancelado')
      : t('backup salvo: {refs} referências, {files} arquivos', { refs: result.references, files: result.attachments });
  } catch (err) {
    statusEl.textContent = t('erro no backup: {msg}', { msg: err.message });
  }
});

document.getElementById('restore').addEventListener('click', async () => {
  statusEl.textContent = t('restaurando backup...');
  try {
    const result = await api.backup.restore();
    if (result.canceled) {
      statusEl.textContent = t('restauração cancelada');
      return;
    }
    selectedPubId = null;
    statusEl.textContent = t('restaurado: {refs} referências, {files} arquivos', {
      refs: result.references,
      files: result.attachments
    });
    await refresh();
    await refreshAttachments();
  } catch (err) {
    statusEl.textContent = t('erro ao restaurar: {msg}', { msg: err.message });
  }
});

document.getElementById('clean-orphans').addEventListener('click', async () => {
  statusEl.textContent = t('limpando órfãos...');
  try {
    const records = await api.data.call('attachments:all');
    const keep = records.map((r) => r.path).filter(Boolean);
    const result = await api.attachments.cleanupOrphans(keep);
    statusEl.textContent = t('{n} órfão(s) removido(s)', { n: result.removed });
    await refreshAttachments();
  } catch (err) {
    statusEl.textContent = t('erro na limpeza: {msg}', { msg: err.message });
  }
});

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentView = btn.dataset.view || 'all';
    currentTag = null;
    currentFilter = null;
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b === btn));
    refresh().then(refreshAttachments).catch(() => {});
  });
});

searchEl.addEventListener('input', () => refresh().then(refreshAttachments).catch(() => {}));
folderFilterEl.addEventListener('change', () => {
  currentTag = null;
  currentFilter = null;
  refresh().then(refreshAttachments).catch(() => {});
});
showTrashedEl.addEventListener('change', () => refresh().then(refreshAttachments).catch(() => {}));
sortSelectEl.addEventListener('change', () => refresh().catch(() => {}));

const editTypeSelect = document.getElementById('edit-type');
for (const [value, label] of Object.entries(PUB_TYPE_LABELS)) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  editTypeSelect.appendChild(option);
}
editTypeSelect.value = 'article';
updateEditFieldVisibility('article');
document.getElementById('type').addEventListener('change', (event) => {
  renderCreateFields(event.target.value);
});
renderCreateFields('article');

const languageButtons = [...document.querySelectorAll('.lang-btn[data-lang]')];
if (i18n) {
  const currentLanguage = i18n.getLanguage();
  for (const button of languageButtons) {
    button.classList.toggle('active', button.dataset.lang === currentLanguage);
    button.setAttribute('aria-pressed', String(button.dataset.lang === currentLanguage));
    button.addEventListener('click', async () => {
      const language = button.dataset.lang;
      if (language === i18n.getLanguage()) return;
      i18n.setLanguage(language);
      localStorage.setItem('cite-language', language);
      try {
        await api.settings?.setLanguage?.(language);
      } catch {}
      const url = new URL(window.location.href);
      url.searchParams.set('lang', language);
      window.location.replace(url.toString());
    });
  }
}

document.querySelectorAll('a[data-external]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    api.shell.openExternal(link.href);
  });
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeCollectionColorMenu();
});

const launchParams = new URLSearchParams(window.location.search);
const launchData = window.__CITE_LAUNCH__ || {};
const launchAction = launchData.action || launchParams.get('action');
const launchFocus = launchData.id || launchParams.get('focus');
if (launchFocus) selectedPubId = launchFocus;

function runLaunchAction() {
  if (launchAction === 'new') {
    document.getElementById('add-menu-button').click();
    document.getElementById('create-new').click();
  } else if (launchAction === 'search') {
    openSearchModal();
  } else if (launchAction === 'import') {
    document.getElementById('file').click();
  }
}

refresh()
  .then(() => {
    runLaunchAction();
    return refreshAttachments();
  })
  .catch((err) => (statusEl.textContent = err.message));
