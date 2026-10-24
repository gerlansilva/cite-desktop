(function () {
  const i18n = window.CiteI18n;
  const t = (text, vars) => (i18n ? i18n.t(text, vars) : text);
  const api = window.cite;

  const root = document.documentElement;
  const themeBtn = document.getElementById('theme');
  const pathEl = document.getElementById('library-path');
  const statsEl = document.getElementById('library-stats');
  const chipsEl = document.getElementById('library-chips');
  const recentList = document.getElementById('recent-list');
  const recentEmpty = document.getElementById('recent-empty');
  const footerNote = document.getElementById('footer-note');
  const versionEl = document.getElementById('version');
  const langButtons = [...document.querySelectorAll('.lang-btn')];


  try {
    root.dataset.theme = localStorage.getItem('cite-theme') === 'dark' ? 'dark' : 'light';
  } catch {}

  themeBtn.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem('cite-theme', next);
    } catch {}
    themeBtn.setAttribute('aria-label', t('Alternar tema'));
  });

  if (i18n) {
    const current = i18n.getLanguage();
    for (const button of langButtons) {
      const active = button.dataset.lang === current;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
      button.addEventListener('click', async () => {
        if (button.dataset.lang === i18n.getLanguage()) return;
        const language = button.dataset.lang;
        i18n.setLanguage(language);
        try {
          localStorage.setItem('cite-language', language);
        } catch {}
        try {
          await api.settings.setLanguage(language);
        } catch {}
        const url = new URL(window.location.href);
        url.searchParams.set('lang', language);
        window.location.replace(url.toString());
      });
    }
  }

  function setFooterNote(text) {
    footerNote.textContent = text;
  }

  function open(action, id) {
    api.home.open(action || 'library', id || null).catch((err) => {
      setFooterNote(t('Não foi possível abrir a biblioteca: {error}', { error: err.message }));
    });
  }

  document.getElementById('open-library').addEventListener('click', () => open('library'));
  document.getElementById('new-reference').addEventListener('click', () => open('new'));
  document.getElementById('search-articles').addEventListener('click', () => open('search'));
  document.getElementById('import-pdf').addEventListener('click', () => open('import'));
  document.getElementById('open-recent').addEventListener('click', () => open('library'));
  document.getElementById('word-help').addEventListener('click', () => api.home.wordHelp());

  document.getElementById('change-folder').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = t('Alterando…');
    try {
      const result = await api.home.changeFolder();
      if (result?.canceled) {
        button.disabled = false;
        button.textContent = original;
        return;
      }
      if (result?.same) {
        button.disabled = false;
        button.textContent = original;
        setFooterNote(t('Esta já é a pasta da biblioteca.'));
        return;
      }
      if (!result?.ok) {
        button.disabled = false;
        button.textContent = original;
        setFooterNote(t('Não foi possível usar esta pasta: {error}', { error: result?.error || '?' }));
      }
    } catch (err) {
      button.disabled = false;
      button.textContent = original;
      setFooterNote(t('Não foi possível usar esta pasta: {error}', { error: err.message }));
    }
  });

  function plural(count, singular, pluralForm) {
    return `${count} ${t(count === 1 ? singular : pluralForm)}`;
  }

  function authorLine(pub) {
    const authors = Array.isArray(pub.authors) ? pub.authors.filter(Boolean) : [];
    if (!authors.length) return '';
    const shown = authors.slice(0, 3).join(', ');
    return authors.length > 3 ? `${shown}…` : shown;
  }

  function renderRecents(items) {
    const ordered = items.slice(-6).reverse();
    recentList.textContent = '';
    recentEmpty.hidden = ordered.length > 0;

    for (const pub of ordered) {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'recent-item';
      button.addEventListener('click', () => open('focus', pub._id));

      const dot = document.createElement('span');
      dot.className = 'type-dot';

      const copy = document.createElement('span');
      copy.className = 'recent-copy';

      const title = document.createElement('span');
      title.className = 'recent-title';
      title.textContent = pub.title || t('Sem título');

      const meta = document.createElement('span');
      meta.className = 'recent-meta';
      meta.textContent = [authorLine(pub), pub.year, pub.journal].filter(Boolean).join(' · ');

      copy.append(title, meta);
      button.append(dot, copy);
      li.appendChild(button);
      recentList.appendChild(li);
    }
  }

  async function load() {
    const [state, items, attachments, collections] = await Promise.all([
      api.home.state(),
      api.data.call('library:all'),
      api.data.call('attachments:all'),
      api.data.call('collections:all')
    ]);

    const version = state?.version || api.version || '';
    versionEl.textContent = version ? `Cite ${version}` : 'Cite';
    pathEl.textContent = state?.libraryPath || '';
    pathEl.title = state?.libraryPath || '';

    const total = items.length;
    const pubsWithPdf = new Set(attachments.map((att) => att.pub_id).filter(Boolean));
    statsEl.textContent = plural(total, 'referência', 'referências');

    chipsEl.textContent = '';
    for (const label of [
      plural(pubsWithPdf.size, 'PDF', 'PDFs'),
      plural(collections.length, 'coleção', 'coleções')
    ]) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = label;
      chipsEl.appendChild(chip);
    }

    renderRecents(items);
  }

  load().catch((err) => {
    statsEl.textContent = t('Não foi possível ler a biblioteca.');
    setFooterNote(err.message);
  });
})();
