import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.bundle.js';
const t = window.CiteI18n?.t || ((text) => text);

const params = new URLSearchParams(location.search);
const file = params.get('file');
const attachment = params.get('attachment');
const pagesEl = document.getElementById('pages');
const annList = document.getElementById('ann-list');
const annSearch = document.getElementById('ann-search');
const annCount = document.getElementById('ann-count');
const editor = document.getElementById('comment-editor');
const commentText = document.getElementById('comment-text');
const deleteButton = document.getElementById('comment-delete');
const commentMenuButton = document.getElementById('comment-menu-button');
const commentMenu = document.getElementById('comment-menu');
const textEditor = document.getElementById('text-editor');
const textEditorInput = document.getElementById('text-editor-input');
const highlightMenu = document.getElementById('highlight-menu');
const shapeMenu = document.getElementById('shape-menu');
const textMenu = document.getElementById('text-menu');
const colorMenu = document.getElementById('color-menu');
const settingsMenu = document.getElementById('settings-menu');
const moreMenu = document.getElementById('more-menu');
const lightThemeButton = document.getElementById('light-theme');
const darkThemeButton = document.getElementById('dark-theme');
let notes = [];
let notesRetryTimer = null;
const pageMap = new Map();
let pendingSelection = null;
let editingNote = null;
let editorMode = null;
let activeTool = 'highlight';
let activeHighlightMode = 'highlight';
let activeShape = 'rectangle';
let currentColor = '#ffe268';
const NOTE_COLORS = ['#ffe268', '#f7b6d2', '#9ed7f7', '#a7e8a7'];
let noteColorMenu = null;
let textAnchor = null;
let viewerZoom = 1;
let viewerRotation = 0;
const fontSettings = { family: 'Helvetica, Arial, sans-serif', size: 14, bold: false, italic: false };

