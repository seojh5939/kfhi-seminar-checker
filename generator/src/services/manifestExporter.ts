import * as fs from 'fs';
import * as path from 'path';
import { ManifestRecord } from 'shared';

export class ManifestExporter {
  /**
   * ManifestRecord 배열을 수신하여 Adobe InDesign Data Merge(데이터 병합) 호환 UTF-8 BOM 인코딩 CSV 파일로 저장
   */
  public static exportToCsv(records: ManifestRecord[], outputFilePath: string): void {
    const dir = path.dirname(outputFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Adobe InDesign 데이터 병합에서 이미지 필드로 인식하려면 헤더명이 '@'로 시작해야 함
    const headers = ['관리번호', '성명', '소속', '직함', '@파일명', '생성일시'];
    const rows = records.map((rec) => [
      `"${rec.managementNumber}"`,
      `"${rec.name.replace(/"/g, '""')}"`,
      `"${rec.affiliation.replace(/"/g, '""')}"`,
      `"${rec.title.replace(/"/g, '""')}"`,
      `"${rec.fileName.replace(/"/g, '""')}"`,
      `"${rec.createdAt}"`,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\r\n');

    // Windows Excel 및 Adobe InDesign 한글 깨짐 방지를 위해 UTF-8 BOM(\uFEFF) 추가
    const utf8Bom = '\uFEFF';
    fs.writeFileSync(outputFilePath, utf8Bom + csvContent, { encoding: 'utf8' });
  }
}
