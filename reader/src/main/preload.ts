import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectOutputDir: () => ipcRenderer.invoke('reader:select-output-dir'),
  exportCsv: (records: any[], targetPath: string) => ipcRenderer.invoke('reader:export-csv', { records, targetPath }),
  exportDesktopBackup: (records: any[], locationName: string) => ipcRenderer.invoke('reader:export-desktop-backup', { records, locationName }),
  decryptPayload: (cipherText: string, secretKey?: string) => ipcRenderer.invoke('reader:decrypt-payload', { cipherText, secretKey }),
  saveScanRecord: (record: any) => ipcRenderer.invoke('reader:save-record', record),
  getScanHistory: (location: string) => ipcRenderer.invoke('reader:get-history', location),
  openFolder: (folderPath: string) => ipcRenderer.invoke('reader:open-folder', folderPath),
});