function toast(message) {
  const el = document.getElementById('status-toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 1800);
}

function storedTheme() {
  try {
    return localStorage.getItem('cite-theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyViewerTheme(theme, options = {}) {
  const value = theme === 'dark' ? 'dark' : 'light';
  const { persist = true, notify = false } = options;
  document.documentElement.dataset.theme = value;
  if (persist) {
    try {
      localStorage.setItem('cite-theme', value);
    } catch {}
  }
  lightThemeButton.classList.toggle('active', value === 'light');
  darkThemeButton.classList.toggle('active', value === 'dark');
  lightThemeButton.setAttribute('aria-pressed', String(value === 'light'));
  darkThemeButton.setAttribute('aria-pressed', String(value === 'dark'));
  if (notify) window.parent.postMessage({ type: 'ppd-set-theme', theme: value }, '*');
}

applyViewerTheme(params.get('theme') || storedTheme(), { persist: false });

function pageElement(page) {
  return pagesEl.querySelector(`.page[data-page="${page}"]`);
}

function mergeRects(rects = []) {
  const rows = [];  for (const raw of rects) {
    const r = {
      x: Number(raw.x) || 0,
      y: Number(raw.y) || 0,
      w: Number(raw.w) || 0,
      h: Number(raw.h) || 0
    };
    if (r.w <= 0 || r.h <= 0) continue;
    const center = r.y + r.h / 2;
    const row = rows.find((item) => Math.abs(item.center - center) <= 3);
    if (row) row.items.push(r);
    else rows.push({ center, items: [r] });
  }
  const merged = [];
  for (const row of rows) {
    const items = row.items.sort((a, b) => a.x - b.x);
    let current = null;
    for (const r of items) {
      if (!current) {
        current = { ...r };
        continue;
      }
      if (r.x <= current.x + current.w + 14) {
        const right = Math.max(current.x + current.w, r.x + r.w);
        const top = Math.min(current.y, r.y);
        const bottom = Math.max(current.y + current.h, r.y + r.h);
        current.x = Math.min(current.x, r.x);
        current.w = right - current.x;
        current.y = top;
        current.h = bottom - top;
      } else {
        merged.push(current);
        current = { ...r };
      }
    }
    if (current) merged.push(current);
  }
  return merged.map((r) => ({
    x: Math.round(r.x),
    y: Math.round(r.y),
    w: Math.round(r.w),
    h: Math.round(r.h)
  }));
}

function clampRects(rects = [], width = 0, height = 0) {
  const maxWidth = Number(width) || 0;
  const maxHeight = Number(height) || 0;
  if (!maxWidth || !maxHeight) return rects;
  return rects
    .map((r) => {
      const left = Math.max(0, r.x);
      const top = Math.max(0, r.y);
      const right = Math.min(maxWidth, r.x + r.w);
      const bottom = Math.min(maxHeight, r.y + r.h);
      return {
        x: Math.round(left),
        y: Math.round(top),
        w: Math.round(right - left),
        h: Math.round(bottom - top)
      };
    })
    .filter((r) => r.w > 0 && r.h > 0);
}

function activeCards() {
  for (const card of annList.querySelectorAll('.ann-card')) {
    card.classList.toggle('active', card.dataset.noteId === editingNote?._id);
  }
}

function closeNoteColorMenu() {
  noteColorMenu?.remove();
  noteColorMenu = null;
}

function rememberNoteColor(noteId, color) {
  noteId = String(noteId);
  const current = notes.find((note) => note._id === noteId);
  if (current) current.color = color;
  if (editingNote?._id === noteId) editingNote.color = color;
}

function setNoteColor(note, color) {
  rememberNoteColor(note._id, color);
  if (editingNote?._id === note._id) {
    setColorUI(color);
    updateCommentMenuSelection();
  }
  closeNoteColorMenu();
  renderOverlays();
  renderAnnotations();
  window.parent.postMessage(
    { type: 'ppd-update-note', attachment, noteId: note._id, color },
    '*'
  );
}

function openNoteColorMenu(anchor, note) {
  closeNoteColorMenu();
  const menu = document.createElement('div');
  menu.className = 'note-color-menu';
  menu.setAttribute('role', 'menu');
  for (const color of NOTE_COLORS) {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.className = 'note-color-choice';
    choice.dataset.color = color;
    choice.style.background = color;
    choice.title = t('Cor do comentário');
    choice.setAttribute('aria-label', t('Cor do comentário'));
    if (color === (note.color || '#ffe268')) choice.classList.add('selected');
    choice.addEventListener('click', (event) => {
      event.stopPropagation();
      setNoteColor(note, color);
    });
    menu.appendChild(choice);
  }
  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  const width = menu.offsetWidth || 112;
  const height = menu.offsetHeight || 38;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const top = rect.bottom + 6 + height > window.innerHeight - 8
    ? Math.max(8, rect.top - height - 6)
    : rect.bottom + 6;
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  noteColorMenu = menu;
  setTimeout(() => {
    document.addEventListener('mousedown', (event) => {
      if (!menu.contains(event.target)) closeNoteColorMenu();
    }, { once: true });
  }, 0);
}

function noteColorButton(note) {
  const color = note.color || '#ffe268';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'note-color-button';
  button.dataset.color = color;
  button.style.setProperty('--note-color', color);
  button.title = t('Cor do comentário');
  button.setAttribute('aria-label', t('Cor do comentário'));
  const dot = document.createElement('span');
  dot.className = 'note-color-dot';
  button.appendChild(dot);
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    openNoteColorMenu(button, note);
  });
  button.addEventListener('keydown', (event) => event.stopPropagation());
  return button;
}

function addCommentBadge(overlay, note, r) {
  if (!note.comment) return;
  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = 'comment-badge';
  badge.textContent = '…';
  badge.title = note.comment;
  badge.setAttribute('aria-label', t('Abrir comentário'));
  const pageWidth = overlay.clientWidth || 0;
  const pageHeight = overlay.clientHeight || 0;
  const left = pageWidth ? Math.min(r.x + r.w + 5, pageWidth - 24) : r.x + r.w + 5;
  const top = pageHeight ? Math.min(Math.max(0, r.y - 3), pageHeight - 22) : Math.max(0, r.y - 3);
  badge.style.left = `${Math.max(2, left)}px`;
  badge.style.top = `${top}px`;
  badge.addEventListener('click', (event) => {
    event.stopPropagation();
    openCommentEditor(note);
  });
  overlay.appendChild(badge);
}

function renderShape(note, overlay) {
  const r = note.rects?.[0];
  if (!r) return;
  const color = note.color || currentColor;
  const ns = 'http://www.w3.org/2000/svg';
  const shape = document.createElement('div');
  shape.className = 'shape-annotation';
  shape.dataset.noteId = note._id;
  shape.title = note.comment || note.text || '';
  shape.style.left = `${r.x}px`;
  shape.style.top = `${r.y}px`;
  shape.style.width = `${r.w}px`;
  shape.style.height = `${r.h}px`;
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', String(Math.max(1, r.w)));
  svg.setAttribute('height', String(Math.max(1, r.h)));
  svg.setAttribute('viewBox', `0 0 ${Math.max(1, r.w)} ${Math.max(1, r.h)}`);
  const stroke = color;
  const common = { fill: 'none', stroke, 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  if (note.shape === 'oval') {
    const el = document.createElementNS(ns, 'ellipse');
    el.setAttribute('cx', String(r.w / 2));
    el.setAttribute('cy', String(r.h / 2));
    el.setAttribute('rx', String(Math.max(1, r.w / 2 - 1)));
    el.setAttribute('ry', String(Math.max(1, r.h / 2 - 1)));
    Object.entries(common).forEach(([k, v]) => el.setAttribute(k, v));
    svg.appendChild(el);
  } else if (note.shape === 'arrow') {
    const x1 = 2, y1 = r.h - 2, x2 = r.w - 2, y2 = 2;
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    Object.entries(common).forEach(([k, v]) => line.setAttribute(k, v));
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const size = 9;
    const head = document.createElementNS(ns, 'polyline');
    const p1 = `${x2 - size * Math.cos(angle - Math.PI / 6)},${y2 - size * Math.sin(angle - Math.PI / 6)}`;
    const p2 = `${x2 - size * Math.cos(angle + Math.PI / 6)},${y2 - size * Math.sin(angle + Math.PI / 6)}`;
    head.setAttribute('points', `${p1} ${x2},${y2} ${p2}`);
    Object.entries(common).forEach(([k, v]) => head.setAttribute(k, v));
    svg.append(line, head);
  } else if (note.shape === 'pencil' || note.points?.length) {
    const path = document.createElementNS(ns, 'polyline');
    const points = (note.points || []).map((p) => `${p.x - r.x},${p.y - r.y}`).join(' ');
    path.setAttribute('points', points || `2,${r.h - 2} ${r.w - 2},2`);
    Object.entries(common).forEach(([k, v]) => path.setAttribute(k, v));
    svg.appendChild(path);
  } else {
    const el = document.createElementNS(ns, 'rect');
    el.setAttribute('x', '1'); el.setAttribute('y', '1');
    el.setAttribute('width', String(Math.max(1, r.w - 2)));
    el.setAttribute('height', String(Math.max(1, r.h - 2)));
    el.setAttribute('rx', '2');
    Object.entries(common).forEach(([k, v]) => el.setAttribute(k, v));
    svg.appendChild(el);
  }
  shape.appendChild(svg);
  shape.addEventListener('click', (event) => {
    event.stopPropagation();
    openCommentEditor(note);
  });
  overlay.appendChild(shape);
  addCommentBadge(overlay, note, r);
}

function renderTextNote(note, overlay) {
  const r = note.rects?.[0];
  if (!r) return;
  const el = document.createElement('div');
  el.className = 'text-annotation';
  el.dataset.noteId = note._id;
  el.style.left = `${r.x}px`;
  el.style.top = `${r.y}px`;
  el.style.minWidth = `${Math.max(24, r.w)}px`;
  el.style.minHeight = `${Math.max(18, r.h)}px`;
  el.style.color = note.color && note.color !== '#ffe268' ? note.color : '#1f2937';
  el.style.fontFamily = note.fontFamily || fontSettings.family;
  el.style.fontSize = `${note.fontSize || fontSettings.size}px`;
  el.style.fontWeight = note.bold ? '700' : '400';
  el.style.fontStyle = note.italic ? 'italic' : 'normal';
  el.textContent = note.text || '';
  el.title = note.comment || note.text || '';
  el.addEventListener('click', (event) => {
    event.stopPropagation();
    openCommentEditor(note);
  });
  overlay.appendChild(el);
  addCommentBadge(overlay, note, r);
}

function renderOverlays() {
  for (const [pageNum, overlay] of pageMap) {
    overlay.innerHTML = '';
    const pageNotes = notes.filter((n) => Number(n.page) === pageNum);
    pageNotes.forEach((note, i) => {
      if (note.type === 'shape') {
        renderShape(note, overlay);
        return;
      }
      if (note.type === 'text') {
        renderTextNote(note, overlay);
        return;
      }
      if (Array.isArray(note.rects) && note.rects.length) {
        const mode = note.mode || 'highlight';
        const pageEl = pageElement(pageNum);
        const displayRects = clampRects(mergeRects(note.rects), pageEl?.clientWidth, pageEl?.clientHeight);
        if (!displayRects.length) return;
        for (const r of displayRects) {
          const rect = document.createElement('div');
          rect.className = `hl-rect mode-${mode}`;
          rect.dataset.noteId = note._id;
          rect.title = note.comment || note.text;
          rect.style.left = `${r.x}px`;
          rect.style.top = `${r.y}px`;
          rect.style.width = `${r.w}px`;
          rect.style.height = `${r.h}px`;
          rect.style.setProperty('--annot-color', note.color || '#ffe268');
          if (mode === 'highlight') rect.style.background = note.color || '#ffe268';
          rect.addEventListener('click', (event) => {
            event.stopPropagation();
            openCommentEditor(note);
          });
          overlay.appendChild(rect);
        }
        addCommentBadge(overlay, note, displayRects[displayRects.length - 1]);
        return;
      }
      const div = document.createElement('div');
      div.className = 'hl';
      div.style.top = `${8 + i * 28}px`;
      div.style.background = note.color || '#ffe268';
      div.textContent = note.text;
      overlay.appendChild(div);
    });
  }
  activeCards();
}

function displayQuote(value) {
  return String(value || '')
    .replace(/\u00ad/g, '')
    .replace(/([a-zà-ÿ])-\s*\n\s*([a-zà-ÿ])/g, '$1$2')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function renderAnnotations() {
  const query = annSearch.value.trim().toLowerCase();
  const visible = notes
    .filter((note) => !query || `${note.text || ''} ${note.comment || ''}`.toLowerCase().includes(query))
    .slice()
    .sort((a, b) => Number(a.page || 0) - Number(b.page || 0));
  annList.innerHTML = '';
  annCount.textContent = notes.length ? `(${notes.length})` : '';
  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'ann-empty';
    empty.textContent = query
      ? t('Nenhuma anotação encontrada.')
      : t('Selecione um trecho no PDF para destacar ou comentar.');
    annList.appendChild(empty);
    return;
  }
  for (const note of visible) {
    const color = note.color || '#ffe268';
    const card = document.createElement('div');
    card.className = 'ann-card';
    card.dataset.noteId = note._id;
    card.dataset.color = color;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.style.setProperty('--note-color', color);
    const quote = document.createElement('div');
    quote.className = 'ann-quote';
    const shapeLabels = {
      rectangle: t('Retângulo'),
      oval: t('Oval'),
      arrow: t('Seta'),
      pencil: t('Desenho')
    };
    quote.textContent = displayQuote(note.text) || (note.type === 'shape' ? shapeLabels[note.shape] || t('Forma') : t('Anotação'));
    card.appendChild(quote);
    const meta = document.createElement('span');
    meta.className = 'ann-meta';
    meta.innerHTML = `<svg class="icon sm"><use href="#i-page"/></svg><span>${t('Página {page}', { page: note.page || '—' })}</span>`;
    card.appendChild(meta);
    if (note.comment) {
      const comment = document.createElement('div');
      comment.className = 'ann-comment';
      comment.textContent = note.comment;
      comment.style.background = tintColor(color, 0.38);
      comment.style.borderLeftColor = color;
      card.appendChild(comment);
    }
    card.appendChild(noteColorButton(note));
    const activate = () => openNote(note);
    card.addEventListener('click', activate);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });
    annList.appendChild(card);
  }
  activeCards();
  renderCommentCards();
}

