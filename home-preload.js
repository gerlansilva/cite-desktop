const { contextBridge, ipcRenderer } = require('electron');

const api = {
  platform: process.platform,
  version: '0.2.0',
  data: {
    call: (method, args) => ipcRenderer.invoke('data:call', method, args)
  },
  settings: {
    setLanguage: (language) => ipcRenderer.invoke('settings:set-language', language)
  },
  home: {
    state: () => ipcRenderer.invoke('home:state'),
    open: (action, id) => ipcRenderer.invoke('home:open', { action, id }),
    changeFolder: () => ipcRenderer.invoke('home:change-folder'),
    wordHelp: () => ipcRenderer.invoke('home:word-help')
  }
};

contextBridge.exposeInMainWorld('cite', api);
