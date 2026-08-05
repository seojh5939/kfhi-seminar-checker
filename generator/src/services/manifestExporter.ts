import * as fs from 'fs';
import * as path from 'path';
import { ManifestRecord } from 'shared';

export class ManifestExporter {
  /**
   * ManifestRecord 배열을 수신하여 Adobe InDesign Data Merge 호환 UTF-16 LE 탭 구분 TXT 파일로 저장
   */
  public static exportToTxt(records: ManifestRecord[], outputFilePath: string): void {
    const dir = path.dirname(outputFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Adobe InDesign 탭 구분 TXT 데이터 병합 헤더 (이미지 칼럼명 '@' 접두사 적용)
    const headers = ['관리번호', '성명', '소속', '직함', '@파일명', '생성일시'];
    const rows = records.map((rec) => [
      rec.managementNumber,
      rec.name,
      rec.affiliation,
      rec.title,
      rec.fileName,
      rec.createdAt,
    ]);

    const txtContent = [
      headers.join('\t'),
      ...rows.map((row) => row.join('\t')),
    ].join('\r\n');

    // Adobe InDesign 탭 구분 데이터 병합 표준: UTF-16 LE (BOM \uFEFF 포함)
    const utf16leBom = '\uFEFF';
    const buffer = Buffer.from(utf16leBom + txtContent, 'utf16le');
    fs.writeFileSync(outputFilePath, buffer);
  }

  /**
   * 기존 CSV 내보내기 하위 호환성 (TXT 포맷으로 투명 이관)
   */
  public static exportToCsv(records: ManifestRecord[], outputFilePath: string): void {
    const txtPath = outputFilePath.replace(/\.csv$/i, '.txt');
    this.exportToTxt(records, txtPath);
  }
}