function renderCommentCards() {
  const comments = notes
    .filter((note) => note.comment)
    .slice()
    .sort((a, b) => Number(a.page || 0) - Number(b.page || 0));
  document.body.classList.toggle('no-comments', comments.length === 0);
  document.getElementById('comments-count').textContent = comments.length ? `(${comments.length})` : '';
  const container = document.getElementById('comment-cards');
  container.innerHTML = '';
  if (!comments.length) {
    const empty = document.createElement('div');
    empty.className = 'comment-empty';
    empty.textContent = t('Nenhum comentário ainda. Selecione um trecho e clique em Comentar.');
    container.appendChild(empty);
    return;
  }
  for (const note of comments) {
    const color = note.color || '#ffe268';
    const card = document.createElement('div');
    card.className = 'comment-panel-card';
    card.dataset.color = color;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.style.setProperty('--note-color', color);
    card.style.background = tintColor(color, 0.35);
    card.style.borderColor = tintColor(color, 0.55);
    const text = document.createElement('div');
    text.className = 'comment-panel-text';
    text.textContent = note.comment;
    card.append(text, noteColorButton(note));
    const activate = () => {
      scrollToNote(note);
      openCommentEditor(note);
    };
    card.addEventListener('click', activate);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });
    container.appendChild(card);
  }
}

function flashNote(note) {
  for (const rect of pagesEl.querySelectorAll(`[data-note-id="${note._id}"]`)) {
    rect.classList.remove('flash');
    requestAnimationFrame(() => rect.classList.add('flash'));
  }
}

function scrollToNote(note) {
  const pageEl = pageElement(note.page);
  if (!pageEl) return;
  pageEl.scrollIntoView({ block: 'center' });
  if (note.rects?.length) {
    flashNote(note);
    setTimeout(() => positionEditor(note.page, note.rects), 80);
  }
}

function openNote(note) {
  scrollToNote(note);
  if (note.rects?.length) {
    setTimeout(() => openCommentEditor(note), 90);
  }
}

function positionEditor(page, rects) {
  const cardWidth = 306;
  const cardHeight = 176;
  const pageEl = pageElement(page);
  if (!pageEl || !rects?.length) {
    editor.style.left = `${Math.max(8, (window.innerWidth - cardWidth) / 2)}px`;
    editor.style.top = `${Math.max(8, (window.innerHeight - cardHeight) / 2)}px`;
    return;
  }
  const pageRect = pageEl.getBoundingClientRect();
  const last = rects[rects.length - 1];
  let left = pageRect.left + last.x + last.w + 10;
  if (left + cardWidth > window.innerWidth - 8) {
    left = pageRect.left + last.x - cardWidth - 10;
  }
  left = Math.max(8, Math.min(left, window.innerWidth - cardWidth - 8));
  const top = Math.max(8, Math.min(pageRect.top + last.y, window.innerHeight - cardHeight - 8));
  editor.style.left = `${left}px`;
  editor.style.top = `${top}px`;
}

function openCommentEditor(note) {
  editingNote = note || null;
  editorMode = note ? 'edit' : 'new';
  if (note?.color) setColorUI(note.color);
  commentText.value = note?.comment || '';
  deleteButton.hidden = !note?.comment;
  const title = editor.querySelector('.editor-title');
  title.textContent = note ? t('Comentário') : t('Adicionar comentário');
  if (note?.rects?.length) {
    positionEditor(note.page, note.rects);
  } else if (pendingSelection) {
    positionEditor(pendingSelection.page, pendingSelection.rects);
  }
  commentMenu.hidden = true;
  updateCommentMenuSelection();
  editor.hidden = false;
  activeCards();
  if (note) editor.focus({ preventScroll: true });
  else commentText.focus();
}

