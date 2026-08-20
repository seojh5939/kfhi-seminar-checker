import * as fs from 'fs';
import * as path from 'path';
import QRCode from 'qrcode';
import { CryptoEngine, AttendeeInput, ManifestRecord, formatKSTDateTime } from 'shared';

export interface ProgressCallback {
  (current: number, total: number, currentAttendee: AttendeeInput): void;
}

/**
 * QR 코드 이미지 생성 및 파일 시스템 저장 전담 엔진 (v1.1)
 */
export class QRGeneratorEngine {
  private cryptoEngine: CryptoEngine;

  constructor(secretKey?: string) {
    this.cryptoEngine = new CryptoEngine(secretKey);
  }

  /**
   * AttendeeInput 목록을 수신하여 QR 이미지(PNG)를 대량 생성
   * 파일명 규칙: {이사회명}_{직책}_{성명}.png
   */
  public async generateBulk(
    attendees: AttendeeInput[],
    outputDir: string,
    encrypted: boolean = false,
    onProgress?: ProgressCallback
  ): Promise<ManifestRecord[]> {
    const manifestRecords: ManifestRecord[] = [];
    const createdAt = formatKSTDateTime();

    // 출력 디렉터리 보장
    const absoluteOutputDir = path.resolve(outputDir);
    if (!fs.existsSync(absoluteOutputDir)) {
      fs.mkdirSync(absoluteOutputDir, { recursive: true });
    }

    const total = attendees.length;
    const fileNameCounts: Record<string, number> = {};

    for (let i = 0; i < total; i++) {
      const attendee = attendees[i];

      // 파일명 안전 정제
      const safeAff = this.sanitizeFileName(attendee.affiliation);
      const safeTitle = this.sanitizeFileName(attendee.title);
      const safeName = this.sanitizeFileName(attendee.name);

      const baseName = `${safeAff}_${safeTitle}_${safeName}`;
      fileNameCounts[baseName] = (fileNameCounts[baseName] || 0) + 1;

      // 동명이인 등 동일 파일명 충돌 방어
      const suffix = fileNameCounts[baseName] > 1 ? `_${fileNameCounts[baseName]}` : '';
      const fileName = `${baseName}${suffix}.png`;
      const filePath = path.join(absoluteOutputDir, fileName);

      // 평문 또는 암호화 페이로드 인코딩
      const payloadString = this.cryptoEngine.encodeAttendee(attendee, encrypted);

      // QR 코드 Buffer 생성 및 파일 저장 (300x300, M 레벨)
      const qrcodeModule: any = typeof (QRCode as any).toBuffer === 'function' ? QRCode : (QRCode as any).default || QRCode;
      const qrBuffer = await qrcodeModule.toBuffer(payloadString, {
        width: 300,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#FFFFFF' },
      });

      fs.writeFileSync(filePath, qrBuffer);

      manifestRecords.push({
        affiliation: attendee.affiliation,
        title: attendee.title,
        name: attendee.name,
        tshirtSize: attendee.tshirtSize || '',
        fileName: fileName,
        createdAt,
      });

      if (onProgress) {
        onProgress(i + 1, total, attendee);
      }
    }

    return manifestRecords;
  }

  /**
   * Windows 파일 시스템 금지 문자 및 공백을 언더스코어로 안전 치환
   */
  private sanitizeFileName(text: string): string {
    return (text || '')
      .toString()
      .trim()
      .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
      .replace(/\s+/g, '_');
  }
}
