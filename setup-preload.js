const { contextBridge, ipcRenderer } = require('electron');

const api = {
  platform: process.platform,
  version: '0.2.0',
  storage: {
    state: () => ipcRenderer.invoke('storage:setup:state'),
    choose: () => ipcRenderer.invoke('storage:setup:choose'),
    useDefault: () => ipcRenderer.invoke('storage:setup:default'),
    quit: () => ipcRenderer.invoke('storage:setup:quit')
  }
};

contextBridge.exposeInMainWorld('cite', api);