function closeCommentEditor() {
  editor.hidden = true;
  commentMenu.hidden = true;
  editingNote = null;
  editorMode = null;
  activeCards();
}

function updateCommentMenuSelection() {
  const color = editingNote?.color || currentColor;
  for (const item of commentMenu.querySelectorAll('.comment-color')) {
    item.classList.toggle('selected', item.dataset.color === color);
  }
}

function applyCommentColor(color) {
  updateColor(color);
  updateCommentMenuSelection();
  commentMenu.hidden = true;
}

function clearSelectionPaint() {
  document.querySelectorAll('.selection-rect').forEach((node) => node.remove());
}

function paintSelection(pageEl, rects) {
  clearSelectionPaint();
  const layer = pageEl?.querySelector('.selection-layer');
  if (!layer) return;
  for (const r of rects) {
    const rect = document.createElement('div');
    rect.className = 'selection-rect';
    rect.style.left = `${r.x}px`;
    rect.style.top = `${r.y}px`;
    rect.style.width = `${r.w}px`;
    rect.style.height = `${r.h}px`;
    layer.appendChild(rect);
  }
}

function readSelection() {
  const selection = window.getSelection();
  const text = selection?.toString().trim() || '';
  if (text.length < 2 || !selection.rangeCount) return null;
  const node = selection.anchorNode;
  const pageEl = (node?.nodeType === 1 ? node : node?.parentElement)?.closest('.page');
  const page = pageEl?.dataset.page;
  if (!pageEl || !page) return null;
  const range = selection.getRangeAt(0);
  const pageRect = pageEl.getBoundingClientRect();
  const rects = clampRects(
    mergeRects(
      [...range.getClientRects()].map((r) => ({
        x: Math.round((r.left - pageRect.left) / viewerZoom),
        y: Math.round((r.top - pageRect.top) / viewerZoom),
        w: Math.round(r.width / viewerZoom),
        h: Math.round(r.height / viewerZoom)
      }))
    ),
    pageEl.clientWidth || pageRect.width / viewerZoom,
    pageEl.clientHeight || pageRect.height / viewerZoom
  );
  if (!rects.length) return null;
  return { pageEl, page, text, rects };
}

function clearSelection() {
  window.getSelection()?.removeAllRanges();
  pendingSelection = null;
  actions.style.display = 'none';
  clearSelectionPaint();
}

function saveComment() {
  const comment = commentText.value.trim();
  if (editorMode === 'new') {
    if (!pendingSelection || !attachment) return;
    window.parent.postMessage(
      {
        type: 'ppd-add-highlight',
        attachment,
        page: pendingSelection.page,
        text: pendingSelection.text,
        rects: pendingSelection.rects,
        comment,
        mode: activeHighlightMode,
        color: currentColor
      },
      '*'
    );
    closeCommentEditor();
    clearSelection();
    return;
  }
  if (editingNote) {
    window.parent.postMessage(
      { type: 'ppd-update-note', attachment, noteId: editingNote._id, comment },
      '*'
    );
  }
  closeCommentEditor();
}

function deleteEditingNote() {
  if (!editingNote) return;
  window.parent.postMessage({ type: 'ppd-delete-note', attachment, noteId: editingNote._id }, '*');
  closeCommentEditor();
}

deleteButton.addEventListener('click', deleteEditingNote);

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Delete' && event.key !== 'Backspace') return;
  const typing = /input|textarea|select/i.test(event.target?.tagName || '') || event.target?.isContentEditable;
  if (typing || !editingNote) return;
  event.preventDefault();
  deleteEditingNote();
});

commentMenuButton.addEventListener('click', (event) => {
  event.stopPropagation();
  const open = commentMenu.hidden;
  closeAllMenus(commentMenu);
  if (open) updateCommentMenuSelection();
  commentMenu.hidden = !open;
  if (open) {
    const menuHeight = commentMenu.offsetHeight;
    const editorRect = editor.getBoundingClientRect();
    commentMenu.style.top = editorRect.top + 35 + menuHeight > window.innerHeight - 8
      ? `${Math.max(8 - editorRect.top, -menuHeight - 4)}px`
      : '35px';
  }
  commentMenuButton.setAttribute('aria-expanded', String(open));
});

document.getElementById('comment-reply').addEventListener('click', () => {
  commentMenu.hidden = true;
  commentText.focus();
  const end = commentText.value.length;
  commentText.setSelectionRange(end, end);
});

commentMenu.querySelectorAll('.comment-color').forEach((item) => {
  item.addEventListener('click', () => applyCommentColor(item.dataset.color));
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('#comment-menu') && !event.target.closest('#comment-menu-button')) {
    commentMenu.hidden = true;
  }
});

document.getElementById('comment-save').addEventListener('click', saveComment);
document.getElementById('comment-cancel').addEventListener('click', () => {
  if (editorMode === 'new') clearSelection();
  closeCommentEditor();
});
commentText.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (editorMode === 'new') clearSelection();
    closeCommentEditor();
  }
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    saveComment();
  }
});

function closeAllMenus(except = null) {
  for (const menu of document.querySelectorAll('.menu')) {
    if (menu !== except) menu.hidden = true;
  }
  if (commentMenu !== except) commentMenu.hidden = true;
}

function toggleMenu(button, menu) {
  const open = menu.hidden;
  closeAllMenus(menu);
  menu.hidden = !open;
  button?.setAttribute('aria-expanded', String(open));
}

function updateToolUI() {
  document.getElementById('highlight-tool').classList.toggle('active', activeTool === 'highlight');
  document.getElementById('shape-tool').classList.toggle('active', activeTool === 'shape');
  document.getElementById('text-tool').classList.toggle('active', activeTool === 'text');
  document.body.classList.toggle('tool-shape', activeTool === 'shape');
  document.body.classList.toggle('tool-text', activeTool === 'text');
  const shapeIcon = document.querySelector('#shape-tool use');
  if (shapeIcon) shapeIcon.setAttribute('href', `#i-${activeShape === 'rectangle' ? 'square' : activeShape}`);
  for (const item of document.querySelectorAll('[data-highlight-mode]')) {
    item.classList.toggle('active', item.dataset.highlightMode === activeHighlightMode);
  }
}

function setTool(tool) {
  activeTool = tool;
  if (tool === 'text') toast(t('Clique no PDF para inserir texto'));
  updateToolUI();
}

