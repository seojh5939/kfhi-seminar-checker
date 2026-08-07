import * as fs from 'fs';
import * as path from 'path';
import * as pngjsModule from 'pngjs';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { CryptoEngine, QRPayload } from 'shared';

export interface VerificationItem {
  managementNumber: string;
  name: string;
  affiliation: string;
  title: string;
  fileName: string;
  status: 'success' | 'fail';
  decryptedPayload?: QRPayload;
  failReason?: string;
}

export interface VerificationSummary {
  total: number;
  successCount: number;
  failCount: number;
  items: VerificationItem[];
}

export class QRVerifier {
  private cryptoEngine: CryptoEngine;

  constructor(secretKey?: string) {
    this.cryptoEngine = new CryptoEngine(secretKey);
  }

  /**
   * 생성 폴더 내의 manifest.csv 및 QR PNG 파일들을 일괄 복호화 검증
   */
  public async verifyOutputDir(outputDir: string, manifestPath?: string): Promise<VerificationSummary> {
    let targetManifest = manifestPath;
    if (!targetManifest) {
      const txtManifest = path.join(outputDir, 'manifest.txt');
      const csvManifest = path.join(outputDir, 'manifest.csv');
      targetManifest = fs.existsSync(txtManifest) ? txtManifest : csvManifest;
    }

    if (!fs.existsSync(targetManifest)) {
      throw new Error(`매니페스트 파일(manifest.txt)을 찾을 수 없습니다: ${targetManifest}`);
    }

    // 파일 읽기 (UTF-16 LE 또는 UTF-8 읽기 및 BOM 제거)
    let fileContent = '';
    const buffer = fs.readFileSync(targetManifest);
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
      fileContent = buffer.toString('utf16le').replace(/^\uFEFF/, '');
    } else {
      fileContent = buffer.toString('utf8').replace(/^\uFEFF/, '');
    }

    const lines = fileContent.split(/\r?\n/).filter((line) => line.trim() !== '');

    if (lines.length <= 1) {
      throw new Error('매니페스트 파일에 참석자 레코드가 존재하지 않습니다.');
    }

    const items: VerificationItem[] = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Tab 탭 구분 또는 CSV 구분 파싱
      let cols: string[] = [];
      if (line.includes('\t')) {
        cols = line.split('\t').map((c) => c.trim().replace(/^"/, '').replace(/"$/, ''));
      } else {
        cols = line.match(/(?:^|,)(?:"([^"]*)"|([^,]*))/g)?.map((col) =>
          col.replace(/^,/, '').replace(/^"/, '').replace(/"$/, '').replace(/""/g, '"')
        ) || [];
      }

      if (cols.length < 5) continue;

      const [managementNumber, affiliation, title, name, rawFileName] = cols;
      const fileName = path.basename(rawFileName); // 파일명만 추출
      const relativePath = rawFileName.replace(/\//g, path.sep);
      let pngPath = path.join(outputDir, relativePath);
      if (!fs.existsSync(pngPath)) {
        pngPath = path.join(outputDir, fileName);
      }

      if (!fs.existsSync(pngPath)) {
        failCount++;
        items.push({
          managementNumber,
          name,
          affiliation,
          title,
          fileName,
          status: 'fail',
          failReason: 'QR PNG 파일이 출력 폴더에 존재하지 않습니다.',
        });
        continue;
      }

      try {
        // PNG 읽기 및 jsQR 디코딩
        const imageBuffer = fs.readFileSync(pngPath);
        const PNGLib: any = PNG || (pngjsModule as any).default?.PNG || (pngjsModule as any).PNG;
        const jsQRLib: any = typeof jsQR === 'function' ? jsQR : (jsQR as any).default;
        const png = PNGLib.sync.read(imageBuffer);
        const code = jsQRLib(new Uint8ClampedArray(png.data), png.width, png.height);

        if (!code || !code.data) {
          failCount++;
          items.push({
            managementNumber,
            name,
            affiliation,
            title,
            fileName,
            status: 'fail',
            failReason: 'QR 코드 이미지 스캔/디코딩 실패 (이미지 손상)',
          });
          continue;
        }

        // AES-256-GCM 복호화
        const payload = this.cryptoEngine.decryptToPayload(code.data);

        // 매니페스트 레코드와 복호화 원문 대조
        const isMatch =
          payload.id === managementNumber &&
          payload.n === name &&
          payload.a === affiliation &&
          payload.t === title;

        if (isMatch) {
          successCount++;
          items.push({
            managementNumber,
            name,
            affiliation,
            title,
            fileName,
            status: 'success',
            decryptedPayload: payload,
          });
        } else {
          failCount++;
          items.push({
            managementNumber,
            name,
            affiliation,
            title,
            fileName,
            status: 'fail',
            decryptedPayload: payload,
            failReason: `매니페스트 정보 불일치 (복호화된 이름: ${payload.n}, 소속: ${payload.a}, 직함: ${payload.t})`,
          });
        }
      } catch (err: any) {
        failCount++;
        items.push({
          managementNumber,
          name,
          affiliation,
          title,
          fileName,
          status: 'fail',
          failReason: `복호화 실패: ${err.message || 'AES 위변조 검증 실패'}`,
        });
      }
    }

    return {
      total: items.length,
      successCount,
      failCount,
      items,
    };
  }
}
