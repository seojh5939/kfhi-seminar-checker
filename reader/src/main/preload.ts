import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectOutputDir: (locationName?: string) => ipcRenderer.invoke('reader:select-output-dir', locationName),
  exportCsv: (records: any[], targetPath: string) => ipcRenderer.invoke('reader:export-csv', { records, targetPath }),
  exportDesktopBackup: (records: any[], locationName: string) => ipcRenderer.invoke('reader:export-desktop-backup', { records, locationName }),
  decryptPayload: (cipherText: string, secretKey?: string) => ipcRenderer.invoke('reader:decrypt-payload', { cipherText, secretKey }),
  saveScanRecord: (record: any) => ipcRenderer.invoke('reader:save-record', record),
  getScanHistory: (location: string) => ipcRenderer.invoke('reader:get-history', location),
  openFolder: (folderPath: string) => ipcRenderer.invoke('reader:open-folder', folderPath),

  // Google Sheets 실시간 연동 API
  googleGetStatus: () => ipcRenderer.invoke('reader:google-get-status'),
  googleSelectCredentialsFile: () => ipcRenderer.invoke('reader:google-select-credentials-file'),
  googleLogin: () => ipcRenderer.invoke('reader:google-login'),
  googleLogout: () => ipcRenderer.invoke('reader:google-logout'),
  googleListRecentSheets: (limit?: number) => ipcRenderer.invoke('reader:google-list-recent-sheets', limit),
  googleGetSpreadsheetDetails: (urlOrId: string) => ipcRenderer.invoke('reader:google-get-spreadsheet-details', urlOrId),
  googleCreateSpreadsheet: (title?: string) => ipcRenderer.invoke('reader:google-create-spreadsheet', title),
  googleSyncRecords: (spreadsheetId: string, locationName: string, records: any[]) =>
    ipcRenderer.invoke('reader:google-sync-records', { spreadsheetId, locationName, records }),
  googleOpenSheetUrl: (url: string) => ipcRenderer.invoke('reader:google-open-sheet-url', url),
  focusWindow: () => ipcRenderer.invoke('reader:focus-window'),
});