function setHighlightMode(mode) {
  activeHighlightMode = mode;
  activeTool = 'highlight';
  updateToolUI();
  closeAllMenus();
}

function tintColor(hex, ratio) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!match) return hex;
  const value = parseInt(match[1], 16);
  const mix = (channel) => Math.round(255 - (255 - channel) * ratio);
  return `rgb(${mix((value >> 16) & 255)}, ${mix((value >> 8) & 255)}, ${mix(value & 255)})`;
}

function setColorUI(color) {
  currentColor = color;
  document.getElementById('color-swatch').style.background = color;
  for (const swatch of document.querySelectorAll('.swatch')) {
    swatch.classList.toggle('selected', swatch.dataset.color === color);
  }
  editor.style.background = tintColor(color, 0.2);
  editor.style.borderColor = tintColor(color, 0.65);
}

function updateColor(color) {
  setColorUI(color);
  if (editingNote) {
    rememberNoteColor(editingNote._id, color);
    renderOverlays();
    renderAnnotations();
    updateCommentMenuSelection();
    window.parent.postMessage(
      { type: 'ppd-update-note', attachment, noteId: editingNote._id, color },
      '*'
    );
  }
}

document.getElementById('highlight-tool').addEventListener('click', (event) => {
  event.stopPropagation();
  setTool('highlight');
  closeAllMenus();
});
document.getElementById('highlight-caret').addEventListener('click', (event) => {
  event.stopPropagation();
  toggleMenu(document.getElementById('highlight-caret'), highlightMenu);
});
document.querySelectorAll('[data-highlight-mode]').forEach((item) => {
  item.addEventListener('click', () => setHighlightMode(item.dataset.highlightMode));
});
document.getElementById('annotations-off').addEventListener('click', () => {
  activeTool = 'select';
  updateToolUI();
  closeAllMenus();
  toast(t('Anotações desativadas'));
});
document.getElementById('shape-tool').addEventListener('click', (event) => {
  event.stopPropagation();
  setTool('shape');
  closeAllMenus();
});
document.getElementById('shape-caret').addEventListener('click', (event) => {
  event.stopPropagation();
  toggleMenu(document.getElementById('shape-caret'), shapeMenu);
});
document.querySelectorAll('[data-shape]').forEach((item) => {
  item.addEventListener('click', () => {
    activeShape = item.dataset.shape;
    activeTool = 'shape';
    updateToolUI();
    closeAllMenus();
    toast(t('{shape} ativo — arraste no PDF', { shape: item.textContent.trim().split(' ')[0] }));
  });
});
document.getElementById('text-tool').addEventListener('click', (event) => {
  event.stopPropagation();
  setTool('text');
  closeAllMenus();
});
document.getElementById('text-caret').addEventListener('click', (event) => {
  event.stopPropagation();
  toggleMenu(document.getElementById('text-caret'), textMenu);
});
document.getElementById('text-place').addEventListener('click', () => {
  setTool('text');
  closeAllMenus();
});
document.getElementById('color-button').addEventListener('click', (event) => {
  event.stopPropagation();
  toggleMenu(document.getElementById('color-button'), colorMenu);
});
document.querySelectorAll('.swatch').forEach((swatch) => {
  swatch.addEventListener('click', () => {
    updateColor(swatch.dataset.color);
    closeAllMenus();
  });
});

const fontFamilyEl = document.getElementById('font-family');
const fontSizeEl = document.getElementById('font-size');
const fontBoldEl = document.getElementById('font-bold');
const fontItalicEl = document.getElementById('font-italic');
fontFamilyEl.addEventListener('change', () => (fontSettings.family = fontFamilyEl.value));
fontSizeEl.addEventListener('change', () => (fontSettings.size = Number(fontSizeEl.value) || 14));
fontBoldEl.addEventListener('click', () => {
  fontSettings.bold = !fontSettings.bold;
  fontBoldEl.classList.toggle('active', fontSettings.bold);
});
fontItalicEl.addEventListener('click', () => {
  fontSettings.italic = !fontSettings.italic;
  fontItalicEl.classList.toggle('active', fontSettings.italic);
});

document.getElementById('settings-button').addEventListener('click', (event) => {
  event.stopPropagation();
  toggleMenu(document.getElementById('settings-button'), settingsMenu);
});
document.getElementById('more-button').addEventListener('click', (event) => {
  event.stopPropagation();
  toggleMenu(document.getElementById('more-button'), moreMenu);
});
document.getElementById('menu-find').addEventListener('click', () => {
  closeAllMenus();
  findInput.focus();
  findInput.select();
});
function requestExport() {
  if (!attachment) return;
  closeAllMenus();
  window.parent.postMessage({ type: 'ppd-export-notes', attachment }, '*');
}
document.getElementById('export-annotations').addEventListener('click', requestExport);
document.getElementById('export-annotations-button').addEventListener('click', requestExport);
document.getElementById('download-button').addEventListener('click', () => {
  window.parent.postMessage({ type: 'ppd-open-external', path: file }, '*');
});
document.getElementById('open-external').addEventListener('click', () => {
  closeAllMenus();
  window.parent.postMessage({ type: 'ppd-open-external', path: file }, '*');
});
document.getElementById('show-in-cite').addEventListener('click', () => {
  closeAllMenus();
  window.parent.postMessage({ type: 'ppd-close-viewer' }, '*');
});
document.getElementById('back-home').addEventListener('click', () => {
  closeAllMenus();
  window.parent.postMessage({ type: 'ppd-close-viewer' }, '*');
});
lightThemeButton.addEventListener('click', () => {
  closeAllMenus();
  applyViewerTheme('light', { notify: true });
  toast(t('Tema claro ativo'));
});
darkThemeButton.addEventListener('click', () => {
  closeAllMenus();
  applyViewerTheme('dark', { notify: true });
  toast(t('Tema escuro ativo'));
});
document.getElementById('viewer-settings').addEventListener('click', () => {
  closeAllMenus();
  toast(t('O Cite usa o visualizador interno'));
});
document.getElementById('help-item').addEventListener('click', () => {
  closeAllMenus();
  toast(t('Selecione um trecho para destacar, sublinhar ou comentar'));
});
document.getElementById('shortcuts-item').addEventListener('click', () => {
  closeAllMenus();
  toast(t('H destacar · U sublinhar · T tachar · R retângulo · O oval · A seta · P lápis'));
});

