'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('startupDiagnostic', {
  close: () => ipcRenderer.invoke('startup-diagnostic:close'),
});
