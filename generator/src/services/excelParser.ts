import ExcelJS from 'exceljs';
import * as fs from 'fs';
import { AttendeeInput, ColumnMapping, ExcelHeaderInfo } from 'shared';

export class ExcelParser {
  /**
   * 엑셀 파일(.xlsx)을 로드하여 전체 헤더 목록, 샘플 데이터, 스마트 추천 매핑을 추출
   */
  public static async getHeadersAndSamples(filePath: string): Promise<ExcelHeaderInfo> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`엑셀 파일을 찾을 수 없습니다: ${filePath}`);
    }
    const fileBuffer = fs.readFileSync(filePath);
    const ExcelJSLib: any = ExcelJS.Workbook ? ExcelJS : (ExcelJS as any).default || ExcelJS;
    const workbook = new ExcelJSLib.Workbook();
    await workbook.xlsx.load(fileBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('엑셀 파일에 시트가 존재하지 않습니다.');
    }

    const firstRow = worksheet.getRow(1);
    const headers: string[] = [];
    const colIndexMap: Record<number, string> = {};

    firstRow.eachCell((cell: any, colNumber: number) => {
      const headerVal = (cell.value || '').toString().trim();
      if (headerVal) {
        headers.push(headerVal);
        colIndexMap[colNumber] = headerVal;
      }
    });

    if (headers.length === 0) {
      throw new Error('엑셀 1행에서 헤더를 찾을 수 없습니다.');
    }

    // 상위 3~5행 샘플 데이터 추출
    const sampleRows: Record<string, string>[] = [];
    worksheet.eachRow((row: any, rowNumber: number) => {
      if (rowNumber === 1 || sampleRows.length >= 5) return;
      const rowData: Record<string, string> = {};
      let hasValue = false;

      for (const [colNumStr, headerName] of Object.entries(colIndexMap)) {
        const colNum = Number(colNumStr);
        const cell = row.getCell(colNum);
        const cellVal = this.getCellValueString(cell.value);
        rowData[headerName] = cellVal;
        if (cellVal.trim()) hasValue = true;
      }

      if (hasValue) {
        sampleRows.push(rowData);
      }
    });

    // 스마트 추천 매핑 계산
    const suggestedMapping = this.suggestMapping(headers);

    return {
      headers,
      sampleRows,
      suggestedMapping,
    };
  }

  /**
   * 지정된 ColumnMapping 정보를 기반으로 엑셀 데이터를 파싱하여 참석자 목록(본인 + 사모님 분리) 생성
   */
  public static async parseWithMapping(
    filePath: string,
    mapping: ColumnMapping
  ): Promise<Partial<AttendeeInput>[]> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`엑셀 파일을 찾을 수 없습니다: ${filePath}`);
    }
    const fileBuffer = fs.readFileSync(filePath);
    const ExcelJSLib: any = ExcelJS.Workbook ? ExcelJS : (ExcelJS as any).default || ExcelJS;
    const workbook = new ExcelJSLib.Workbook();
    await workbook.xlsx.load(fileBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('엑셀 파일에 시트가 존재하지 않습니다.');
    }

    // 1행에서 헤더명 -> 컬럼 인덱스 맵 생성
    const headerToColIndex: Record<string, number> = {};
    const firstRow = worksheet.getRow(1);
    firstRow.eachCell((cell: any, colNumber: number) => {
      const headerVal = (cell.value || '').toString().trim();
      if (headerVal) {
        headerToColIndex[headerVal] = colNumber;
      }
    });

    const getVal = (row: any, headerName?: string): string => {
      if (!headerName || !headerToColIndex[headerName]) return '';
      const cellVal = row.getCell(headerToColIndex[headerName]).value;
      return this.getCellValueString(cellVal).trim();
    };

    const rawRows: Partial<AttendeeInput>[] = [];

    worksheet.eachRow((row: any, rowNumber: number) => {
      if (rowNumber === 1) return; // 헤더 행 건너뜀

      const affiliation = getVal(row, mapping.affiliationCol);
      const title = getVal(row, mapping.titleCol);
      const name = getVal(row, mapping.nameCol);
      const tshirtSize = getVal(row, mapping.tshirtSizeCol);

      // 전체 행이 비어있는 경우 스킵
      if (!affiliation && !title && !name) {
        return;
      }

      // 1. 본인 레코드 추가
      rawRows.push({
        affiliation,
        title,
        name,
        tshirtSize,
        isSpouse: false,
      });

      // 2. 사모님 성함 확인 및 사모님 레코드 조건부 추가
      const spouseName = getVal(row, mapping.spouseNameCol);
      const spouseTshirt = getVal(row, mapping.spouseTshirtSizeCol);
      const spouseAccompany = getVal(row, mapping.spouseAccompanyCol);

      // 사모님 동행 불참 체크 (X, 불참, N, 미동행 등)
      const isNotAccompanying =
        spouseAccompany &&
        /^(불참|미동행|n|x|아니오|미참석)$/i.test(spouseAccompany.trim());

      // 사모님 성함이 존재하고 불참 표시가 아닌 경우 사모님 레코드 생성
      if (spouseName && !isNotAccompanying) {
        // 호칭 정제 (성함 뒤 "사모", "사모님" 등이 붙은 경우 정제 처리)
        const cleanedSpouseName = spouseName
          .replace(/\s*(사모님|사모)\s*$/g, '')
          .replace(/^\s*(사모님|사모)\s*/g, '')
          .trim() || spouseName;

        rawRows.push({
          affiliation,
          title: '사모',
          name: cleanedSpouseName,
          tshirtSize: spouseTshirt,
          isSpouse: true,
        });
      }
    });

    return rawRows;
  }

  /**
   * 헤더 목록에서 키워드 정규식을 기반으로 가장 적합한 열을 스마트 매칭
   */
  public static suggestMapping(headers: string[]): ColumnMapping {
    const normalize = (h: string) => h.replace(/\s+/g, '').toLowerCase();

    const findMatch = (pattern: RegExp, excludePattern?: RegExp): string => {
      for (const h of headers) {
        const norm = normalize(h);
        if (excludePattern && excludePattern.test(norm)) continue;
        if (pattern.test(norm)) return h;
      }
      return '';
    };

    // 1. 사모님 관련 컬럼
    const spouseAccompanyCol = findMatch(/사모.*(동행|참석|동반|여부)/);
    const spouseTshirtSizeCol = findMatch(/사모.*(티셔츠|t셔츠|상의|사이즈|size)/i);
    const spouseNameCol =
      findMatch(/사모.*(성명|이름|성함)/, /동행|참석|여부|티셔츠|t셔츠|상의|사이즈|size/i) ||
      findMatch(/^사모님?$/);

    // 2. 본인 컬럼 (사모님 키워드 제외)
    const spouseExclude = /사모/;
    const affiliationCol = findMatch(/이사회|소속|지부|지회|지단/, spouseExclude) || headers[0] || '';
    const titleCol = findMatch(/직책|직함|직분|구분/, spouseExclude) || (headers.length > 1 ? headers[1] : '');
    const nameCol = findMatch(/성명|이름|성함|참석자|회원명/, spouseExclude) || (headers.length > 2 ? headers[2] : '');
    const tshirtSizeCol = findMatch(/티셔츠|t셔츠|상의|사이즈|size/i, spouseExclude);

    return {
      affiliationCol,
      titleCol,
      nameCol,
      tshirtSizeCol,
      spouseNameCol,
      spouseTshirtSizeCol,
      spouseAccompanyCol,
    };
  }

  /**
   * 셀 객체 또는 일반 값을 안전하게 문자열로 변환
   */
  private static getCellValueString(val: any): string {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') {
      if ('result' in val && val.result !== undefined && val.result !== null) {
        return val.result.toString();
      }
      if ('text' in val && val.text !== undefined && val.text !== null) {
        return val.text.toString();
      }
      if ('richText' in val && Array.isArray(val.richText)) {
        return val.richText.map((rt: any) => rt.text || '').join('');
      }
    }
    return val.toString();
  }
}