function setZoom(zoom) {
  viewerZoom = Math.max(0.4, Math.min(3, zoom));
  pagesEl.style.zoom = String(viewerZoom);
  toast(`Zoom ${Math.round(viewerZoom * 100)}%`);
}
document.getElementById('zoom-in').addEventListener('click', () => { closeAllMenus(); setZoom(viewerZoom + 0.15); });
document.getElementById('zoom-out').addEventListener('click', () => { closeAllMenus(); setZoom(viewerZoom - 0.15); });
document.getElementById('zoom-auto').addEventListener('click', () => { closeAllMenus(); setZoom(1); });
document.getElementById('page-fit').addEventListener('click', () => {
  closeAllMenus();
  const first = document.querySelector('.page');
  if (!first) return;
  const naturalWidth = first.getBoundingClientRect().width / viewerZoom;
  const naturalHeight = first.getBoundingClientRect().height / viewerZoom;
  const main = document.getElementById('main');
  setZoom(Math.min((main.clientWidth - 44) / naturalWidth, (main.clientHeight - 54) / naturalHeight));
});
document.getElementById('page-width').addEventListener('click', () => {
  closeAllMenus();
  const first = document.querySelector('.page');
  if (!first) return;
  const naturalWidth = first.getBoundingClientRect().width / viewerZoom;
  setZoom((document.getElementById('main').clientWidth - 38) / naturalWidth);
});
function applyRotation() {
  pagesEl.style.transform = viewerRotation ? `rotate(${viewerRotation}deg)` : '';
  pagesEl.style.transformOrigin = 'top center';
}
document.getElementById('rotate-right').addEventListener('click', () => {
  closeAllMenus();
  viewerRotation = (viewerRotation + 90) % 360;
  applyRotation();
});
document.getElementById('rotate-left').addEventListener('click', () => {
  closeAllMenus();
  viewerRotation = (viewerRotation + 270) % 360;
  applyRotation();
});
document.getElementById('go-page').addEventListener('click', () => {
  closeAllMenus();
  const total = pageMap.size || 1;
  const answer = window.prompt(t('Ir para página (1–{total})', { total }), '1');
  if (!answer) return;
  const page = pageElement(String(Number(answer)));
  page?.scrollIntoView({ block: 'start', behavior: 'smooth' });
});

document.getElementById('comment-tool').addEventListener('click', () => {
  if (document.body.classList.contains('no-comments')) {
    toast(t('Nenhum comentário ainda — selecione um trecho e clique em Comentar'));
    return;
  }
  document.body.classList.toggle('comments-hidden');
});
document.getElementById('collapse-comments').addEventListener('click', () => {
  document.body.classList.add('comments-hidden');
});
document.getElementById('ann-search-toggle').addEventListener('click', () => {
  document.body.classList.remove('ann-hidden');
  annSearch.focus();
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.menu, #highlight-caret, #shape-caret, #text-caret, #color-button, #settings-button, #more-button')) {
    closeAllMenus();
  }
});

// Shape and text placement
let drawState = null;
function pageCoordinates(event) {
  const pageEl = event.target.closest?.('.page');
  if (!pageEl) return null;
  const rect = pageEl.getBoundingClientRect();
  return {
    pageEl,
    page: pageEl.dataset.page,
    x: (event.clientX - rect.left) / viewerZoom,
    y: (event.clientY - rect.top) / viewerZoom
  };
}

pagesEl.addEventListener('mousedown', (event) => {
  clearSelectionPaint();
  pendingSelection = null;
  actions.style.display = 'none';
  if (activeTool !== 'shape') return;
  const point = pageCoordinates(event);
  if (!point) return;
  event.preventDefault();
  drawState = {
    pageEl: point.pageEl,
    page: point.page,
    startX: point.x,
    startY: point.y,
    endX: point.x,
    endY: point.y,
    points: [{ x: point.x, y: point.y }],
    preview: null,
    svgPreview: null
  };
  const overlay = point.pageEl.querySelector('.overlay');
  if (activeShape === 'pencil') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.position = 'absolute';
    svg.style.left = '0';
    svg.style.top = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.overflow = 'visible';
    svg.style.pointerEvents = 'none';
    overlay.appendChild(svg);
    drawState.svgPreview = svg;
  } else {
    const preview = document.createElement('div');
    preview.style.position = 'absolute';
    preview.style.border = `2px solid ${currentColor}`;
    preview.style.borderRadius = activeShape === 'oval' ? '50%' : '2px';
    preview.style.pointerEvents = 'none';
    preview.style.opacity = '.8';
    overlay.appendChild(preview);
    drawState.preview = preview;
  }
  document.body.classList.add('drawing');
});

document.addEventListener('mousemove', (event) => {
  if (!drawState) return;
  const point = pageCoordinates(event);
  if (!point) return;
  const x = point.x;
  const y = point.y;
  if (activeShape === 'pencil') {
    drawState.points.push({ x, y });
    const minX = Math.min(...drawState.points.map((p) => p.x));
    const minY = Math.min(...drawState.points.map((p) => p.y));
    const svg = drawState.svgPreview;
    svg.innerHTML = '';
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    path.setAttribute('points', drawState.points.map((p) => `${p.x},${p.y}`).join(' '));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', currentColor);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return;
  }
  drawState.endX = x;
  drawState.endY = y;
  const left = Math.min(drawState.startX, x);
  const top = Math.min(drawState.startY, y);
  const width = Math.abs(x - drawState.startX);
  const height = Math.abs(y - drawState.startY);
  const preview = drawState.preview;
  preview.style.left = `${left}px`;
  preview.style.top = `${top}px`;
  preview.style.width = `${width}px`;
  preview.style.height = `${height}px`;
});

document.addEventListener('mouseup', () => {
  if (!drawState) return;
  const state = drawState;
  drawState = null;
  document.body.classList.remove('drawing');
  state.preview?.remove();
  state.svgPreview?.remove();
  if (!attachment) return;
  let rect;
  let points = [];
  if (activeShape === 'pencil') {
    if (state.points.length < 3) return;
    const xs = state.points.map((p) => p.x);
    const ys = state.points.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    rect = { x, y, w: Math.max(2, Math.max(...xs) - x), h: Math.max(2, Math.max(...ys) - y) };
    points = state.points;
  } else {
    const x = Math.min(state.startX, state.endX);
    const y = Math.min(state.startY, state.endY);
    const w = Math.abs(state.endX - state.startX);
    const h = Math.abs(state.endY - state.startY);
    if (w < 4 || h < 4) return;
    rect = { x, y, w, h };
  }
  const labels = { rectangle: 'Retângulo', oval: 'Oval', arrow: 'Seta', pencil: 'Desenho' };
  window.parent.postMessage(
    {
      type: 'ppd-add-annotation',
      attachment,
      page: state.page,
      kind: 'shape',
      shape: activeShape,
      text: labels[activeShape],
      rects: [rect],
      points,
      color: currentColor
    },
    '*'
  );
});

