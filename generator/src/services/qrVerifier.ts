import * as fs from 'fs';
import * as path from 'path';
import * as pngjsModule from 'pngjs';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { CryptoEngine, QRPayload } from 'shared';

export interface VerificationItem {
  affiliation: string;
  title: string;
  name: string;
  tshirtSize?: string;
  fileName: string;
  status: 'success' | 'fail';
  decryptedPayload?: QRPayload;
  failReason?: string;
  managementNumber?: string;
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
   * 생성 폴더 내의 manifest.txt (또는 manifest.csv) 및 QR PNG 파일들을 일괄 복호화 검증
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
      let cols: string[] = [];
      if (line.includes('\t')) {
        cols = line.split('\t').map((c) => c.trim().replace(/^"/, '').replace(/"$/, ''));
      } else {
        cols = line.match(/(?:^|,)(?:"([^"]*)"|([^,]*))/g)?.map((col) =>
          col.replace(/^,/, '').replace(/^"/, '').replace(/"$/, '').replace(/""/g, '"')
        ) || [];
      }

      if (cols.length < 4) continue;

      let affiliation = '';
      let title = '';
      let name = '';
      let tshirtSize = '';
      let rawFileName = '';

      // v1.1 규격: 이사회명(0), 직함(1), 성명(2), 티셔츠사이즈(3), #QR코드(4)
      if (cols.length >= 5 && cols[4].endsWith('.png')) {
        affiliation = cols[0];
        title = cols[1];
        name = cols[2];
        tshirtSize = cols[3];
        rawFileName = cols[4];
      } else if (cols.length >= 5 && cols[0].length === 5 && !isNaN(Number(cols[0]))) {
        // 구버전 v1 호환: 관리번호(0), 이사회명(1), 직함(2), 성명(3), #QR코드(4)
        affiliation = cols[1];
        title = cols[2];
        name = cols[3];
        rawFileName = cols[4];
      } else {
        affiliation = cols[0] || '';
        title = cols[1] || '';
        name = cols[2] || '';
        rawFileName = cols[cols.length - 1] || '';
      }

      const fileName = path.basename(rawFileName);
      const relativePath = rawFileName.replace(/\//g, path.sep);
      let pngPath = path.join(outputDir, relativePath);
      if (!fs.existsSync(pngPath)) {
        pngPath = path.join(outputDir, fileName);
      }

      if (!fs.existsSync(pngPath)) {
        failCount++;
        items.push({
          affiliation,
          title,
          name,
          tshirtSize,
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
            affiliation,
            title,
            name,
            tshirtSize,
            fileName,
            status: 'fail',
            failReason: 'QR 코드 이미지 스캔/디코딩 실패 (이미지 손상)',
          });
          continue;
        }

        // 평문/암호문 자동 복호화
        const payload = this.cryptoEngine.decryptToPayload(code.data);

        // 매니페스트 레코드와 복호화 원문 대조
        const isMatch =
          payload.n === name &&
          payload.a === affiliation &&
          payload.t === title;

        if (isMatch) {
          successCount++;
          items.push({
            affiliation,
            title,
            name,
            tshirtSize: payload.s || tshirtSize,
            fileName,
            status: 'success',
            decryptedPayload: payload,
          });
        } else {
          failCount++;
          items.push({
            affiliation,
            title,
            name,
            tshirtSize,
            fileName,
            status: 'fail',
            decryptedPayload: payload,
            failReason: `매니페스트 정보 불일치 (복호화된 이름: ${payload.n}, 소속: ${payload.a}, 직함: ${payload.t})`,
          });
        }
      } catch (err: any) {
        failCount++;
        items.push({
          affiliation,
          title,
          name,
          tshirtSize,
          fileName,
          status: 'fail',
          failReason: `복호화 실패: ${err.message || 'QR 데이터 파싱 실패'}`,
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
