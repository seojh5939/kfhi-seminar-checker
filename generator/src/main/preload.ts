import { contextBridge, ipcRenderer } from 'electron';
import { ColumnMapping, ExcelHeaderInfo, AttendeeInput } from 'shared';

export interface ElectronAPI {
  selectExcelFile: () => Promise<string | null>;
  selectOutputDir: () => Promise<string | null>;
  getExcelHeaders: (filePath: string) => Promise<{
    success: boolean;
    headerInfo?: ExcelHeaderInfo;
    error?: string;
  }>;
  parseExcelWithMapping: (params: {
    filePath: string;
    mapping: ColumnMapping;
  }) => Promise<{
    isValid: boolean;
    attendees: AttendeeInput[];
    errors: any[];
  }>;
  validateExcel: (filePath: string) => Promise<{
    isValid: boolean;
    attendees: any[];
    errors: any[];
  }>;
  generateQRCodes: (params: {
    attendees: AttendeeInput[];
    outputDir: string;
    encrypted?: boolean;
  }) => Promise<{
    success: boolean;
    manifestPath: string;
    count: number;
    error?: string;
  }>;
  openFolder: (folderPath: string) => Promise<void>;
  verifyOutput: (params: { outputDir: string; manifestPath?: string }) => Promise<{
    success: boolean;
    summary?: any;
    error?: string;
  }>;
  onProgress: (callback: (progress: { current: number; total: number; attendeeName: string; affiliation: string; title: string }) => void) => () => void;
}

contextBridge.exposeInMainWorld('electron', {
  selectExcelFile: () => ipcRenderer.invoke('generator:select-excel'),
  selectOutputDir: () => ipcRenderer.invoke('generator:select-output-dir'),
  getExcelHeaders: (filePath: string) => ipcRenderer.invoke('generator:get-excel-headers', filePath),
  parseExcelWithMapping: (params: { filePath: string; mapping: ColumnMapping }) =>
    ipcRenderer.invoke('generator:parse-excel-with-mapping', params),
  validateExcel: (filePath: string) => ipcRenderer.invoke('generator:validate-excel', filePath),
  generateQRCodes: (params: { attendees: AttendeeInput[]; outputDir: string; encrypted?: boolean }) =>
    ipcRenderer.invoke('generator:generate-qr', params),
  openFolder: (folderPath: string) => ipcRenderer.invoke('generator:open-folder', folderPath),
  verifyOutput: (params: { outputDir: string; manifestPath?: string }) =>
    ipcRenderer.invoke('generator:verify-output', params),
  onProgress: (callback: (progress: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('generator:progress', handler);
    return () => {
      ipcRenderer.removeListener('generator:progress', handler);
    };
  },
});
