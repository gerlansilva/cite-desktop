(() => {
  let bibliography = null;
  let selected = null;
  let style = 'ABNT';

  const $ = (id) => document.getElementById(id);

  function setStatus(message, error = false) {
    const status = $('status');
    status.textContent = message || '';
    status.style.color = error ? '#b42318' : '';
  }

  function itemText(item) {
    return (
      item.citations?.[style] ||
      item.citations?.ABNT ||
      [item.authors?.join('; '), item.title, item.year].filter(Boolean).join('. ')
    );
  }

  function renderStyles() {
    const select = $('style');
    const styles = bibliography?.styles?.length
      ? bibliography.styles
      : ['ABNT', 'APA', 'MLA', 'Harvard', 'Vancouver', 'Chicago'];
    select.innerHTML = '';
    for (const value of styles) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    }
    select.value = styles.includes(style) ? style : styles[0];
    style = select.value;
  }

  function renderList() {
    const list = $('list');
    list.innerHTML = '';
    const query = $('search').value.trim().toLowerCase();
    const items = (bibliography?.items || []).filter((item) => {
      if (!query) return true;
      return [item.title, item.authors?.join(' '), item.year, item.journal, item.doi, itemText(item)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = bibliography ? 'Nenhuma referência encontrada.' : 'Carregue uma bibliografia para começar.';
      list.appendChild(empty);
      selected = null;
      renderPreview();
      return;
    }
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'item' + (selected?.id === item.id ? ' selected' : '');
      const title = document.createElement('strong');
      title.textContent = item.title || '(sem título)';
      const meta = document.createElement('span');
      meta.textContent = [item.authors?.join(', '), item.year, item.journal].filter(Boolean).join(' · ');
      row.append(title, meta);
      row.onclick = () => {
        selected = item;
        renderList();
        renderPreview();
      };
      list.appendChild(row);
    }
  }

  function renderPreview() {
    $('preview').textContent = selected ? itemText(selected) : 'Nenhuma referência selecionada.';
    $('insert-citation').disabled = !selected;
    $('insert-bibliography').disabled = !bibliography?.items?.length;
  }

  async function loadBibliography() {
    const url = $('bibliography-url').value.trim();
    if (!url) {
      setStatus('Informe a URL do bibliography.json.', true);
      return;
    }
    localStorage.setItem('cite-bibliography-url', url);
    setStatus('carregando…');
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.items)) throw new Error('formato inválido');
      bibliography = data;
      selected = null;
      renderStyles();
      renderList();
      renderPreview();
      setStatus(`${data.items.length} referência(s) carregada(s).`);
    } catch (err) {
      bibliography = null;
      renderList();
      setStatus(`não foi possível carregar: ${err.message}`, true);
    }
  }

  async function insertText(text) {
    await Word.run(async (context) => {
      const range = context.document.getSelection();
      range.insertText(text, Word.InsertLocation.replace);
      await context.sync();
    });
  }

  async function insertCitation() {
    if (!selected) return;
    try {
      await insertText(itemText(selected));
      setStatus('citação inserida.');
    } catch (err) {
      setStatus(`não foi possível inserir: ${err.message}`, true);
    }
  }

  async function insertBibliography() {
    if (!bibliography?.items?.length) return;
    try {
      const text = bibliography.items.map((item) => itemText(item)).join('\n\n');
      await insertText(text);
      setStatus('bibliografia inserida.');
    } catch (err) {
      setStatus(`não foi possível inserir: ${err.message}`, true);
    }
  }

  function init() {
    const savedUrl = localStorage.getItem('cite-bibliography-url') || '';
    $('bibliography-url').value = savedUrl;
    style = localStorage.getItem('cite-citation-style') || 'ABNT';
    renderStyles();
    $('load').onclick = loadBibliography;
    $('search').oninput = renderList;
    $('style').onchange = () => {
      style = $('style').value;
      localStorage.setItem('cite-citation-style', style);
      renderList();
      renderPreview();
    };
    $('insert-citation').onclick = insertCitation;
    $('insert-bibliography').onclick = insertBibliography;
    if (savedUrl) loadBibliography();
  }

  if (typeof Office !== 'undefined') Office.onReady(init);
  else window.addEventListener('DOMContentLoaded', init);
})();
