import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { ExcelParser } from '../services/excelParser';
import { ExcelValidator } from '../services/excelValidator';
import { QRGeneratorEngine } from '../services/qrGenerator';
import { ManifestExporter } from '../services/manifestExporter';
import { QRVerifier } from '../services/qrVerifier';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: '기아대책 행사 QR코드 대량 생성기',
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

// IPC Handlers
ipcMain.handle('generator:select-excel', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '참석자 명단 엑셀 파일 선택',
    filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }],
    properties: ['openFile'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('generator:select-output-dir', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'QR 코드 및 매니페스트 저장 폴더 선택',
    properties: ['openDirectory', 'createDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('generator:validate-excel', async (_event, filePath: string) => {
  try {
    const rawRows = await ExcelParser.parseExcelFile(filePath);
    const validationResult = ExcelValidator.validate(rawRows);
    return validationResult;
  } catch (error: any) {
    return {
      isValid: false,
      attendees: [],
      errors: [
        {
          rowNumber: 0,
          managementNumber: '-',
          name: '-',
          reason: `엑셀 파일 읽기 오류: ${error.message || '파일 형식이 올바르지 않습니다.'}`,
        },
      ],
    };
  }
});

ipcMain.handle(
  'generator:generate-qr',
  async (_event, { attendees, outputDir }: { attendees: any[]; outputDir: string }) => {
    try {
      const engine = new QRGeneratorEngine();
      const manifestRecords = await engine.generateBulk(
        attendees,
        outputDir,
        (current, total, currentAttendee) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('generator:progress', {
              current,
              total,
              attendeeName: currentAttendee.name,
              managementNumber: currentAttendee.managementNumber,
            });
          }
        }
      );

      const manifestPath = path.join(outputDir, 'manifest.txt');
      ManifestExporter.exportToTxt(manifestRecords, manifestPath);

      return {
        success: true,
        manifestPath,
        count: manifestRecords.length,
      };
    } catch (error: any) {
      return {
        success: false,
        manifestPath: '',
        count: 0,
        error: error.message || 'QR 코드 생성 중 오류가 발생했습니다.',
      };
    }
  }
);

ipcMain.handle('generator:open-folder', async (_event, folderPath: string) => {
  if (folderPath && fs.existsSync(folderPath)) {
    shell.openPath(folderPath);
  }
});

ipcMain.handle(
  'generator:verify-output',
  async (_event, { outputDir, manifestPath }: { outputDir: string; manifestPath?: string }) => {
    try {
      const verifier = new QRVerifier();
      const result = await verifier.verifyOutputDir(outputDir, manifestPath);
      return { success: true, summary: result };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'QR 코드 검증 중 오류가 발생했습니다.',
      };
    }
  }
);
