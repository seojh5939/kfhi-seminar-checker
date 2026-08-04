import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  selectExcelFile: () => Promise<string | null>;
  selectOutputDir: () => Promise<string | null>;
  validateExcel: (filePath: string) => Promise<{
    isValid: boolean;
    attendees: any[];
    errors: any[];
  }>;
  generateQRCodes: (params: {
    attendees: any[];
    outputDir: string;
  }) => Promise<{
    success: boolean;
    manifestPath: string;
    count: number;
    error?: string;
  }>;
  openFolder: (folderPath: string) => Promise<void>;
  onProgress: (callback: (progress: { current: number; total: number; attendeeName: string; managementNumber: string }) => void) => () => void;
}

contextBridge.exposeInMainWorld('electron', {
  selectExcelFile: () => ipcRenderer.invoke('generator:select-excel'),
  selectOutputDir: () => ipcRenderer.invoke('generator:select-output-dir'),
  validateExcel: (filePath: string) => ipcRenderer.invoke('generator:validate-excel', filePath),
  generateQRCodes: (params: { attendees: any[]; outputDir: string }) =>
    ipcRenderer.invoke('generator:generate-qr', params),
  openFolder: (folderPath: string) => ipcRenderer.invoke('generator:open-folder', folderPath),
  onProgress: (callback: (progress: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('generator:progress', handler);
    return () => {
      ipcRenderer.removeListener('generator:progress', handler);
    };
  },
});
