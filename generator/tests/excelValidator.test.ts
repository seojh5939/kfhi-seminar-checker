import { ExcelValidator } from '../src/services/excelValidator';
import { AttendeeInput } from 'shared';

describe('ExcelValidator 유닛 테스트 (v1.1)', () => {
  test('올바른 참석자 및 사모님 데이터를 정상적으로 검증한다', () => {
    const rawRows: Partial<AttendeeInput>[] = [
      { name: '홍길동', affiliation: '고양후원이사회', title: '목사', tshirtSize: '105', isSpouse: false },
      { name: '김영희', affiliation: '고양후원이사회', title: '사모', tshirtSize: '95', isSpouse: true },
      { name: '김철수', affiliation: '파주후원이사회', title: '장로', tshirtSize: '100', isSpouse: false },
    ];

    const result = ExcelValidator.validate(rawRows);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.attendees).toHaveLength(3);
  });

  test('필수 항목(성명/소속/직함) 누락을 감지한다', () => {
    const rawRows: Partial<AttendeeInput>[] = [
      { name: '', affiliation: '고양후원이사회', title: '목사' },
      { name: '김철수', affiliation: '', title: '장로' },
      { name: '이순신', affiliation: '서울후원이사회', title: '' },
    ];

    const result = ExcelValidator.validate(rawRows);
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(3);
  });
});
