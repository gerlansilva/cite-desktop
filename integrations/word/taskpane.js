(() => {
  const LOCAL_PORTS = Array.from({ length: 10 }, (_, index) => 23120 + index);
  const DEMO_URL = 'demo-bibliography.json';
  const REFRESH_MS = 15000;
  const F = window.CiteFields;

  let bibliography = null;
  let selection = [];
  let style = 'ABNT';
  let autoRefresh = true;
  let initialized = false;
  let connected = false;
  let localPort = null;
  let localPath = '';
  let refreshing = false;
  let focusTimer = null;
  let syncTimer = null;

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

  function selectedItems() {
    return selection
      .map((id) => (bibliography?.items || []).find((item) => String(item.id) === id))
      .filter(Boolean);
  }

  function isSelected(id) {
    return selection.includes(String(id));
  }

  function toggleSelection(item) {
    const id = String(item.id);
    const index = selection.indexOf(id);
    if (index >= 0) selection.splice(index, 1);
    else selection.push(id);
    renderList();
    renderPreview();
  }

  function clearSelection() {
    selection = [];
    renderList();
    renderPreview();
  }

  function citationOptions() {
    return {
      prefix: $('citation-prefix').value.trim(),
      locator: $('citation-locator').value.trim(),
      suffix: $('citation-suffix').value.trim(),
      yearSuffix: $('citation-year-suffix').value.trim(),
      apud: $('citation-apud').value.trim(),
      narrative: $('citation-narrative').checked,
      suppressAuthor: $('citation-suppress-author').checked,
      suppressYear: $('citation-suppress-year').checked
    };
  }

  function syncNarrativeState() {
    const apud = $('citation-apud').value.trim();
    $('citation-narrative').disabled = Boolean(apud);
    if (apud) $('citation-narrative').checked = false;
  }

  function setCitationOptions(options = {}) {
    $('citation-prefix').value = options.prefix || '';
    $('citation-locator').value = options.locator || '';
    $('citation-suffix').value = options.suffix || '';
    $('citation-year-suffix').value = options.yearSuffix || '';
    $('citation-apud').value = options.apud || '';
    $('citation-suppress-author').checked = Boolean(options.suppressAuthor);
    $('citation-suppress-year').checked = Boolean(options.suppressYear);
    syncNarrativeState();
    $('citation-narrative').checked = Boolean(options.narrative) && !$('citation-narrative').disabled;
  }

  function clearCitationOptions() {
    setCitationOptions({});
    renderPreview();
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

  function renderSelectionBar() {
    const count = selectedItems().length;
    $('selection-bar').hidden = count === 0;
    $('selection-count').textContent = `${count} ${count === 1 ? 'selecionada' : 'selecionadas'}`;
  }

  function renderList() {
    const list = $('list');
    const items = filteredItems();
    list.innerHTML = '';
    $('count').textContent = `${items.length} ${items.length === 1 ? 'item' : 'itens'}`;
    renderSelectionBar();

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = bibliography ? 'Nenhuma referência encontrada.' : 'Conecte o Cite ou carregue uma bibliografia para começar.';
      list.appendChild(empty);
      return;
    }

    for (const item of items) {
      const active = isSelected(item.id);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'item' + (active ? ' selected' : '');
      row.setAttribute('aria-pressed', String(active));

      const check = document.createElement('span');
      check.className = 'check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '✓';

      const body = document.createElement('span');
      body.className = 'item-body';
      const title = document.createElement('strong');
      title.textContent = item.title || '(sem título)';
      const meta = document.createElement('span');
      meta.textContent = [item.authors?.join(', '), item.year, item.journal].filter(Boolean).join(' · ');
      body.append(title, meta);
      row.append(check, body);

      row.addEventListener('click', () => toggleSelection(item));
      list.appendChild(row);
    }
  }

  function renderPreview() {
    const items = selectedItems();
    const options = citationOptions();
    $('preview-citation').textContent = items.length
      ? F.citationText(items, style, options)
      : 'Nenhuma referência selecionada.';
    $('preview-reference').textContent = items.length
      ? items.map((item) => referenceText(item)).join('\n\n')
      : 'Selecione uma ou mais referências na lista.';
    $('insert-citation').disabled = !items.length;
    $('insert-reference').disabled = !items.length;
    $('insert-bibliography').disabled = !bibliography?.items?.length;
    renderSelectionBar();
  }

  function applyBibliography(data, keepSelection = false) {
    const previous = keepSelection ? selection : [];
    bibliography = data;
    const available = new Set((data.items || []).map((item) => String(item.id)));
    selection = previous.filter((id) => available.has(id));
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
      selection = [];
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
      await F.watchCitations(scheduleSync);
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
    const items = selectedItems();
    if (!items.length) return;
    const options = citationOptions();
    try {
      const updated = await F.updateSelectedCitation(items, style, options);
      if (updated) {
        setStatus('Citação atualizada com as referências e opções escolhidas.');
      } else {
        await F.insertCitation(items, style, options);
        setStatus(items.length === 1 ? 'Citação inserida e vinculada ao Cite.' : 'Citações inseridas na mesma referência.');
      }
      if (autoRefresh) await refreshFields({ silent: true });
      await updateFieldCount();
      await F.watchCitations(scheduleSync);
      clearCitationOptions();
    } catch (err) {
      try {
        await insertText(F.citationText(items, style, options));
        setStatus(`Citação inserida como texto; não foi possível vinculá-la: ${err.message}`, true);
      } catch (fallbackError) {
        setStatus(`Não foi possível inserir: ${fallbackError.message}`, true);
      }
    }
  }

  async function syncFields() {
    if (!bibliography?.items?.length) return;
    try {
      await F.syncBibliography(bibliography.items, style);
      await updateFieldCount();
    } catch {}
  }

  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      await syncFields();
      await F.watchCitations(scheduleSync);
    }, 800);
  }

  async function insertReference() {
    const items = selectedItems();
    if (!items.length) return;
    try {
      await insertText(items.map((item) => referenceText(item)).join('\n\n'));
      setStatus(items.length === 1 ? 'Referência inserida como texto.' : 'Referências inseridas como texto.');
    } catch (err) {
      setStatus(`Não foi possível inserir: ${err.message}`, true);
    }
  }

  async function insertBibliography() {
    if (!bibliography?.items?.length) return;
    try {
      const text = await F.insertBibliography(bibliography.items, style);
      if (!text) {
        setStatus('Nenhuma citação no documento. Insira uma citação antes da bibliografia.');
        await updateFieldCount();
        return;
      }
      setStatus('Bibliografia criada ou atualizada com as referências citadas.');
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
      const citation = await F.selectedCitation();
      if (!citation) return;
      const ids = new Set((bibliography?.items || []).map((item) => String(item.id)));
      selection = citation.ids.filter((id) => ids.has(String(id)));
      setCitationOptions(citation.options);
      renderList();
      renderPreview();
      setStatus('Editando a citação selecionada. Ajuste as referências e as opções e clique em Inserir citação.');
    } catch {}
  }

  function applyMode() {
    const mode = new URLSearchParams(window.location.search).get('mode');
    if (mode === 'settings') {
      $('citation-options-card').open = true;
      $('citation-options-card').scrollIntoView({ block: 'nearest' });
      setStatus('Escolha o estilo e as opções da próxima citação.');
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
    $('clear-selection').addEventListener('click', clearSelection);
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
    for (const id of ['citation-prefix', 'citation-locator', 'citation-suffix', 'citation-year-suffix', 'citation-apud']) {
      $(id).addEventListener('input', () => {
        syncNarrativeState();
        renderPreview();
      });
    }
    for (const id of ['citation-narrative', 'citation-suppress-author', 'citation-suppress-year']) {
      $(id).addEventListener('change', renderPreview);
    }
    for (const chip of document.querySelectorAll('.chip')) {
      chip.addEventListener('click', () => {
        const target = chip.dataset.suffix ? $('citation-suffix') : $('citation-prefix');
        const value = chip.dataset.suffix || chip.dataset.prefix || '';
        target.value = target.value === value ? '' : value;
        syncNarrativeState();
        renderPreview();
      });
    }
    $('insert-citation').addEventListener('click', insertCitation);
    $('insert-reference').addEventListener('click', insertReference);
    $('insert-bibliography').addEventListener('click', insertBibliography);
    $('refresh-doc').addEventListener('click', () => refreshFields());
    $('unlink-doc').addEventListener('click', unlinkFields);
    $('load-citation').addEventListener('click', preselectCitation);
    window.addEventListener('focus', () => {
      if (connected && !refreshing) refreshLocal();
      updateFieldCount();
      if (autoRefresh) {
        clearTimeout(focusTimer);
        focusTimer = setTimeout(() => {
          syncFields();
          preselectCitation();
        }, 350);
      }
    });
    setInterval(() => {
      if (connected && !refreshing && !document.hidden) refreshLocal();
      if (autoRefresh && !document.hidden) syncFields();
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
    await F.watchCitations(scheduleSync);
    applyMode();
  }

  if (typeof Office !== 'undefined' && typeof Office.onReady === 'function') {
    Office.onReady(() => init());
  } else {
    window.addEventListener('DOMContentLoaded', init);
  }
})();
