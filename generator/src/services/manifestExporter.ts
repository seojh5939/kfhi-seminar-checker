import * as fs from 'fs';
import * as path from 'path';
import { ManifestRecord, DualManifestPaths } from 'shared';

export class ManifestExporter {
  /**
   * ManifestRecord 배열을 수신하여 탭(관할 지역)별 서브 폴더 및 루트 폴더에
   * InDesign Data Merge용 2종 분리 TXT 파일(UTF-16 LE with BOM)을 생성
   * 1. manifest_list.txt : 이사회명, 직함, 성명 (QR 및 일련번호 제외 명단 정보)
   * 2. manifest_qr.txt   : 일련번호, #QR코드 (QR 파일 매핑)
   */
  public static exportDualTxt(records: ManifestRecord[], outputDir: string): DualManifestPaths {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const utf16leBom = '\uFEFF';

    // 1. 관할 지역(시트/탭)별 그룹핑
    const sheetGroups = new Map<string, ManifestRecord[]>();
    for (const rec of records) {
      const sheet = rec.sheetName || '';
      if (!sheetGroups.has(sheet)) {
        sheetGroups.set(sheet, []);
      }
      sheetGroups.get(sheet)!.push(rec);
    }

    // 2. 탭(관할 지역)별 하위 폴더 내 독립 매니페스트 생성
    for (const [sheet, sheetRecords] of sheetGroups.entries()) {
      if (!sheet) continue;
      const sheetDirPath = path.join(outputDir, sheet);
      if (!fs.existsSync(sheetDirPath)) {
        fs.mkdirSync(sheetDirPath, { recursive: true });
      }

      // (1) 탭 폴더 내 manifest_list.txt (인적 정보)
      const subListHeaders = ['이사회명', '직함', '성명'];
      const subListRows = sheetRecords.map((rec) => [
        rec.affiliation,
        rec.title,
        rec.name,
      ]);
      const subListContent = [
        subListHeaders.join('\t'),
        ...subListRows.map((row) => row.join('\t')),
      ].join('\r\n');
      fs.writeFileSync(path.join(sheetDirPath, 'manifest_list.txt'), Buffer.from(utf16leBom + subListContent, 'utf16le'));

      // (2) 탭 폴더 내 manifest_qr.txt (로컬 상대경로: 200001.png)
      const subQrHeaders = ['일련번호', '#QR코드'];
      const subQrRows = sheetRecords.map((rec) => [
        rec.managementNumber || '',
        rec.fileName,
      ]);
      const subQrContent = [
        subQrHeaders.join('\t'),
        ...subQrRows.map((row) => row.join('\t')),
      ].join('\r\n');
      fs.writeFileSync(path.join(sheetDirPath, 'manifest_qr.txt'), Buffer.from(utf16leBom + subQrContent, 'utf16le'));

      // (3) 탭 폴더 내 manifest_master.txt (InDesign 통합 마스터: 일련번호, 이사회명, 직함, 성명, #QR코드)
      const subMasterHeaders = ['일련번호', '이사회명', '직함', '성명', '#QR코드'];
      const subMasterRows = sheetRecords.map((rec) => [
        rec.managementNumber || '',
        rec.affiliation,
        rec.title,
        rec.name,
        rec.fileName,
      ]);
      const subMasterContent = [
        subMasterHeaders.join('\t'),
        ...subMasterRows.map((row) => row.join('\t')),
      ].join('\r\n');
      fs.writeFileSync(path.join(sheetDirPath, 'manifest_master.txt'), Buffer.from(utf16leBom + subMasterContent, 'utf16le'));
    }

    // 3. 루트 폴더: 전체 통합 매니페스트 생성
    // (1) 루트 manifest_list.txt (인적 정보)
    const listHeaders = ['이사회명', '직함', '성명'];
    const listRows = records.map((rec) => [
      rec.affiliation,
      rec.title,
      rec.name,
    ]);
    const listContent = [
      listHeaders.join('\t'),
      ...listRows.map((row) => row.join('\t')),
    ].join('\r\n');
    const listManifestPath = path.join(outputDir, 'manifest_list.txt');
    fs.writeFileSync(listManifestPath, Buffer.from(utf16leBom + listContent, 'utf16le'));

    // (2) 루트 manifest_qr.txt (서브 폴더 상대경로: 서울/200001.png)
    const qrHeaders = ['일련번호', '#QR코드'];
    const qrRows = records.map((rec) => [
      rec.managementNumber || '',
      rec.sheetName ? `${rec.sheetName}/${rec.fileName}` : rec.fileName,
    ]);
    const qrContent = [
      qrHeaders.join('\t'),
      ...qrRows.map((row) => row.join('\t')),
    ].join('\r\n');
    const qrManifestPath = path.join(outputDir, 'manifest_qr.txt');
    fs.writeFileSync(qrManifestPath, Buffer.from(utf16leBom + qrContent, 'utf16le'));

    // (3) 루트 manifest_master.txt (InDesign 통합 마스터: 일련번호, 이사회명, 직함, 성명, #QR코드)
    const masterHeaders = ['일련번호', '이사회명', '직함', '성명', '#QR코드'];
    const masterRows = records.map((rec) => [
      rec.managementNumber || '',
      rec.affiliation,
      rec.title,
      rec.name,
      rec.sheetName ? `${rec.sheetName}/${rec.fileName}` : rec.fileName,
    ]);
    const masterContent = [
      masterHeaders.join('\t'),
      ...masterRows.map((row) => row.join('\t')),
    ].join('\r\n');
    const masterManifestPath = path.join(outputDir, 'manifest_master.txt');
    fs.writeFileSync(masterManifestPath, Buffer.from(utf16leBom + masterContent, 'utf16le'));

    return {
      listManifestPath,
      qrManifestPath,
      masterManifestPath,
    };
  }

  /**
   * 단일 파일 내보내기 (하위 호환성)
   */
  public static exportToTxt(records: ManifestRecord[], outputFilePath: string): void {
    const dir = path.dirname(outputFilePath);
    this.exportDualTxt(records, dir);
  }

  /**
   * 기존 CSV 내보내기 하위 호환성
   */
  public static exportToCsv(records: ManifestRecord[], outputFilePath: string): void {
    const dir = path.dirname(outputFilePath);
    this.exportDualTxt(records, dir);
  }
}
