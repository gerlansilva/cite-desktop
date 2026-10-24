(() => {
  const LOCAL_PORTS = Array.from({ length: 10 }, (_, index) => 23120 + index);
  const DEMO_URL = 'demo-bibliography.json';
  const REFRESH_MS = 20000;

  let bibliography = null;
  let selected = null;
  let style = 'ABNT';
  let initialized = false;
  let connected = false;
  let localPort = null;
  let localPath = '';
  let refreshing = false;

  const $ = (id) => document.getElementById(id);

  function setStatus(message, error = false) {
    const status = $('status');
    status.textContent = message || '';
    status.classList.toggle('error', Boolean(error));
  }

  function setLocalState(message, kind = '') {
    const state = $('local-state');
    state.textContent = message;
    state.classList.toggle('on', kind === 'on');
    state.classList.toggle('off', kind === 'off');
  }

  function setBusy(busy) {
    $('connect').disabled = busy;
    $('load').disabled = busy;
    $('load-demo').disabled = busy;
    if (busy) $('refresh').disabled = true;
    else $('refresh').disabled = !connected;
  }

  function setConnected(value) {
    connected = value;
    if (!value) {
      localPort = null;
      localPath = '';
    }
    $('connect').textContent = value ? 'Reconectar' : 'Conectar';
    $('refresh').disabled = !value;
    if (value) {
      setLocalState('Conectado', 'on');
      const suffix = localPort ? ` · porta ${localPort}` : '';
      $('local-note').textContent = `${localPath || 'Biblioteca do Cite'}${suffix}`;
    } else {
      setLocalState('Desconectado', 'off');
      $('local-note').textContent = 'Abra o aplicativo Cite neste computador e clique em Conectar.';
    }
  }

  function referenceText(item) {
    return item?.citations?.[style] || item?.citations?.ABNT || [
      item?.authors?.join('; '),
      item?.title,
      item?.year
    ].filter(Boolean).join('. ');
  }

  function surname(author) {
    const raw = String(author || '').trim().replace(/\s+/g, ' ');
    if (!raw) return '';
    if (raw.includes(',')) return raw.slice(0, raw.indexOf(',')).trim();
    if (raw.includes('.')) return raw.slice(0, raw.indexOf('.')).trim();
    const parts = raw.split(' ');
    return parts[parts.length - 1];
  }

  function inTextCitation(item) {
    const names = (item?.authors || []).map(surname).filter(Boolean);
    const year = item?.year || 's.d.';
    if (!names.length) return `(${String(item?.title || 'sem título').slice(0, 35)}, ${year})`;
    if (style === 'ABNT') {
      const upper = names.map((name) => name.toUpperCase());
      if (upper.length > 3) return `(${upper[0]} et al., ${year})`;
      return `(${upper.join('; ')}, ${year})`;
    }
    if (style === 'APA' || style === 'Vancouver') {
      if (names.length > 2) return `(${names[0]} et al., ${year})`;
      if (names.length === 2) return `(${names[0]} & ${names[1]}, ${year})`;
      return `(${names[0]}, ${year})`;
    }
    if (style === 'MLA' || style === 'Chicago') {
      if (names.length > 2) return `(${names[0]} et al. ${year})`;
      if (names.length === 2) return `(${names[0]} and ${names[1]} ${year})`;
      return `(${names[0]} ${year})`;
    }
    return `(${names.join(', ')}, ${year})`;
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

  function filteredItems() {
    const query = $('search').value.trim().toLowerCase();
    const items = bibliography?.items || [];
    if (!query) return items;
    return items.filter((item) => [item.title, item.authors?.join(' '), item.year, item.journal, item.doi, referenceText(item)]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(query));
  }

  function renderList() {
    const list = $('list');
    const items = filteredItems();
    list.innerHTML = '';
    $('count').textContent = `${items.length} ${items.length === 1 ? 'item' : 'itens'}`;

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = bibliography ? 'Nenhuma referência encontrada.' : 'Conecte o Cite ou carregue uma bibliografia para começar.';
      list.appendChild(empty);
      selected = null;
      renderPreview();
      return;
    }

    for (const item of items) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'item' + (selected?.id === item.id ? ' selected' : '');
      row.setAttribute('aria-pressed', String(selected?.id === item.id));
      const title = document.createElement('strong');
      title.textContent = item.title || '(sem título)';
      const meta = document.createElement('span');
      meta.textContent = [item.authors?.join(', '), item.year, item.journal].filter(Boolean).join(' · ');
      row.append(title, meta);
      row.addEventListener('click', () => {
        selected = item;
        renderList();
        renderPreview();
      });
      list.appendChild(row);
    }
  }

  function renderPreview() {
    $('preview-citation').textContent = selected ? inTextCitation(selected) : 'Nenhuma referência selecionada.';
    $('preview-reference').textContent = selected ? referenceText(selected) : 'Selecione uma referência na lista.';
    $('insert-citation').disabled = !selected;
    $('insert-reference').disabled = !selected;
    $('insert-bibliography').disabled = !bibliography?.items?.length;
  }

  function applyBibliography(data, keepSelection = false) {
    const previousId = keepSelection ? selected?.id : null;
    bibliography = data;
    selected = previousId
      ? (data.items || []).find((item) => item.id === previousId) || null
      : null;
    renderStyles();
    renderList();
    renderPreview();
  }

  async function fetchJson(url, timeoutMs = 2500) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        signal: controller?.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function findLocalApp() {
    try {
      const ping = await fetchJson('/ping', 1500);
      if (ping?.app === 'Cite') return { base: '', port: window.location.port || null, ping };
    } catch {}

    for (const port of LOCAL_PORTS) {
      try {
        const ping = await fetchJson(`https://localhost:${port}/ping`, 1200);
        if (ping?.app === 'Cite') return { base: `https://localhost:${port}`, port, ping };
      } catch {}
    }
    return null;
  }

  async function connectLocal({ silent = false } = {}) {
    if (!silent) {
      setBusy(true);
      setLocalState('Conectando…');
      setStatus('Procurando o aplicativo Cite…');
    }
    try {
      const found = await findLocalApp();
      if (!found) throw new Error('aplicativo não encontrado');
      const data = await fetchJson(`${found.base}/library`, 15000);
      if (!Array.isArray(data?.items)) throw new Error('biblioteca indisponível');
      localPort = found.port;
      localPath = found.ping?.libraryPath || '';
      applyBibliography(data, true);
      setConnected(true);
      if (!silent) {
        const total = data.items.length;
        setStatus(`${total} ${total === 1 ? 'referência' : 'referências'} da biblioteca local.`);
      }
      return true;
    } catch (err) {
      const wasConnected = connected;
      setConnected(false);
      if (!silent || wasConnected) {
        setStatus(`Não foi possível conectar: ${err.message}. Abra o aplicativo ou use a bibliografia publicada.`, true);
      }
      return false;
    } finally {
      if (!silent) setBusy(false);
    }
  }

  async function refreshLocal() {
    if (refreshing) return;
    if (!connected) {
      await connectLocal();
      return;
    }
    refreshing = true;
    try {
      const base = window.location.port === String(localPort) ? '' : `https://localhost:${localPort}`;
      const data = await fetchJson(`${base}/library`, 15000);
      if (!Array.isArray(data?.items)) throw new Error('biblioteca indisponível');
      applyBibliography(data, true);
      setStatus(`${data.items.length} ${data.items.length === 1 ? 'referência atualizada' : 'referências atualizadas'}.`);
    } catch {
      const recovered = await connectLocal({ silent: true });
      if (!recovered) {
        setStatus('O aplicativo Cite não respondeu. Abra-o e clique em Conectar.', true);
      }
    } finally {
      refreshing = false;
    }
  }

  async function loadBibliography(url = $('bibliography-url').value.trim()) {
    if (!url) {
      setStatus('Informe a URL do bibliography.json.', true);
      return false;
    }
    $('bibliography-url').value = url;
    setBusy(true);
    setStatus('Carregando…');
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data?.items)) throw new Error('formato inválido');
      setConnected(false);
      applyBibliography(data);
      try {
        localStorage.setItem('cite-bibliography-url', url);
      } catch {}
      setStatus(`${data.items.length} ${data.items.length === 1 ? 'referência carregada' : 'referências carregadas'}.`);
      return true;
    } catch (err) {
      bibliography = null;
      selected = null;
      renderList();
      renderPreview();
      setStatus(`Não foi possível carregar: ${err.message}`, true);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function insertText(text) {
    if (typeof Word === 'undefined' || !Word.run) {
      throw new Error('Abra este painel dentro do Word para inserir conteúdo.');
    }
    await Word.run(async (context) => {
      const range = context.document.getSelection();
      range.insertText(text, Word.InsertLocation.replace);
      await context.sync();
    });
  }

  async function insertCitation() {
    if (!selected) return;
    try {
      await insertText(inTextCitation(selected));
      setStatus('Citação inserida.');
    } catch (err) {
      setStatus(`Não foi possível inserir: ${err.message}`, true);
    }
  }

  async function insertReference() {
    if (!selected) return;
    try {
      await insertText(referenceText(selected));
      setStatus('Referência inserida.');
    } catch (err) {
      setStatus(`Não foi possível inserir: ${err.message}`, true);
    }
  }

  async function insertBibliography() {
    if (!bibliography?.items?.length) return;
    try {
      const list = [...bibliography.items].sort((a, b) =>
        String(surname(a.authors?.[0]) || a.title || '').localeCompare(String(surname(b.authors?.[0]) || b.title || ''), 'pt-BR')
      );
      if (typeof Word === 'undefined' || !Word.run) {
        throw new Error('Abra este painel dentro do Word para inserir conteúdo.');
      }
      await Word.run(async (context) => {
        const body = context.document.body;
        body.insertText(`\n\n${list.map(referenceText).join('\n\n')}`, Word.InsertLocation.end);
        await context.sync();
      });
      setStatus('Bibliografia inserida ao final do documento.');
    } catch (err) {
      setStatus(`Não foi possível inserir: ${err.message}`, true);
    }
  }

  function bindEvents() {
    $('connect').addEventListener('click', () => connectLocal());
    $('refresh').addEventListener('click', refreshLocal);
    $('load').addEventListener('click', () => loadBibliography());
    $('load-demo').addEventListener('click', () => loadBibliography(DEMO_URL));
    $('bibliography-url').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') loadBibliography();
    });
    $('search').addEventListener('input', renderList);
    $('style').addEventListener('change', () => {
      style = $('style').value;
      try {
        localStorage.setItem('cite-citation-style', style);
      } catch {}
      renderList();
      renderPreview();
    });
    $('insert-citation').addEventListener('click', insertCitation);
    $('insert-reference').addEventListener('click', insertReference);
    $('insert-bibliography').addEventListener('click', insertBibliography);
    window.addEventListener('focus', () => {
      if (connected && !refreshing) refreshLocal();
    });
    setInterval(() => {
      if (connected && !refreshing && !document.hidden) refreshLocal();
    }, REFRESH_MS);
  }

  async function init() {
    if (initialized) return;
    initialized = true;
    bindEvents();
    try {
      $('bibliography-url').value = localStorage.getItem('cite-bibliography-url') || '';
      style = localStorage.getItem('cite-citation-style') || 'ABNT';
    } catch {}
    renderStyles();
    renderList();
    renderPreview();

    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '1') {
      loadBibliography(DEMO_URL);
      return;
    }

    setLocalState('Verificando…');
    const ok = await connectLocal();
    if (!ok && $('bibliography-url').value) {
      loadBibliography($('bibliography-url').value);
    }
  }

  if (typeof Office !== 'undefined' && typeof Office.onReady === 'function') {
    Office.onReady(() => init());
  } else {
    window.addEventListener('DOMContentLoaded', init);
  }
})();
