(() => {
  const LOCAL_PORTS = Array.from({ length: 10 }, (_, index) => 23120 + index);
  const DEMO_URL = 'demo-bibliography.json';
  const REFRESH_MS = 20000;
  const F = window.CiteFields;

  let bibliography = null;
  let selected = null;
  let style = 'ABNT';
  let autoRefresh = true;
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
    return F.referenceText(item, style);
  }

  function inTextCitation(item) {
    return F.inTextCitation(item, style);
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

  async function updateFieldCount() {
    try {
      const counts = await F.countFields();
      const parts = [];
      if (counts.citations) parts.push(`${counts.citations} ${counts.citations === 1 ? 'citação' : 'citações'}`);
      if (counts.bibliographies) parts.push(`${counts.bibliographies} ${counts.bibliographies === 1 ? 'bibliografia' : 'bibliografias'}`);
      $('field-count').textContent = parts.join(' · ');
    } catch {
      $('field-count').textContent = '';
    }
  }

  async function refreshFields({ silent = false } = {}) {
    if (!bibliography?.items?.length) {
      if (!silent) setStatus('Conecte o Cite ou carregue a bibliografia para atualizar.', true);
      return;
    }
    try {
      const result = await F.refreshDocument(bibliography.items, style);
      if (!silent) {
        const citations = `${result.citations} ${result.citations === 1 ? 'citação atualizada' : 'citações atualizadas'}`;
        const bibs = result.bibliographies
          ? ` e ${result.bibliographies} ${result.bibliographies === 1 ? 'bibliografia' : 'bibliografias'}`
          : '';
        setStatus(`${citations}${bibs}.`);
      }
      await updateFieldCount();
    } catch (err) {
      if (!silent) setStatus(`Não foi possível atualizar: ${err.message}`, true);
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
      const updated = await F.updateSelectedCitation(selected, style);
      if (updated) {
        setStatus('Citação atualizada para a referência selecionada.');
      } else {
        await F.insertCitation(selected, style);
        setStatus('Citação inserida e vinculada ao Cite.');
      }
      if (autoRefresh) await refreshFields({ silent: true });
      await updateFieldCount();
    } catch (err) {
      try {
        await insertText(inTextCitation(selected));
        setStatus(`Citação inserida como texto; não foi possível vinculá-la: ${err.message}`, true);
      } catch (fallbackError) {
        setStatus(`Não foi possível inserir: ${fallbackError.message}`, true);
      }
    }
  }

  async function insertReference() {
    if (!selected) return;
    try {
      await insertText(referenceText(selected));
      setStatus('Referência inserida como texto.');
    } catch (err) {
      setStatus(`Não foi possível inserir: ${err.message}`, true);
    }
  }

  async function insertBibliography() {
    if (!bibliography?.items?.length) return;
    try {
      await F.insertBibliography(bibliography.items, style);
      setStatus('Bibliografia criada ou atualizada no documento.');
      if (autoRefresh) await refreshFields({ silent: true });
      await updateFieldCount();
    } catch (err) {
      try {
        const text = bibliography.items.map((item) => referenceText(item)).join('\n\n');
        await Word.run(async (context) => {
          context.document.body.insertText(`\n\n${text}`, Word.InsertLocation.end);
          await context.sync();
        });
        setStatus(`Bibliografia inserida como texto; não foi possível vinculá-la: ${err.message}`, true);
      } catch (fallbackError) {
        setStatus(`Não foi possível inserir: ${fallbackError.message}`, true);
      }
    }
  }

  async function unlinkFields() {
    const ok = window.confirm('Desvincular todas as citações e a bibliografia? Elas passam a ser texto comum e não poderão ser atualizadas.');
    if (!ok) return;
    try {
      const count = await F.unlinkDocument();
      setStatus(`${count} ${count === 1 ? 'vínculo removido' : 'vínculos removidos'}.`);
      await updateFieldCount();
    } catch (err) {
      setStatus(`Não foi possível desvincular: ${err.message}`, true);
    }
  }

  async function preselectCitation() {
    if (!F.available()) return;
    try {
      const ids = await F.selectedCitationIds();
      if (!ids?.length) return;
      const item = (bibliography?.items || []).find((entry) => String(entry.id) === ids[0]);
      if (!item) return;
      selected = item;
      renderList();
      renderPreview();
      setStatus('Editando a citação selecionada. Escolha outra referência para substituir.');
    } catch {}
  }

  function applyMode() {
    const mode = new URLSearchParams(window.location.search).get('mode');
    if (mode === 'settings') {
      $('document-card').scrollIntoView({ block: 'nearest' });
      setStatus('Escolha o estilo e o comportamento de atualização.');
    } else if (mode === 'bibliography') {
      $('bibliography-card').scrollIntoView({ block: 'nearest' });
      setStatus('Use Inserir bibliografia para criar ou atualizar a lista.');
    } else if (mode === 'citation') {
      $('search').focus();
      preselectCitation();
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
      if (autoRefresh) refreshFields({ silent: true });
    });
    $('auto-refresh').addEventListener('change', () => {
      autoRefresh = $('auto-refresh').checked;
      try {
        localStorage.setItem('cite-auto-refresh', autoRefresh ? '1' : '0');
      } catch {}
    });
    $('insert-citation').addEventListener('click', insertCitation);
    $('insert-reference').addEventListener('click', insertReference);
    $('insert-bibliography').addEventListener('click', insertBibliography);
    $('refresh-doc').addEventListener('click', () => refreshFields());
    $('unlink-doc').addEventListener('click', unlinkFields);
    window.addEventListener('focus', () => {
      if (connected && !refreshing) refreshLocal();
      updateFieldCount();
    });
    setInterval(() => {
      if (connected && !refreshing && !document.hidden) refreshLocal();
    }, REFRESH_MS);
  }

  async function init() {
    if (initialized) return;
    initialized = true;
    bindEvents();

    if (!F) {
      setStatus('Não foi possível carregar os campos do Cite. Reinstale o add-in.', true);
      return;
    }

    try {
      $('bibliography-url').value = localStorage.getItem('cite-bibliography-url') || '';
      style = localStorage.getItem('cite-citation-style') || 'ABNT';
      autoRefresh = localStorage.getItem('cite-auto-refresh') !== '0';
    } catch {}
    $('auto-refresh').checked = autoRefresh;
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
      await loadBibliography($('bibliography-url').value);
    }
    updateFieldCount();
    applyMode();  }

  if (typeof Office !== 'undefined' && typeof Office.onReady === 'function') {
    Office.onReady(() => init());
  } else {
    window.addEventListener('DOMContentLoaded', init);
  }
})();
