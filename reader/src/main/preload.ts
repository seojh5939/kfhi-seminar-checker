import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectOutputDir: () => ipcRenderer.invoke('reader:select-output-dir'),
  exportCsv: (records: any[], targetPath: string) => ipcRenderer.invoke('reader:export-csv', { records, targetPath }),
  saveScanRecord: (record: any) => ipcRenderer.invoke('reader:save-record', record),
  getScanHistory: (location: string) => ipcRenderer.invoke('reader:get-history', location),
  openFolder: (folderPath: string) => ipcRenderer.invoke('reader:open-folder', folderPath),
});
