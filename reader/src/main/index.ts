import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 750,
    minWidth: 850,
    minHeight: 600,
    title: '기아대책 행사 QR 인식기 (Reader)',
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

import { CryptoEngine } from 'shared';

ipcMain.handle('reader:decrypt-payload', async (_event, { cipherText, secretKey }: { cipherText: string; secretKey?: string }) => {
  try {
    const engine = new CryptoEngine(secretKey);
    const payload = engine.decryptToPayload(cipherText);
    return { success: true, payload };
  } catch (error: any) {
    return { success: false, error: error.message || '복호화 실패' };
  }
});

// IPC Handlers
ipcMain.handle('reader:select-output-dir', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '방문 기록 CSV 파일 내보내기 위치 지정',
    defaultPath: `방문기록_${new Date().toISOString().substring(0, 10)}.csv`,
    filters: [{ name: 'CSV Files', extensions: ['csv'] }],
  });

  if (result.canceled || !result.filePath) {
    return null;
  }
  return result.filePath;
});

ipcMain.handle('reader:export-csv', async (_event, { records, targetPath }: { records: any[]; targetPath: string }) => {
  try {
    const header = '관리번호,성명,소속,직함,방문장소,방문시각,중복방문여부\n';
    const rows = records.map((r) =>
      `"${r.managementNumber}","${r.name}","${r.affiliation}","${r.title}","${r.location}","${r.scannedAt}","${r.isDuplicate ? '중복' : '정상'}"`
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
    const dateStr = new Date().toISOString().substring(0, 10);
    const fileName = `QR출입기록_${safeLocName}_${dateStr}.csv`;
    const targetPath = path.join(desktopDir, fileName);

    const header = '관리번호,성명,소속,직함,방문장소,방문시각,중복방문여부\n';
    const rows = (records || []).map((r) =>
      `"${r.managementNumber}","${r.name}","${r.affiliation}","${r.title}","${r.location}","${r.scannedAt}","${r.isDuplicate ? '중복' : '정상'}"`
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
