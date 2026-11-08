const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('appbarSpike', {
  state: () => ipcRenderer.invoke('spike:state'),
  measure: () => ipcRenderer.invoke('spike:measure'),
  register: () => ipcRenderer.invoke('spike:register'),
  setHeight: (height) => ipcRenderer.invoke('spike:set-height', height),
  remove: () => ipcRenderer.invoke('spike:remove'),
  close: () => ipcRenderer.send('spike:close'),
  onLog: (callback) => ipcRenderer.on('spike:log', (_event, entry) => callback(entry)),
  onState: (callback) => ipcRenderer.on('spike:state', (_event, state) => callback(state)),
});
