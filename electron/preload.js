import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true
});

contextBridge.exposeInMainWorld('bughuntClient', {
  connect: (hostIp) => ipcRenderer.send('bughunt:connect', hostIp),
  getSavedHost: () => ipcRenderer.invoke('bughunt:get-saved-host')
});
