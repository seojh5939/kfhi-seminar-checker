import * as fs from 'fs';
import * as path from 'path';
import * as pngjsModule from 'pngjs';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { CryptoEngine, QRPayload } from 'shared';

export interface VerificationItem {
  managementNumber: string;
  affiliation: string;
  title: string;
  name: string;
  tshirtSize?: string;
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
   * 생성 폴더 내의 manifest_list.txt + manifest_qr.txt (또는 manifest.txt) 및 QR PNG 파일들을 일괄 복호화 검증
   */
  public async verifyOutputDir(outputDir: string, manifestPath?: string): Promise<VerificationSummary> {
    const listTxt = path.join(outputDir, 'manifest_list.txt');
    const qrTxt = path.join(outputDir, 'manifest_qr.txt');
    const legacyTxt = manifestPath || path.join(outputDir, 'manifest.txt');

    interface ParsedRow {
      managementNumber: string;
      affiliation: string;
      title: string;
      name: string;
      fileName: string;
    }

    const rows: ParsedRow[] = [];

    // 1. Dual Manifest (manifest_list.txt & manifest_qr.txt) 우선 파싱
    if (fs.existsSync(listTxt) && fs.existsSync(qrTxt)) {
      const listContent = this.readTextFile(listTxt);
      const qrContent = this.readTextFile(qrTxt);

      const listLines = listContent.split(/\r?\n/).filter((l) => l.trim() !== '');
      const qrLines = qrContent.split(/\r?\n/).filter((l) => l.trim() !== '');

      // qrLines[i] -> [일련번호, 파일명], listLines[i] -> [이사회명, 직함, 성명]
      const totalCount = Math.min(listLines.length, qrLines.length);
      for (let i = 1; i < totalCount; i++) {
        const listCols = listLines[i].split('\t').map((c) => c.trim().replace(/^"/, '').replace(/"$/, ''));
        const qrCols = qrLines[i].split('\t').map((c) => c.trim().replace(/^"/, '').replace(/"$/, ''));

        if (listCols.length >= 3 && qrCols.length >= 2) {
          const affiliation = listCols[0];
          const title = listCols[1];
          const name = listCols[2];
          const serial = qrCols[0];
          const fileName = qrCols[1] || `${serial}.png`;

          rows.push({
            managementNumber: serial,
            affiliation,
            title,
            name,
            fileName,
          });
        }
      }
    } else if (fs.existsSync(legacyTxt)) {
      // 2. 하위 호환 manifest.txt 파싱
      const legacyContent = this.readTextFile(legacyTxt);
      const lines = legacyContent.split(/\r?\n/).filter((l) => l.trim() !== '');

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const cols = line.includes('\t')
          ? line.split('\t').map((c) => c.trim().replace(/^"/, '').replace(/"$/, ''))
          : line.split(',').map((c) => c.trim().replace(/^"/, '').replace(/"$/, ''));

        if (cols.length < 4) continue;

        let serial = '';
        let affiliation = '';
        let title = '';
        let name = '';
        let fileName = '';

        if (cols.length >= 5) {
          serial = cols[0];
          affiliation = cols[1];
          title = cols[2];
          name = cols[3];
          fileName = cols[4];
        } else {
          affiliation = cols[0];
          title = cols[1];
          name = cols[2];
          fileName = cols[3];
          serial = fileName.replace(/\.png$/i, '');
        }

        rows.push({
          managementNumber: serial,
          affiliation,
          title,
          name,
          fileName,
        });
      }
    } else {
      throw new Error(`매니페스트 파일을 찾을 수 없습니다: ${outputDir}`);
    }

    if (rows.length === 0) {
      throw new Error('매니페스트 파일에 참석자 레코드가 존재하지 않습니다.');
    }

    const items: VerificationItem[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const row of rows) {
      const pngName = path.basename(row.fileName);
      let pngPath = path.join(outputDir, row.fileName);
      if (!fs.existsSync(pngPath)) {
        pngPath = path.join(outputDir, pngName);
      }
      if (!fs.existsSync(pngPath)) {
        pngPath = path.join(outputDir, `${row.managementNumber}.png`);
      }

      if (!fs.existsSync(pngPath)) {
        failCount++;
        items.push({
          managementNumber: row.managementNumber,
          affiliation: row.affiliation,
          title: row.title,
          name: row.name,
          fileName: row.fileName,
          status: 'fail',
          failReason: `QR PNG 파일이 출력 폴더에 존재하지 않습니다 (${pngName})`,
        });
        continue;
      }

      try {
        const imageBuffer = fs.readFileSync(pngPath);
        const PNGLib: any = PNG || (pngjsModule as any).default?.PNG || (pngjsModule as any).PNG;
        const jsQRLib: any = typeof jsQR === 'function' ? jsQR : (jsQR as any).default;
        const png = PNGLib.sync.read(imageBuffer);
        const code = jsQRLib(new Uint8ClampedArray(png.data), png.width, png.height);

        if (!code || !code.data) {
          failCount++;
          items.push({
            managementNumber: row.managementNumber,
            affiliation: row.affiliation,
            title: row.title,
            name: row.name,
            fileName: row.fileName,
            status: 'fail',
            failReason: 'QR 코드 이미지 스캔/디코딩 실패 (이미지 손상)',
          });
          continue;
        }

        const payload = this.cryptoEngine.decryptToPayload(code.data);

        // 매니페스트 정보와 복호화 원문 대조
        const isMatch =
          payload.n === row.name &&
          payload.a === row.affiliation &&
          payload.t === row.title;

        if (isMatch) {
          successCount++;
          items.push({
            managementNumber: row.managementNumber,
            affiliation: row.affiliation,
            title: row.title,
            name: row.name,
            tshirtSize: payload.s,
            fileName: row.fileName,
            status: 'success',
            decryptedPayload: payload,
          });
        } else {
          failCount++;
          items.push({
            managementNumber: row.managementNumber,
            affiliation: row.affiliation,
            title: row.title,
            name: row.name,
            fileName: row.fileName,
            status: 'fail',
            decryptedPayload: payload,
            failReason: `매니페스트 정보 불일치 (복호화된 이름: ${payload.n}, 소속: ${payload.a}, 직함: ${payload.t})`,
          });
        }
      } catch (err: any) {
        failCount++;
        items.push({
          managementNumber: row.managementNumber,
          affiliation: row.affiliation,
          title: row.title,
          name: row.name,
          fileName: row.fileName,
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

  private readTextFile(filePath: string): string {
    const buffer = fs.readFileSync(filePath);
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
      return buffer.toString('utf16le').replace(/^\uFEFF/, '');
    }
    return buffer.toString('utf8').replace(/^\uFEFF/, '');
  }
}