pagesEl.addEventListener('click', (event) => {
  if (activeTool !== 'text') return;
  const point = pageCoordinates(event);
  if (!point) return;
  event.preventDefault();
  textAnchor = { page: point.page, x: point.x, y: point.y, clientX: event.clientX, clientY: event.clientY };
  textEditorInput.value = '';
  textEditorInput.style.fontFamily = fontSettings.family;
  textEditorInput.style.fontSize = `${fontSettings.size}px`;
  textEditorInput.style.fontWeight = fontSettings.bold ? '700' : '400';
  textEditorInput.style.fontStyle = fontSettings.italic ? 'italic' : 'normal';
  const width = 320;
  textEditor.style.left = `${Math.max(8, Math.min(event.clientX + 8, window.innerWidth - width - 8))}px`;
  textEditor.style.top = `${Math.max(50, Math.min(event.clientY + 8, window.innerHeight - 170))}px`;
  textEditor.hidden = false;
  textEditorInput.focus();
});

function closeTextEditor() {
  textEditor.hidden = true;
  textAnchor = null;
}
function saveTextNote() {
  const text = textEditorInput.value.trim();
  if (!text || !textAnchor || !attachment) {
    closeTextEditor();
    return;
  }
  const width = Math.max(60, Math.min(420, text.length * fontSettings.size * 0.58 + 12));
  const height = Math.max(20, fontSettings.size * 1.45);
  window.parent.postMessage(
    {
      type: 'ppd-add-annotation',
      attachment,
      page: textAnchor.page,
      kind: 'text',
      text,
      rects: [{ x: textAnchor.x, y: textAnchor.y, w: width, h: height }],
      color: currentColor,
      fontFamily: fontSettings.family,
      fontSize: fontSettings.size,
      bold: fontSettings.bold,
      italic: fontSettings.italic
    },
    '*'
  );
  closeTextEditor();
  setTool('select');
}
document.getElementById('text-save').addEventListener('click', saveTextNote);
document.getElementById('text-cancel').addEventListener('click', closeTextEditor);
textEditorInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeTextEditor();
  }
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    saveTextNote();
  }
});

document.addEventListener('keydown', (event) => {
  const typing = /input|textarea|select/i.test(event.target?.tagName || '');
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    findInput.focus();
    findInput.select();
    return;
  }
  if (typing) return;
  const key = event.key.toLowerCase();
  if (key === 'h') { event.preventDefault(); setHighlightMode('highlight'); }
  else if (key === 'u') { event.preventDefault(); setHighlightMode('underline'); }
  else if (key === 't') { event.preventDefault(); setHighlightMode('strikethrough'); }
  else if (key === 'o') { event.preventDefault(); setTool('select'); }
  else if (key === 'r') { event.preventDefault(); activeShape = 'rectangle'; setTool('shape'); updateToolUI(); }
  else if (key === 'a') { event.preventDefault(); activeShape = 'arrow'; setTool('shape'); updateToolUI(); }
  else if (key === 'p') { event.preventDefault(); activeShape = 'pencil'; setTool('shape'); updateToolUI(); }
  else if (event.key === 'Escape') {
    closeAllMenus();
    closeNoteColorMenu();
    closeCommentEditor();
    closeTextEditor();
    translationPanel.hidden = true;
  }
});

window.addEventListener('scroll', () => {
  closeNoteColorMenu();
  if (!editor.hidden && editingNote) closeCommentEditor();
}, true);

const translationPanel = document.getElementById('translation-panel');
const translationSource = document.getElementById('translation-source');
const translationResult = document.getElementById('translation-result');
const translationTarget = document.getElementById('translation-target');
let translationRequest = 0;

function normalizeTranslationText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

translationTarget.value =
  params.get('lang') === 'tet' ? 'tet' : params.get('lang') === 'en' ? 'en' : 'pt';

document.addEventListener('pointerdown', (event) => {
  if (translationPanel.hidden) return;
  if (event.target.closest('#translation-panel') || event.target.closest('#translate-selection')) return;
  translationPanel.hidden = true;
});

window.addEventListener('message', (event) => {
  if (
    event.data?.type === 'ppd-translation' &&
    String(event.data.requestId) === String(translationRequest)
  ) {
    translationResult.textContent = event.data.error
      ? t('Erro ao traduzir: {msg}', { msg: event.data.error })
      : normalizeTranslationText(event.data.translated);
    return;
  }
  if (event.data?.type === 'ppd-notes') {
    notes = event.data.notes || [];
    if (notesRetryTimer) {
      clearInterval(notesRetryTimer);
      notesRetryTimer = null;
    }
    renderOverlays();
    renderAnnotations();
  }
  if (event.data?.type === 'ppd-toast') toast(event.data.message || '');
});

function requestNotes() {
  if (attachment && window.parent !== window) {
    window.parent.postMessage({ type: 'ppd-notes-request', attachment }, '*');
  }
}

if (attachment && window.parent !== window) {
  requestNotes();
  notesRetryTimer = setInterval(requestNotes, 500);
  setTimeout(() => {
    if (notesRetryTimer) {
      clearInterval(notesRetryTimer);
      notesRetryTimer = null;
    }
  }, 5000);
}

// Floating actions for text selection
const actions = document.getElementById('selection-actions');

document.addEventListener('mouseup', (event) => {
  if (
    event.target.closest('#selection-actions') ||
    event.target.closest('#comment-editor') ||
    event.target.closest('#translation-panel')
  )
    return;
  const info = readSelection();
  if (!info) {
    actions.style.display = 'none';
    pendingSelection = null;
    clearSelectionPaint();
    return;
  }
  pendingSelection = { page: info.page, text: info.text, rects: info.rects };
  paintSelection(info.pageEl, info.rects);
  actions.style.display = 'flex';
  const maxLeft = window.innerWidth - actions.offsetWidth - 8;
  actions.style.left = `${Math.max(8, Math.min(event.clientX + 6, maxLeft))}px`;
  actions.style.top = `${Math.max(8, event.clientY + 6)}px`;
});

let selectionPaintFrame = 0;
document.addEventListener('selectionchange', () => {
  if (selectionPaintFrame) return;
  selectionPaintFrame = requestAnimationFrame(() => {
    selectionPaintFrame = 0;
    const info = readSelection();
    if (info) paintSelection(info.pageEl, info.rects);
    else if (!pendingSelection) clearSelectionPaint();
  });
});

function addHighlight(comment) {
  if (!pendingSelection || !attachment) return;
  window.parent.postMessage(
    {
      type: 'ppd-add-highlight',
      attachment,
      page: pendingSelection.page,
      text: pendingSelection.text,
      rects: pendingSelection.rects,
      comment,
      mode: activeHighlightMode,
      color: currentColor
    },
    '*'
  );
  clearSelection();
}

