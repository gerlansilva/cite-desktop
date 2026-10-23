const { contextBridge, ipcRenderer } = require('electron');

const api = {
  platform: process.platform,
  version: '0.2.0',
  data: {
    call: (method, args) => ipcRenderer.invoke('data:call', method, args)
  },
  doi: {
    lookup: (doi) => ipcRenderer.invoke('doi:lookup', doi),
    search: (query) => ipcRenderer.invoke('doi:search', query)
  },
  translation: {
    translate: (payload) => ipcRenderer.invoke('translation:translate', payload)
  },
  metadata: {
    search: (payload) => ipcRenderer.invoke('metadata:search', payload),
    lookup: (payload) => ipcRenderer.invoke('metadata:lookup', payload)
  },
  shell: {
    openPath: (filePath) => ipcRenderer.invoke('shell:openPath', filePath),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
  },
  pdf: {
    openWindow: (filePath) => ipcRenderer.invoke('pdf:openWindow', filePath),
    download: (payload) => ipcRenderer.invoke('pdf:download', payload)
  },
  backup: {
    create: (targetPath) => ipcRenderer.invoke('backup:create', targetPath),
    restore: (sourcePath) => ipcRenderer.invoke('backup:restore', sourcePath)
  },
  annotations: {
    export: (payload) => ipcRenderer.invoke('annotations:export', payload)
  },
  settings: {
    getLanguage: () => ipcRenderer.invoke('settings:get-language'),
    setLanguage: (language) => ipcRenderer.invoke('settings:set-language', language)
  },
  integrations: {
    github: {
      get: () => ipcRenderer.invoke('integrations:github:get'),
      save: (payload) => ipcRenderer.invoke('integrations:github:save', payload),
      publish: () => ipcRenderer.invoke('integrations:github:publish')
    }
  },
  attachments: {
    save: (name, data) => ipcRenderer.invoke('attachments:save', { name, data }),
    read: (filePath) => ipcRenderer.invoke('attachments:read', filePath),
    delete: (filePath) => ipcRenderer.invoke('attachments:delete', filePath),
    dir: () => ipcRenderer.invoke('attachments:dir'),
    list: () => ipcRenderer.invoke('attachments:list'),
    cleanupOrphans: (keepPaths, maxAgeMs) =>
      ipcRenderer.invoke('attachments:cleanupOrphans', keepPaths, maxAgeMs)
  }
};

contextBridge.exposeInMainWorld('cite', api);
contextBridge.exposeInMainWorld('refdesk', api);
