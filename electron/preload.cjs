const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('llmTunerServer', Object.freeze({
  getAutostartStatus: () => ipcRenderer.invoke('llm-tuner:server-autostart-status'),
  setAutostartEnabled: (enabled) => ipcRenderer.invoke('llm-tuner:server-autostart-set', enabled),
  revealConnection: () => ipcRenderer.invoke('llm-tuner:server-connection-reveal'),
  copyToken: () => ipcRenderer.invoke('llm-tuner:server-token-copy')
}));
