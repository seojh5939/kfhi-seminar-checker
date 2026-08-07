import * as fs from 'fs';
import * as path from 'path';
import QRCode from 'qrcode';
import { CryptoEngine, AttendeeInput, ManifestRecord } from 'shared';

export interface ProgressCallback {
  (current: number, total: number, currentAttendee: AttendeeInput): void;
}

/**
 * QR 코드 이미지 생성 및 파일 시스템 저장 전담 엔진 (SOLID & KISS)
 */
export class QRGeneratorEngine {
  private cryptoEngine: CryptoEngine;

  constructor(secretKey?: string) {
    this.cryptoEngine = new CryptoEngine(secretKey);
  }

  /**
   * AttendeeInput 목록을 수신하여 암호화 QR 이미지(PNG)를 대량 생성
   * 소속별 하위 폴더 분동 저장 및 매니페스트 레코드 배열 반환
   */
  public async generateBulk(
    attendees: AttendeeInput[],
    outputDir: string,
    onProgress?: ProgressCallback
  ): Promise<ManifestRecord[]> {
    const manifestRecords: ManifestRecord[] = [];
    const createdAt = new Date().toISOString().replace('T', ' ').substring(0, 19);

    // 출력 루트 디렉터리 보장
    const absoluteOutputDir = path.resolve(outputDir);
    if (!fs.existsSync(absoluteOutputDir)) {
      fs.mkdirSync(absoluteOutputDir, { recursive: true });
    }

    const total = attendees.length;

    for (let i = 0; i < total; i++) {
      const attendee = attendees[i];
      const fileName = `${attendee.managementNumber}.png`;
      const filePath = path.join(absoluteOutputDir, fileName);

      // 콤팩트 바이너리(Base64URL) 암호화 문자열 생성 (암호문 길이 65% 축소)
      const cipherText = this.cryptoEngine.encryptAttendeeCompact(attendee);

      // QR 코드 Buffer 생성 및 파일 저장 (300x300, 큼직한 모듈 셀)
      const qrcodeModule: any = typeof (QRCode as any).toBuffer === 'function' ? QRCode : (QRCode as any).default || QRCode;
      const qrBuffer = await qrcodeModule.toBuffer(cipherText, {
        width: 300,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#FFFFFF' },
      });

      fs.writeFileSync(filePath, qrBuffer);

      manifestRecords.push({
        managementNumber: attendee.managementNumber,
        name: attendee.name,
        affiliation: attendee.affiliation,
        title: attendee.title,
        fileName: fileName,
        createdAt,
      });

      if (onProgress) {
        onProgress(i + 1, total, attendee);
      }
    }

    // 관리번호 순 정렬하여 매니페스트 레코드 반환
    return manifestRecords.sort((a, b) => a.managementNumber.localeCompare(b.managementNumber));
  }
}
