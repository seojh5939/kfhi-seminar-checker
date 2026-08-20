import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { CryptoEngine } from 'shared';
import { GoogleAuthService } from './services/googleAuthService';
import { GoogleSheetsService } from './services/googleSheetsService';

let mainWindow: BrowserWindow | null = null;
const googleAuthService = new GoogleAuthService();
const googleSheetsService = new GoogleSheetsService(googleAuthService);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 750,
    minWidth: 850,
    minHeight: 600,
    title: '기아대책 행사 QR 인식기 (Reader v1.2.0)',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.setMenu(null);

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const htmlPath = path.join(__dirname, '../renderer/index.html');
    if (fs.existsSync(htmlPath)) {
      mainWindow.loadFile(htmlPath);
    } else {
      mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
    }
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('reader:decrypt-payload', async (_event, { cipherText, secretKey }: { cipherText: string; secretKey?: string }) => {
  try {
    const engine = new CryptoEngine(secretKey);
    const payload = engine.decryptToPayload(cipherText);
    return { success: true, payload };
  } catch (error: any) {
    return { success: false, error: error.message || '복호화 실패' };
  }
});

// 년월일시분초 포맷팅 유틸리티 (예: 20260804_211820)
function getFormattedTimestamp(): string {
  const now = new Date();
  const YYYY = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const DD = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${YYYY}${MM}${DD}_${hh}${mm}${ss}`;
}

// CSV Export Handlers
ipcMain.handle('reader:select-output-dir', async (_event, locationName?: string) => {
  if (!mainWindow) return null;
  const safeLocName = (locationName || '장소미지정').replace(/[/\\?%*:|"<>]/g, '_');
  const timestamp = getFormattedTimestamp();
  const defaultFileName = `방문기록_${safeLocName}_${timestamp}.csv`;

  const result = await dialog.showSaveDialog(mainWindow, {
    title: '방문 기록 CSV 파일 내보내기 위치 지정',
    defaultPath: defaultFileName,
    filters: [{ name: 'CSV Files', extensions: ['csv'] }],
  });

  if (result.canceled || !result.filePath) {
    return null;
  }
  return result.filePath;
});

ipcMain.handle('reader:export-csv', async (_event, { records, targetPath }: { records: any[]; targetPath: string }) => {
  try {
    const header = '이사회명,직함,성명,티셔츠사이즈,방문장소,방문시각,중복방문여부\n';
    const rows = (records || []).map((r) =>
      `"${r.affiliation || ''}","${r.title || ''}","${r.name || ''}","${r.tshirtSize || ''}","${r.location || ''}","${r.scannedAt || ''}","${r.isDuplicate ? '중복' : '정상'}"`
    ).join('\n');

    // UTF-8 BOM (\uFEFF) 추가로 Excel 한글 깨짐 방지
    const csvContent = '\uFEFF' + header + rows;
    fs.writeFileSync(targetPath, csvContent, 'utf8');

    return { success: true, count: records.length };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 바탕화면(Desktop)에 자동 백업 저장 IPC 핸들러
ipcMain.handle('reader:export-desktop-backup', async (_event, { records, locationName }: { records: any[]; locationName: string }) => {
  try {
    const desktopDir = app.getPath('desktop');
    const safeLocName = (locationName || '기본장소').replace(/[/\\?%*:|"<>]/g, '_');
    const timestamp = getFormattedTimestamp();
    const fileName = `방문기록_${safeLocName}_${timestamp}.csv`;
    const targetPath = path.join(desktopDir, fileName);

    const header = '이사회명,직함,성명,티셔츠사이즈,방문장소,방문시각,중복방문여부\n';
    const rows = (records || []).map((r) =>
      `"${r.affiliation || ''}","${r.title || ''}","${r.name || ''}","${r.tshirtSize || ''}","${r.location || ''}","${r.scannedAt || ''}","${r.isDuplicate ? '중복' : '정상'}"`
    ).join('\n');

    const csvContent = '\uFEFF' + header + rows;
    fs.writeFileSync(targetPath, csvContent, 'utf8');

    return { success: true, filePath: targetPath, fileName, count: records.length };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('reader:open-folder', async (_event, folderPath: string) => {
  if (folderPath && fs.existsSync(folderPath)) {
    shell.openPath(folderPath);
  }
});

// ==========================================
// Google Sheets Integration IPC Handlers
// ==========================================

ipcMain.handle('reader:google-get-status', async () => {
  try {
    return await googleAuthService.getStatus();
  } catch (error: any) {
    return {
      hasCredentialsFile: false,
      isAuthenticated: false,
      error: error.message,
    };
  }
});

ipcMain.handle('reader:google-select-credentials-file', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'google-credentials.json 파일 선택',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = result.filePaths[0];
  const ok = googleAuthService.setCustomCredentialsPath(selectedPath);
  if (ok) {
    return selectedPath;
  }
  return null;
});

ipcMain.handle('reader:google-login', async () => {
  try {
    return await googleAuthService.login();
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('reader:google-logout', async () => {
  return googleAuthService.logout();
});

ipcMain.handle('reader:google-list-recent-sheets', async (_event, limit?: number) => {
  try {
    return await googleSheetsService.listRecentSpreadsheets(limit || 10);
  } catch (error: any) {
    console.error('Failed to list sheets:', error);
    throw error;
  }
});

ipcMain.handle('reader:google-get-spreadsheet-details', async (_event, urlOrId: string) => {
  try {
    return await googleSheetsService.getSpreadsheetDetails(urlOrId);
  } catch (error: any) {
    console.error('Failed to get spreadsheet details:', error);
    throw error;
  }
});

ipcMain.handle('reader:google-create-spreadsheet', async (_event, title?: string) => {
  try {
    return await googleSheetsService.createSpreadsheet(title);
  } catch (error: any) {
    console.error('Failed to create spreadsheet:', error);
    throw error;
  }
});

ipcMain.handle(
  'reader:google-sync-records',
  async (_event, { spreadsheetId, locationName, records }: { spreadsheetId: string; locationName: string; records: any[] }) => {
    try {
      const result = await googleSheetsService.appendRecords(spreadsheetId, locationName, records);
      return { success: true, count: result.count };
    } catch (error: any) {
      console.error('Google sync records error:', error);
      return { success: false, count: 0, error: error.message };
    }
  }
);

ipcMain.handle('reader:google-open-sheet-url', async (_event, targetUrl: string) => {
  if (targetUrl) {
    shell.openExternal(targetUrl);
  }
});

ipcMain.handle('reader:focus-window', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.webContents.focus();
  }
  return true;
});
