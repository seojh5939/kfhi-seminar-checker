import { ExcelValidator } from '../src/services/excelValidator';
import { AttendeeInput } from 'shared';

describe('ExcelValidator 유닛 테스트', () => {
  test('올바른 참석자 데이터를 정상적으로 검증한다', () => {
    const rawRows: Partial<AttendeeInput>[] = [
      { managementNumber: '00001', name: '홍길동', affiliation: '고양후원이사회', title: '목사' },
      { managementNumber: '00002', name: '김철수', affiliation: '파주후원이사회', title: '장로' },
    ];

    const result = ExcelValidator.validate(rawRows);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.attendees).toHaveLength(2);
  });

  test('관리번호 자릿수(5자리 미만) 오류 및 중복 오류를 포착한다', () => {
    const rawRows: Partial<AttendeeInput>[] = [
      { managementNumber: '123', name: '홍길동', affiliation: '고양후원이사회', title: '목사' },
      { managementNumber: '00001', name: '김철수', affiliation: '파주후원이사회', title: '장로' },
      { managementNumber: '00001', name: '이영희', affiliation: '파주후원이사회', title: '권사' }, // 중복
    ];

    const result = ExcelValidator.validate(rawRows);
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors[0].reason).toContain('5자리 숫자여야 합니다');
    expect(result.errors[1].reason).toContain('중복되었습니다');
  });

  test('필수 항목(성명/소속/직함) 누락을 감지한다', () => {
    const rawRows: Partial<AttendeeInput>[] = [
      { managementNumber: '00001', name: '', affiliation: '고양후원이사회', title: '목사' },
      { managementNumber: '00002', name: '김철수', affiliation: '', title: '장로' },
    ];

    const result = ExcelValidator.validate(rawRows);
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});
