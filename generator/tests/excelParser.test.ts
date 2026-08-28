import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { ExcelParser } from '../src/services/excelParser';

describe('ExcelParser 스마트 헤더 매핑 및 전체 시트 파싱 유닛 테스트 (v1.5)', () => {
  const tempExcelPath = path.join(__dirname, 'temp_multisheet_test.xlsx');
  const tempMissionExcelPath = path.join(__dirname, 'temp_mission_test.xlsx');
  const tempFooterExcelPath = path.join(__dirname, 'temp_footer_test.xlsx');

  afterAll(() => {
    if (fs.existsSync(tempExcelPath)) {
      fs.rmSync(tempExcelPath, { force: true });
    }
    if (fs.existsSync(tempMissionExcelPath)) {
      fs.rmSync(tempMissionExcelPath, { force: true });
    }
    if (fs.existsSync(tempFooterExcelPath)) {
      fs.rmSync(tempFooterExcelPath, { force: true });
    }
  });

  test('실제 SRS 엑셀 헤더 패턴(사모님동행, 사모님 성함, 사모님T셔츠사이즈 등)을 완벽하게 스마트 매핑한다', () => {
    const realHeaders = [
      '연번',
      '이사회명',
      '직책',
      '성명',
      '티셔츠사이즈',
      '사모님동행',
      '사모님 성함',
      '사모님T셔츠사이즈(M/L/XL/2XL/3XL)',
      '비고',
    ];

    const mapping = ExcelParser.suggestMapping(realHeaders);

    expect(mapping.affiliationCol).toBe('이사회명');
    expect(mapping.titleCol).toBe('직책');
    expect(mapping.nameCol).toBe('성명');
    expect(mapping.tshirtSizeCol).toBe('티셔츠사이즈');
    expect(mapping.spouseNameCol).toBe('사모님 성함');
    expect(mapping.spouseTshirtSizeCol).toBe('사모님T셔츠사이즈(M/L/XL/2XL/3XL)');
    expect(mapping.spouseAccompanyCol).toBe('사모님동행');
  });

  test('다중 시트(Multi-sheet) 엑셀 파일의 모든 시트를 순회하여 명단을 통합 추출한다', async () => {
    const workbook = new ExcelJS.Workbook();

    // Sheet 1: 서울 지역
    const sheet1 = workbook.addWorksheet('서울지역');
    sheet1.addRow(['이사회명', '직책', '성명', '티셔츠사이즈', '사모님 성함', '사모님T셔츠사이즈(M/L/XL/2XL/3XL)', '사모님동행']);
    sheet1.addRow(['서울동대문후원이사회', '회장', '홍길동', '105', '김영희', '95', '동행']);
    sheet1.addRow(['서울서대문후원이사회', '총무', '김철수', '100', '', '', '']);

    // Sheet 2: 경기 지역
    const sheet2 = workbook.addWorksheet('경기지역');
    sheet2.addRow(['이사회명', '직책', '성명', '티셔츠사이즈']);
    sheet2.addRow(['고양후원이사회', '이사', '이순신', '100']);
    sheet2.addRow(['파주후원이사회', '회장', '강감찬', '105']);

    await workbook.xlsx.writeFile(tempExcelPath);

    // 1. 전체 헤더 및 샘플 수집 검증
    const headerInfo = await ExcelParser.getHeadersAndSamples(tempExcelPath);
    expect(headerInfo.headers).toContain('이사회명');
    expect(headerInfo.headers).toContain('직책');
    expect(headerInfo.headers).toContain('성명');
    expect(headerInfo.headers).toContain('사모님 성함');

    // 2. 전체 시트 파싱 검증 (총 4명 본인 + 1명 사모 = 5명)
    const rawRows = await ExcelParser.parseWithMapping(tempExcelPath, headerInfo.suggestedMapping);
    expect(rawRows).toHaveLength(5);

    expect(rawRows[0].name).toBe('홍길동');
    expect(rawRows[0].affiliation).toBe('서울동대문후원이사회');
    expect(rawRows[0].isSpouse).toBe(false);

    expect(rawRows[1].name).toBe('김영희');
    expect(rawRows[1].title).toBe('사모');
    expect(rawRows[1].isSpouse).toBe(true);

    expect(rawRows[2].name).toBe('김철수');
    expect(rawRows[3].name).toBe('이순신');
    expect(rawRows[3].affiliation).toBe('고양후원이사회');
    expect(rawRows[4].name).toBe('강감찬');
  });

  test('미션1팀, 미션2팀 등 탭 이름이 이사회명에 절대 들어가지 않고 각 탭별 Header를 독립 인식하여 셀의 실제 이사회명을 파싱한다', async () => {
    const workbook = new ExcelJS.Workbook();

    // Sheet 1: 미션1팀 (헤더: 이사회명, 직책, 성명)
    const sheet1 = workbook.addWorksheet('미션1팀');
    sheet1.addRow(['이사회명', '직책', '성명']);
    sheet1.addRow(['서울동대문후원이사회', '회장', '홍길동']);

    // Sheet 2: 미션2팀 (헤더: 소속, 직함, 성명)
    const sheet2 = workbook.addWorksheet('미션2팀');
    sheet2.addRow(['소속', '직함', '성명']);
    sheet2.addRow(['광주후원이사회', '이사', '정현택']);

    await workbook.xlsx.writeFile(tempMissionExcelPath);

    const headerInfo = await ExcelParser.getHeadersAndSamples(tempMissionExcelPath);
    const rawRows = await ExcelParser.parseWithMapping(tempMissionExcelPath, headerInfo.suggestedMapping);

    expect(rawRows).toHaveLength(2);

    // 1번 참석자 검증
    expect(rawRows[0].name).toBe('홍길동');
    expect(rawRows[0].affiliation).toBe('서울동대문후원이사회');
    expect(rawRows[0].affiliation).not.toBe('미션1팀');
    expect(rawRows[0].sheetName).toBe('미션1팀');

    // 2번 참석자 검증
    expect(rawRows[1].name).toBe('정현택');
    expect(rawRows[1].affiliation).toBe('광주후원이사회');
    expect(rawRows[1].affiliation).not.toBe('미션2팀');
    expect(rawRows[1].sheetName).toBe('미션2팀');
  });

  test('비정형 1행 날짜/타임스탬프는 헤더에서 제외되고, 하단 푸터 연락처/문의처 행은 참석자로 오인되지 않는다', async () => {
    const workbook = new ExcelJS.Workbook();

    // Sheet 1: 참석자 명단 + 하단 푸터(간사 및 문의처)
    const sheet1 = workbook.addWorksheet('서울지역');
    sheet1.addRow(['이사회명', '직책', '성명', '전화번호']);
    sheet1.addRow(['서울동대문후원이사회', '회장', '홍길동', '010-1111-2222']);
    sheet1.addRow(['서울서대문후원이사회', '총무', '김철수', '010-3333-4444']);
    // 하단 푸터 행들 (이사회명 없음)
    sheet1.addRow(['', '담당간사', '이태성', '010-9999-8888']);
    sheet1.addRow(['', '담당간사', '주희연', '010-7777-6666']);
    sheet1.addRow(['', '', '교회협력문의', '02-1234-5678']);

    // Sheet 2: 헤더가 날짜/타임스탬프로 시작하는 데이터 시트
    const sheet2 = workbook.addWorksheet('로그');
    sheet2.addRow(['Thu Jun 25 2026 23:53:55 GMT+0900 (한국 표준시)', '010-1234-1234']);

    await workbook.xlsx.writeFile(tempFooterExcelPath);

    // 1. 헤더 추출 검증 (날짜, 전화번호 등 배제)
    const headerInfo = await ExcelParser.getHeadersAndSamples(tempFooterExcelPath);
    expect(headerInfo.headers).toContain('이사회명');
    expect(headerInfo.headers).toContain('직책');
    expect(headerInfo.headers).toContain('성명');
    expect(headerInfo.headers).not.toContain('Thu Jun 25 2026 23:53:55 GMT+0900 (한국 표준시)');
    expect(headerInfo.headers).not.toContain('010-1234-1234');

    // 2. 파싱 검증 (푸터 이태성, 주희연, 교회협력문의 제외되어 순수 참석자 2명만 파싱됨)
    const rawRows = await ExcelParser.parseWithMapping(tempFooterExcelPath, headerInfo.suggestedMapping);
    expect(rawRows).toHaveLength(2);
    expect(rawRows[0].name).toBe('홍길동');
    expect(rawRows[1].name).toBe('김철수');
  });

  test('헤더가 RichText 객체 또는 줄바꿈(직함(이사회_회장...))인 경우 [object Object]가 아니라 정상 텍스트로 인식되고 직책 열로 스마트 매핑된다', async () => {
    const tempRichTextExcel = path.join(__dirname, 'temp_richtext_test.xlsx');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('참석자');

    const row1 = sheet.getRow(1);
    row1.getCell(1).value = '이사회명';
    // RichText 형태의 헤더 셀 구성
    row1.getCell(2).value = {
      richText: [
        { font: { bold: true }, text: '직함' },
        { font: { size: 9 }, text: '\n(이사회_회장, 부회장, 총무, 이사)' },
      ],
    };
    row1.getCell(3).value = '성명';
    row1.commit();

    sheet.addRow(['서울동대문후원이사회', '회장', '홍길동']);
    await workbook.xlsx.writeFile(tempRichTextExcel);

    try {
      const headerInfo = await ExcelParser.getHeadersAndSamples(tempRichTextExcel);
      
      // [object Object]가 아닌 정제된 텍스트로 추출되는지 확인
      expect(headerInfo.headers).not.toContain('[object Object]');
      expect(headerInfo.headers).toContain('직함 (이사회_회장, 부회장, 총무, 이사)');
      
      // 직책 매핑으로 자동 인식되는지 확인
      expect(headerInfo.suggestedMapping.titleCol).toBe('직함 (이사회_회장, 부회장, 총무, 이사)');
      
      const parsed = await ExcelParser.parseWithMapping(tempRichTextExcel, headerInfo.suggestedMapping);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].title).toBe('회장');
      expect(parsed[0].name).toBe('홍길동');
    } finally {
      if (fs.existsSync(tempRichTextExcel)) {
        fs.rmSync(tempRichTextExcel, { force: true });
      }
    }
  });

  test('직책(title)에 숫자나 숫자텍스트가 들어간 데이터 및 테스트 쓰레기값(test, 1234 등)은 참석자에서 제외된다', async () => {
    const tempFilterExcel = path.join(__dirname, 'temp_filter_test.xlsx');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('참석자');

    sheet.addRow(['이사회명', '직책', '성명', '티셔츠사이즈']);
    // 정상 데이터
    sheet.addRow(['서울서대문후원이사회', '회장', '홍길동', '105']);
    sheet.addRow(['서울서대문후원이사회', '이사', '김철수', '100']);
    
    // 쓰레기 / 테스트 데이터 (직책에 숫자 포함)
    sheet.addRow(['서울서대문후원이사회', '1', '테스트유저1', '100']);
    sheet.addRow(['서울서대문후원이사회', '100', '테스트유저2', '100']);
    sheet.addRow(['서울서대문후원이사회', '010-1234-5678', '테스트유저3', '100']);
    sheet.addRow(['서울서대문후원이사회', '1조', '테스트유저4', '100']);
    
    // 쓰레기 / 테스트 데이터 (성명이나 소속에 test / 기호 / 공백만 존재)
    sheet.addRow(['서울서대문후원이사회', '이사', 'test', '100']);
    sheet.addRow(['서울서대문후원이사회', '이사', '테스트', '100']);
    sheet.addRow(['서울서대문후원이사회', '이사', '---', '100']);
    sheet.addRow(['   ', '이사', '박영수', '100']);

    await workbook.xlsx.writeFile(tempFilterExcel);

    try {
      const headerInfo = await ExcelParser.getHeadersAndSamples(tempFilterExcel);
      const parsed = await ExcelParser.parseWithMapping(tempFilterExcel, headerInfo.suggestedMapping);
      
      // 순수 정상 데이터 2명(홍길동, 김철수)만 통과해야 함
      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('홍길동');
      expect(parsed[1].name).toBe('김철수');
    } finally {
      if (fs.existsSync(tempFilterExcel)) {
        fs.rmSync(tempFilterExcel, { force: true });
      }
    }
  });
});
