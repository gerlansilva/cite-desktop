(function () {
  const i18n = window.CiteI18n;
  const params = new URLSearchParams(window.location.search);
  const language = params.get('lang') === 'tet' ? 'tet' : 'pt';
  if (i18n) i18n.setLanguage(language);

  try {
    document.documentElement.dataset.theme =
      localStorage.getItem('cite-theme') === 'dark' ? 'dark' : 'light';
  } catch {}

  const t = (text, vars) => (i18n ? i18n.t(text, vars) : text);

  const titleEl = document.getElementById('title');
  const messageEl = document.getElementById('message');
  const pathLabelEl = document.getElementById('path-label');
  const pathEl = document.getElementById('path');
  const statusEl = document.getElementById('status');
  const defaultBtn = document.getElementById('default');
  const chooseBtn = document.getElementById('choose');
  const quitBtn = document.getElementById('quit');

  let state = { issue: null, defaultPath: '' };

  const COPY = {
    missing: {
      title: 'A biblioteca não está mais acessível',
      message:
        'A pasta desta biblioteca foi movida ou excluída. Escolha uma pasta para salvar os dados ou comece uma biblioteca nova.',
      pathLabel: 'Pasta configurada'
    },
    unwritable: {
      title: 'Sem permissão para usar a biblioteca',
      message:
        'O Cite não consegue gravar nesta pasta. Escolha outra pasta ou ajuste as permissões do sistema.',
      pathLabel: 'Pasta configurada'
    },
    'first-run': {
      title: 'Não foi possível criar a biblioteca padrão',
      message:
        'Escolha uma pasta onde o Cite possa salvar os PDFs e os dados da sua biblioteca.',
      pathLabel: 'Biblioteca padrão'
    }
  };

  function status(text, isError) {
    statusEl.textContent = text || '';
    statusEl.classList.toggle('error', Boolean(isError));
  }

  function setBusy(busy) {
    defaultBtn.disabled = busy;
    chooseBtn.disabled = busy;
  }

  function render() {
    const issue = state.issue || {};
    const copy = COPY[issue.type] || COPY.missing;
    titleEl.textContent = t(copy.title);
    messageEl.textContent = t(copy.message);
    pathLabelEl.textContent = t(copy.pathLabel);
    pathEl.textContent = issue.path || state.defaultPath || '—';
    defaultBtn.textContent = t('Usar a biblioteca padrão');
    chooseBtn.textContent = t('Escolher outra pasta');
    quitBtn.textContent = t('Sair do Cite');
    statusEl.textContent = '';
    statusEl.classList.remove('error');
  }

  function finish(result) {
    if (!result) {
      setBusy(false);
      status(t('Não foi possível usar esta pasta.'), true);
      return;
    }
    if (result.canceled) {
      setBusy(false);
      return;
    }
    if (!result.ok) {
      setBusy(false);
      status(t('Não foi possível usar esta pasta: {error}', { error: result.error }), true);
      return;
    }
    status(t('Biblioteca configurada. Abrindo o Cite…'));
  }

  defaultBtn.addEventListener('click', async () => {
    setBusy(true);
    status(t('Preparando a biblioteca…'));
    try {
      finish(await window.cite.storage.useDefault());
    } catch (err) {
      setBusy(false);
      status(t('Não foi possível usar esta pasta: {error}', { error: err.message }), true);
    }
  });

  chooseBtn.addEventListener('click', async () => {
    setBusy(true);
    status(t('Abrindo o seletor de pastas…'));
    try {
      finish(await window.cite.storage.choose());
    } catch (err) {
      setBusy(false);
      status(t('Não foi possível usar esta pasta: {error}', { error: err.message }), true);
    }
  });

  quitBtn.addEventListener('click', () => window.cite.storage.quit());

  window.cite.storage
    .state()
    .then((next) => {
      state = next || state;
      render();
    })
    .catch(() => {
      state = { issue: { type: 'first-run' }, defaultPath: '' };
      render();
    });
})();
