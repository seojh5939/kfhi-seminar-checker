import * as fs from 'fs';
import * as path from 'path';
import QRCode from 'qrcode';
import {
  CryptoEngine,
  AttendeeInput,
  ManifestRecord,
  formatKSTDateTime,
  resolveRegionCode,
} from 'shared';

export interface ProgressCallback {
  (current: number, total: number, currentAttendee: AttendeeInput): void;
}

/**
 * QR 코드 이미지 생성 및 파일 시스템 저장 전담 엔진 (v1.5: 탭별 관할지역 폴더 분류 & 6자리 일련번호 채번)
 */
export class QRGeneratorEngine {
  private cryptoEngine: CryptoEngine;

  constructor(secretKey?: string) {
    this.cryptoEngine = new CryptoEngine(secretKey);
  }

  /**
   * AttendeeInput 목록을 수신하여 탭(관할 지역)별 폴더를 생성하고 6자리 일련번호 QR 이미지(PNG)를 대량 생성
   * 저장 경로 규칙: {outputDir}/{탭이름(관할지역)}/{일련번호}.png
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
    // 권역별 누적 순번 카운터 (예: '20' -> 1, 2, 3...)
    const regionCounters = new Map<string, number>();

    for (let i = 0; i < total; i++) {
      const attendee = attendees[i];

      // 1. 관할 지역 탭 폴더 확인 및 생성
      const rawSheetName = attendee.sheetName || '기타';
      const safeSheetName = this.sanitizeFileName(rawSheetName);
      const sheetDirPath = path.join(absoluteOutputDir, safeSheetName);
      if (!fs.existsSync(sheetDirPath)) {
        fs.mkdirSync(sheetDirPath, { recursive: true });
      }

      // 2. 일련번호 채번 (전화 지역번호 끝 2자리 + 4자리 순번 0001~9999)
      let serialNumber = attendee.managementNumber;
      if (!serialNumber || !/^\d{5,6}$/.test(serialNumber)) {
        const regionCode = resolveRegionCode(attendee.affiliation, rawSheetName);
        const nextSeq = (regionCounters.get(regionCode) || 0) + 1;
        regionCounters.set(regionCode, nextSeq);
        serialNumber = `${regionCode}${String(nextSeq).padStart(4, '0')}`;
      }

      // 3. 파일명 규칙: {일련번호}.png 및 관할 지역 폴더 내 저장
      const fileName = `${serialNumber}.png`;
      const filePath = path.join(sheetDirPath, fileName);

      // 4. 일련번호를 포함한 참석자 정보로 암호화/평문 페이로드 생성
      const attendeeWithSerial: AttendeeInput = {
        ...attendee,
        managementNumber: serialNumber,
      };
      const payloadString = this.cryptoEngine.encodeAttendee(attendeeWithSerial, encrypted);

      // 5. QR 코드 Buffer 생성 및 파일 저장 (300x300, M 레벨)
      const qrcodeModule: any = typeof (QRCode as any).toBuffer === 'function' ? QRCode : (QRCode as any).default || QRCode;
      const qrBuffer = await qrcodeModule.toBuffer(payloadString, {
        width: 300,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#FFFFFF' },
      });

      fs.writeFileSync(filePath, qrBuffer);

      // 6. 매니페스트 레코드 적재
      manifestRecords.push({
        managementNumber: serialNumber,
        affiliation: attendee.affiliation,
        title: attendee.title,
        name: attendee.name,
        tshirtSize: attendee.tshirtSize || '',
        fileName: fileName,
        createdAt,
        sheetName: safeSheetName,
      });

      if (onProgress) {
        onProgress(i + 1, total, attendeeWithSerial);
      }
    }

    return manifestRecords;
  }

  /**
   * 폴더명 및 파일명 안전 정제
   */
  private sanitizeFileName(text: string): string {
    return (text || '')
      .toString()
      .trim()
      .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
      .replace(/\s+/g, '_');
  }
}
