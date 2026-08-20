import { ExcelParser } from '../src/services/excelParser';

describe('ExcelParser 스마트 헤더 매핑 유닛 테스트 (v1.1)', () => {
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

  test('변형된 헤더 명칭(소속, 직분, 이름, 상의사이즈, 사모님이름 등)도 유연하게 감지한다', () => {
    const variantHeaders = [
      '소속 지회',
      '직분',
      '참석자 이름',
      '상의 사이즈',
      '사모님 이름',
      '사모님 사이즈',
    ];

    const mapping = ExcelParser.suggestMapping(variantHeaders);

    expect(mapping.affiliationCol).toBe('소속 지회');
    expect(mapping.titleCol).toBe('직분');
    expect(mapping.nameCol).toBe('참석자 이름');
    expect(mapping.tshirtSizeCol).toBe('상의 사이즈');
    expect(mapping.spouseNameCol).toBe('사모님 이름');
    expect(mapping.spouseTshirtSizeCol).toBe('사모님 사이즈');
  });
});
