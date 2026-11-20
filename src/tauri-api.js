(function () {
  const tauri = window.__TAURI__;
  const invoke = tauri?.core?.invoke;
  if (!invoke) return;

  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
    crypto.randomUUID = function randomUUID() {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    };
  }

  const platform = /Windows/i.test(navigator.userAgent) ? 'win32' : 'darwin';
  const api = {
    platform,
    version: '0.3.0',
    data: {
      call: (method, args) => invoke('data_call', { method, args: args ?? null })
    },
    doi: {
      lookup: (doi) => invoke('doi_lookup', { doi }),
      search: (query) => invoke('doi_search', { query })
    },
    translation: {
      translate: (payload) => invoke('translation_translate', { payload })
    },
    metadata: {
      search: (payload) => invoke('metadata_search', { payload }),
      lookup: (payload) => invoke('metadata_lookup', { payload })
    },
    shell: {
      openPath: (path) => invoke('shell_open_path', { path }),
      openExternal: (url) => invoke('shell_open_external', { url })
    },
    pdf: {
      download: (payload) => invoke('pdf_download', { payload })
    },
    files: {
      saveText: (payload) => invoke('files_save_text', { payload })
    },
    backup: {
      create: (target) => invoke('backup_create', { target: target || null }),
      restore: (source) => invoke('backup_restore', { source: source || null })
    },
    annotations: {
      export: (payload) => invoke('annotations_export', { payload })
    },
    attachments: {
      save: (name, data) => invoke('attachments_save', { payload: { name, data } }),
      read: (path) => invoke('attachments_read', { path }),
      delete: (path) => invoke('attachments_delete', { path }),
      dir: () => invoke('attachments_dir'),
      list: () => invoke('attachments_list'),
      cleanupOrphans: (keep, maxAgeMs) =>
        invoke('attachments_cleanup_orphans', {
          payload: { keep: keep || [], maxAgeMs: maxAgeMs || 0 }
        })
    },
    settings: {
      getLanguage: () => invoke('settings_get_language'),
      setLanguage: (language) => invoke('settings_set_language', { language })
    },
    integrations: {
      github: {
        get: () => invoke('github_get'),
        save: (payload) => invoke('github_save', { payload }),
        publish: () => invoke('github_publish')
      }
    },
    word: {
      status: () => invoke('word_status'),
      install: () => invoke('word_install'),
      uninstall: () => invoke('word_uninstall')
    },
    home: {
      state: () => invoke('home_state'),
      open: (action, id) =>
        invoke('home_open', { payload: { action: action || null, id: id || null } }),
      changeFolder: () => invoke('home_change_folder'),
      wordHelp: () => invoke('home_word_help')
    },
    storage: {
      state: () => invoke('storage_state'),
      choose: () => invoke('storage_choose'),
      useDefault: () => invoke('storage_use_default'),
      quit: () => invoke('storage_quit')
    },
    info: () => invoke('app_info')
  };

  window.cite = api;
  window.refdesk = api;
})();
