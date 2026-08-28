import ExcelJS from 'exceljs';
import * as fs from 'fs';
import { AttendeeInput, ColumnMapping, ExcelHeaderInfo } from 'shared';

export class ExcelParser {
  /**
   * 엑셀 파일(.xlsx)을 로드하여 유효한 시트들의 통합 헤더 목록, 샘플 데이터, 스마트 추천 매핑을 추출
   */
  public static async getHeadersAndSamples(filePath: string): Promise<ExcelHeaderInfo> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`엑셀 파일을 찾을 수 없습니다: ${filePath}`);
    }
    const fileBuffer = fs.readFileSync(filePath);
    const ExcelJSLib: any = ExcelJS.Workbook ? ExcelJS : (ExcelJS as any).default || ExcelJS;
    const workbook = new ExcelJSLib.Workbook();
    await workbook.xlsx.load(fileBuffer);

    if (!workbook.worksheets || workbook.worksheets.length === 0) {
      throw new Error('엑셀 파일에 시트가 존재하지 않습니다.');
    }

    const headerSet = new Set<string>();
    const headers: string[] = [];
    const sampleRows: Record<string, string>[] = [];

    // 비정상적인 헤더(날짜 객체, 타임스탬프 문자열, 전화번호, 과도하게 긴 텍스트 등) 필터링 함수
    const isValidHeaderName = (val: string): boolean => {
      if (!val) return false;
      const trimmed = val.trim();
      if (!trimmed || trimmed.length > 60) return false;
      // [object Object] 방어
      if (/^\[object\s+Object\]$/i.test(trimmed) || trimmed.toLowerCase() === 'object') return false;
      // 날짜/시간 포맷 제외 (GMT, 한국 표준시, ISO 날짜 등)
      if (/GMT|[가-힣]+\s*표준시|\d{4}-\d{2}-\d{2}T/i.test(trimmed)) return false;
      // 전화번호 제외
      if (/^01[016789]-?\d{3,4}-?\d{4}$/.test(trimmed)) return false;
      return true;
    };

    // 전체 시트를 순회하여 고유 헤더 및 샘플 데이터 수집
    for (const worksheet of workbook.worksheets) {
      if (!worksheet || worksheet.rowCount === 0) continue;

      const firstRow = worksheet.getRow(1);
      const sheetColIndexMap: Record<number, string> = {};

      firstRow.eachCell((cell: any, colNumber: number) => {
        const rawHeaderVal = this.getCellValueString(cell.value);
        const headerVal = this.cleanHeaderString(rawHeaderVal);
        if (headerVal && isValidHeaderName(headerVal)) {
          sheetColIndexMap[colNumber] = headerVal;
          if (!headerSet.has(headerVal)) {
            headerSet.add(headerVal);
            headers.push(headerVal);
          }
        }
      });

      // 시트별 상위 데이터 샘플 추출 (전체 누적 최대 5행)
      worksheet.eachRow((row: any, rowNumber: number) => {
        if (rowNumber === 1 || sampleRows.length >= 5) return;
        const rowData: Record<string, string> = {};
        let hasValue = false;

        for (const [colNumStr, headerName] of Object.entries(sheetColIndexMap)) {
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
    }

    if (headers.length === 0) {
      throw new Error('엑셀 파일의 시트들에서 유효한 헤더를 찾을 수 없습니다.');
    }

    // 스마트 추천 매핑 계산
    const suggestedMapping = this.suggestMapping(headers);

    return {
      headers,
      sampleRows,
      suggestedMapping,
    };
  }

  /**
   * 지정된 ColumnMapping 정보를 기반으로 전체 시트의 엑셀 데이터를 파싱하여 참석자 목록(본인 + 사모님 분리) 통합 생성
   * - 각 시트의 1행 Header를 개별적으로 독립 분석
   * - 이사회명(소속) 및 성명이 모두 유효한 행만 참석자로 파싱 (하단 푸터/간사 연락처/안내문구/숫자직책/쓰레기값 자동 제외)
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

    if (!workbook.worksheets || workbook.worksheets.length === 0) {
      throw new Error('엑셀 파일에 시트가 존재하지 않습니다.');
    }

    const rawRows: Partial<AttendeeInput>[] = [];

    // 하단 푸터 / 안내문구 / 문의처 필터링 정규식
    const isIgnoredFooterText = (text: string): boolean => {
      const normalized = (text || '').trim();
      if (!normalized) return true;
      return /^(교회협력문의|문의|담당간사|간사|안내|총계|합계|소계|비고|연락처|참석자\s*명단|명단)$/i.test(normalized) ||
             /^(문의처|문의사항|전화번호|담당자)/i.test(normalized) ||
             /^01[016789]-?\d{3,4}-?\d{4}$/.test(normalized) ||
             /^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(normalized);
    };

    // 유효하지 않은 쓰레기 참석자 데이터(테스트값, 특수문자만 있는 셀, 공백 등) 필터링 함수
    const isInvalidOrDummyText = (text: string): boolean => {
      const normalized = (text || '')
        .replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ')
        .trim();
      if (!normalized) return true;
      // 일반적인 테스트/더미 입력 키워드 필터링
      if (/^(test|테스트|sample|샘플|asdf|qwerty|temp|임시|aaa|1234|abc)$/i.test(normalized)) {
        return true;
      }
      // null, undefined, none, nan 등
      if (/^(none|null|undefined|nan)$/i.test(normalized)) {
        return true;
      }
      // 숫자, 특수문자, 기호만으로 구성된 이름/소속 제외 (예: "-", "...", "0", "1", "???")
      if (/^[\d\s!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`·]+$/.test(normalized)) {
        return true;
      }
      return false;
    };

    // 직책(title)에 숫자나 숫자텍스트가 들어간 경우 필터링 함수
    const hasNumericInTitle = (titleText: string): boolean => {
      const normalized = (titleText || '').trim();
      if (!normalized) return false;
      // 직책에 숫자가 포함되어 있거나 숫자 형태인 경우 제외 (예: 1, 2, 100, 1번, 010-1234 등)
      return /\d/.test(normalized);
    };

    // 전체 시트 순회 파싱
    for (const worksheet of workbook.worksheets) {
      if (!worksheet || worksheet.rowCount === 0) continue;

      // 1. 해당 시트의 1행에서 헤더 목록 및 컬럼 인덱스 맵 생성
      const sheetHeaders: string[] = [];
      const sheetHeaderToCol: Record<string, number> = {};
      const firstRow = worksheet.getRow(1);

      firstRow.eachCell((cell: any, colNumber: number) => {
        const rawHeaderVal = this.getCellValueString(cell.value);
        const headerVal = this.cleanHeaderString(rawHeaderVal);
        if (headerVal) {
          sheetHeaders.push(headerVal);
          sheetHeaderToCol[headerVal] = colNumber;
        }
      });

      if (sheetHeaders.length === 0) {
        continue;
      }

      // 2. 해당 시트 자체의 스마트 매핑 계산
      const sheetMapping = this.suggestMapping(sheetHeaders);

      // 사용자가 지정한 글로벌 매핑 열이 해당 시트에 존재하면 우선 사용, 없으면 시트별 스마트 매핑 적용
      const affCol =
        mapping.affiliationCol && sheetHeaderToCol[mapping.affiliationCol]
          ? mapping.affiliationCol
          : sheetMapping.affiliationCol;

      const titleCol =
        mapping.titleCol && sheetHeaderToCol[mapping.titleCol]
          ? mapping.titleCol
          : sheetMapping.titleCol;

      const nameCol =
        mapping.nameCol && sheetHeaderToCol[mapping.nameCol]
          ? mapping.nameCol
          : sheetMapping.nameCol;

      const tshirtCol =
        mapping.tshirtSizeCol && sheetHeaderToCol[mapping.tshirtSizeCol]
          ? mapping.tshirtSizeCol
          : sheetMapping.tshirtSizeCol;

      const spouseNameCol =
        mapping.spouseNameCol && sheetHeaderToCol[mapping.spouseNameCol]
          ? mapping.spouseNameCol
          : sheetMapping.spouseNameCol;

      const spouseTshirtCol =
        mapping.spouseTshirtSizeCol && sheetHeaderToCol[mapping.spouseTshirtSizeCol]
          ? mapping.spouseTshirtSizeCol
          : sheetMapping.spouseTshirtSizeCol;

      const spouseAccompanyCol =
        mapping.spouseAccompanyCol && sheetHeaderToCol[mapping.spouseAccompanyCol]
          ? mapping.spouseAccompanyCol
          : sheetMapping.spouseAccompanyCol;

      // 성명이나 소속 열이 전혀 매핑되지 않는 시트(안내문/표지 등)는 스킵
      if (!sheetHeaderToCol[nameCol] && !sheetHeaderToCol[affCol]) {
        continue;
      }

      const getVal = (row: any, headerName?: string): string => {
        if (!headerName || !sheetHeaderToCol[headerName]) return '';
        const cellVal = row.getCell(sheetHeaderToCol[headerName]).value;
        return this.getCellValueString(cellVal).trim();
      };

      const sheetTabName = worksheet.name.trim();

      // 3. 데이터 행 순회
      worksheet.eachRow((row: any, rowNumber: number) => {
        if (rowNumber === 1) return; // 헤더 행 건너뜀

        // ⚠️ 이사회명(소속)과 성명은 오직 실제 데이터 셀에서만 가져옴
        const affiliation = getVal(row, affCol);
        const title = getVal(row, titleCol);
        const name = getVal(row, nameCol);
        const tshirtSize = getVal(row, tshirtCol);

        // [핵심 필터링]
        // 1) 전체 행이 비어있으면 스킵
        // 2) 이사회명(소속) 또는 성명이 없으면 스킵
        // 3) 직책에 숫자나 숫자텍스트가 들어간 경우 스킵 (쓰레기/테스트 데이터 배제)
        // 4) 쓰레기/더미 텍스트(test, sample, 특수문자만 있는 셀 등) 스킵
        // 5) 성명/소속이 문의/푸터 문구인 경우 스킵
        if (!affiliation || !name) {
          return;
        }
        if (hasNumericInTitle(title)) {
          return;
        }
        if (isInvalidOrDummyText(affiliation) || isInvalidOrDummyText(name)) {
          return;
        }
        if (isIgnoredFooterText(name) || isIgnoredFooterText(affiliation)) {
          return;
        }

        // 1. 본인 레코드 추가
        rawRows.push({
          affiliation,
          title: title || '이사',
          name,
          tshirtSize,
          isSpouse: false,
          sheetName: sheetTabName,
        });

        // 2. 사모님 성함 확인 및 사모님 레코드 조건부 추가
        const spouseName = getVal(row, spouseNameCol);
        const spouseTshirt = getVal(row, spouseTshirtCol);
        const spouseAccompany = getVal(row, spouseAccompanyCol);

        // 사모님 동행 불참 체크 (X, 불참, N, 미동행 등)
        const isNotAccompanying =
          spouseAccompany &&
          /^(불참|미동행|n|x|아니오|미참석)$/i.test(spouseAccompany.trim());

        // 사모님 성함이 존재하고 불참 표시가 아니며 유효한 텍스트인 경우 사모님 레코드 생성
        if (
          spouseName &&
          !isNotAccompanying &&
          !isIgnoredFooterText(spouseName) &&
          !isInvalidOrDummyText(spouseName)
        ) {
          // 호칭 정제 (성함 뒤 "사모", "사모님" 등이 붙은 경우 정제 처리)
          const cleanedSpouseName = spouseName
            .replace(/\s*(사모님|사모)\s*$/g, '')
            .replace(/^\s*(사모님|사모)\s*/g, '')
            .trim() || spouseName;

          if (!isInvalidOrDummyText(cleanedSpouseName)) {
            rawRows.push({
              affiliation,
              title: '사모',
              name: cleanedSpouseName,
              tshirtSize: spouseTshirt,
              isSpouse: true,
              sheetName: sheetTabName,
            });
          }
        }
      });
    }

    return rawRows;
  }

  /**
   * 헤더 문자열 내 줄바꿈 및 다중 공백을 정제
   */
  public static cleanHeaderString(val: string): string {
    if (!val) return '';
    return val
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 헤더 목록에서 키워드 정규식을 기반으로 가장 적합한 열을 스마트 매칭
   */
  public static suggestMapping(headers: string[]): ColumnMapping {
    const normalize = (h: string) => h.replace(/[\s_()（）\-_/]+/g, '').toLowerCase();

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

    // 2. 본인 컬럼 (사모님 및 담당간사/스태프 키워드 제외)
    const spouseExclude = /사모|간사|담당|스태프|직원|문의/;
    const affiliationCol = findMatch(/이사회|소속|지부|지회|지단/, spouseExclude) || headers[0] || '';
    const titleCol = findMatch(/직책|직함|직분|구분/, spouseExclude) || (headers.length > 1 ? headers[1] : '');
    const nameCol = findMatch(/^(성명|이름|성함|참석자|회원명)$/, spouseExclude) || findMatch(/성명|이름|성함|참석자|회원명/, spouseExclude) || (headers.length > 2 ? headers[2] : '');
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
   * 셀 객체 또는 일반 값을 안전하게 문자열로 변환 (RichText, Formula, Hyperlink, Date 등 지원)
   */
  public static getCellValueString(val: any): string {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return val.toString();
    if (val instanceof Date) return val.toISOString();
    if (typeof val === 'object') {
      if (Array.isArray(val.richText)) {
        return val.richText
          .map((rt: any) => {
            if (!rt) return '';
            if (typeof rt === 'string') return rt;
            if (typeof rt === 'object' && rt.text !== undefined && rt.text !== null) {
              return rt.text.toString();
            }
            return '';
          })
          .join('');
      }
      if ('result' in val && val.result !== undefined && val.result !== null) {
        if (typeof val.result === 'object') {
          return this.getCellValueString(val.result);
        }
        return val.result.toString();
      }
      if ('text' in val && val.text !== undefined && val.text !== null) {
        if (typeof val.text === 'object') {
          return this.getCellValueString(val.text);
        }
        return val.text.toString();
      }
      if ('error' in val) {
        return '';
      }
      if (typeof val.toString === 'function') {
        const str = val.toString();
        if (str && str !== '[object Object]') return str;
      }
      return '';
    }
    return String(val);
  }
}