async function copyPlainText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {}
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  area.style.pointerEvents = 'none';
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand('copy');
  area.remove();
  if (!copied) throw new Error('copy failed');
}

document.getElementById('copy-selection').addEventListener('click', async () => {
  if (!pendingSelection) return;
  const value = `${pendingSelection.text} (p. ${pendingSelection.page})`;
  try {
    await copyPlainText(value);
    toast(t('Trecho copiado'));
  } catch {
    toast(t('Não foi possível copiar'));
  }
  clearSelection();
});

document.getElementById('translate-selection').addEventListener('click', () => {
  if (!pendingSelection) return;
  const text = normalizeTranslationText(pendingSelection.text);
  if (!text) return;
  translationRequest++;
  const requestId = String(translationRequest);
  translationSource.textContent = text;
  translationResult.textContent = t('Traduzindo...');
  translationPanel.hidden = false;
  window.parent.postMessage(
    { type: 'ppd-translate', requestId, text, target: translationTarget.value },
    '*'
  );
});

document.getElementById('close-translation').addEventListener('click', () => {
  translationPanel.hidden = true;
});

document.getElementById('copy-translation').addEventListener('click', async () => {
  const text = translationResult.textContent.trim();
  if (!text) return;
  try {
    await copyPlainText(text);
    toast(t('Tradução copiada'));
  } catch {
    toast(t('Não foi possível copiar'));
  }
});

document.getElementById('hl-button').addEventListener('click', () => addHighlight(''));
document.getElementById('underline-button').addEventListener('click', () => {
  const previous = activeHighlightMode;
  activeHighlightMode = 'underline';
  addHighlight('');
  activeHighlightMode = previous;
});
document.getElementById('strike-button').addEventListener('click', () => {
  const previous = activeHighlightMode;
  activeHighlightMode = 'strikethrough';
  addHighlight('');
  activeHighlightMode = previous;
});
document.getElementById('comment-button').addEventListener('click', () => {
  if (!pendingSelection) return;
  actions.style.display = 'none';
  openCommentEditor(null);
});

document.getElementById('hide-annotations').addEventListener('click', () => {
  document.body.classList.add('ann-hidden');
});
document.getElementById('show-annotations').addEventListener('click', () => {
  document.body.classList.toggle('ann-hidden');
});
annSearch.addEventListener('input', renderAnnotations);

async function render() {
  if (!file) return;
  const base = new URL('../node_modules/pdfjs-dist/', location.href).href;
  const pdf = await pdfjsLib.getDocument({
    url: file,
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`
  }).promise;
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.3 });
    const wrapper = document.createElement('div');
    wrapper.className = 'page';
    wrapper.dataset.page = String(pageNum);
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    wrapper.appendChild(canvas);

    const selectionLayer = document.createElement('div');
    selectionLayer.className = 'selection-layer';
    wrapper.appendChild(selectionLayer);

    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer';
    textLayerDiv.style.setProperty('--total-scale-factor', String(viewport.scale));
    wrapper.appendChild(textLayerDiv);

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    wrapper.appendChild(overlay);
    pagesEl.appendChild(wrapper);
    pageMap.set(pageNum, overlay);

    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    try {
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: page.streamTextContent(),
        container: textLayerDiv,
        viewport
      });
      await textLayer.render();
    } catch {}
  }
  renderOverlays();
  renderAnnotations();
}

const findInput = document.getElementById('find-input');
const findCount = document.getElementById('find-count');
let findHits = [];
let findIndex = -1;
let findWaitTries = 0;

function updateFindCount() {
  findCount.textContent = findHits.length
    ? t('{n} de {m}', { n: findIndex + 1, m: findHits.length })
    : t('0 resultados');
}

function clearFind() {
  for (const mark of document.querySelectorAll('mark.find-hit')) {
    const parent = mark.parentNode;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  }
  findHits = [];
  findIndex = -1;
}

function focusHit() {
  if (!findHits.length || findIndex < 0) return;
  for (const hit of findHits) hit.classList.remove('current');
  const hit = findHits[findIndex];
  hit.classList.add('current');
  hit.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
  updateFindCount();
}

function searchInPdf() {
  clearFind();
  const query = findInput.value.trim().toLowerCase();
  if (!query) {
    findWaitTries = 0;
    updateFindCount();
    return;
  }
  const spans = [...document.querySelectorAll('.textLayer span')];
  if (!spans.length && findWaitTries < 25) {
    findWaitTries += 1;
    findCount.textContent = t('carregando texto...');
    setTimeout(() => {
      if (findInput.value.trim().toLowerCase() === query) searchInPdf();
    }, 200);
    return;
  }
  findWaitTries = 0;
  const wordChar = /[\p{L}\p{N}]/u;
  const queryStartsWithWord = wordChar.test(query[0] || '');
  for (const span of spans) {
    const text = span.textContent || '';
    const lower = text.toLowerCase();
    let index = lower.indexOf(query);
    if (index < 0) continue;
    const fragment = document.createDocumentFragment();
    let last = 0;
    while (index >= 0) {
      const atWordStart = !queryStartsWithWord || index === 0 || !wordChar.test(lower[index - 1]);
      if (atWordStart) {
        fragment.append(document.createTextNode(text.slice(last, index)));
        const mark = document.createElement('mark');
        mark.className = 'find-hit';
        mark.textContent = text.slice(index, index + query.length);
        fragment.append(mark);
        findHits.push(mark);
        last = index + query.length;
      }
      index = lower.indexOf(query, index + query.length);
    }
    fragment.append(document.createTextNode(text.slice(last)));
    span.textContent = '';
    span.appendChild(fragment);
  }
  if (findHits.length) {
    findIndex = 0;
    focusHit();
  } else {
    updateFindCount();
  }
}

function moveHit(delta) {
  if (!findHits.length) return;
  findIndex = (findIndex + delta + findHits.length) % findHits.length;
  focusHit();
}

findInput.addEventListener('input', () => {
  findWaitTries = 0;
  searchInPdf();
});
findInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  moveHit(event.shiftKey ? -1 : 1);
});
document.getElementById('find-next').addEventListener('click', () => moveHit(1));
document.getElementById('find-prev').addEventListener('click', () => moveHit(-1));

window.addEventListener('message', (event) => {
  if (event.data?.type === 'ppd-theme') {
    applyViewerTheme(event.data.theme, { persist: false });
  }
});

updateColor(currentColor);
updateToolUI();
render().catch((err) => {
  pagesEl.textContent = t('Erro ao abrir PDF: {msg}', { msg: err.message });
});
