import ExcelJS from 'exceljs';
import { AttendeeInput } from 'shared';

export class ExcelParser {
  /**
   * 엑셀 파일(.xlsx) 경로 또는 버퍼를 수신하여 참석자 raw 객체 배열로 변환
   */
  public static async parseExcelFile(filePath: string): Promise<Partial<AttendeeInput>[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('엑셀 파일에 시트가 존재하지 않습니다.');
    }

    const rawRows: Partial<AttendeeInput>[] = [];

    // 첫번째 행을 헤더로 인식하여 컬럼 인덱스 맵 생성
    const headerMap: { [key: string]: number } = {};
    const firstRow = worksheet.getRow(1);

    firstRow.eachCell((cell, colNumber) => {
      const headerName = (cell.value || '').toString().trim().replace(/\s+/g, '');
      if (headerName.includes('관리번호')) headerMap['managementNumber'] = colNumber;
      else if (headerName.includes('성명') || headerName.includes('이름')) headerMap['name'] = colNumber;
      else if (headerName.includes('소속')) headerMap['affiliation'] = colNumber;
      else if (headerName.includes('직함') || headerName.includes('직분')) headerMap['title'] = colNumber;
    });

    // 2번째 행부터 데이터 파싱
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // 헤더 제외

      const mgmtVal = headerMap['managementNumber'] ? row.getCell(headerMap['managementNumber']).value : '';
      const nameVal = headerMap['name'] ? row.getCell(headerMap['name']).value : '';
      const affVal = headerMap['affiliation'] ? row.getCell(headerMap['affiliation']).value : '';
      const titleVal = headerMap['title'] ? row.getCell(headerMap['title']).value : '';

      // 셀 객체 또는 일반 값 파싱
      const getCellValue = (val: any): string => {
        if (!val) return '';
        if (typeof val === 'object' && 'result' in val) return (val.result || '').toString();
        if (typeof val === 'object' && 'text' in val) return (val.text || '').toString();
        return val.toString();
      };

      rawRows.push({
        managementNumber: getCellValue(mgmtVal),
        name: getCellValue(nameVal),
        affiliation: getCellValue(affVal),
        title: getCellValue(titleVal),
      });
    });

    return rawRows;
  }
}
