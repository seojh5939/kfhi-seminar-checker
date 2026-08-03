import { AttendeeInput, ValidationErrorItem, MANAGEMENT_NUMBER_REGEX, ALLOWED_TITLES } from 'shared';

export interface ValidationResult {
  isValid: boolean;
  attendees: AttendeeInput[];
  errors: ValidationErrorItem[];
}

/**
 * Excel 참석자 명단 입력값 검증 전담 서비스 (SOLID & KISS)
 */
export class ExcelValidator {
  /**
   * Raw 참석자 데이터 배열을 검증하고 유효한 데이터 및 오류 목록을 반환
   */
  public static validate(rawRows: Partial<AttendeeInput>[]): ValidationResult {
    const attendees: AttendeeInput[] = [];
    const errors: ValidationErrorItem[] = [];
    const seenIds = new Set<string>();

    rawRows.forEach((row, index) => {
      const rowNumber = index + 2; // 엑셀 헤더 제외 2행부터 시작
      const mgmtNum = (row.managementNumber || '').toString().trim();
      const name = (row.name || '').toString().trim();
      const affiliation = (row.affiliation || '').toString().trim();
      const title = (row.title || '').toString().trim();

      let hasError = false;

      // 1. 관리번호 검증 (5자리 숫자)
      if (!mgmtNum) {
        errors.push({
          rowNumber,
          managementNumber: mgmtNum,
          name,
          reason: '관리번호가 누락되었습니다.',
        });
        hasError = true;
      } else if (!MANAGEMENT_NUMBER_REGEX.test(mgmtNum)) {
        errors.push({
          rowNumber,
          managementNumber: mgmtNum,
          name,
          reason: `관리번호는 5자리 숫자여야 합니다. (입력값: ${mgmtNum})`,
        });
        hasError = true;
      } else if (seenIds.has(mgmtNum)) {
        errors.push({
          rowNumber,
          managementNumber: mgmtNum,
          name,
          reason: `관리번호가 중복되었습니다. (${mgmtNum})`,
        });
        hasError = true;
      }

      // 2. 성명 검증
      if (!name) {
        errors.push({
          rowNumber,
          managementNumber: mgmtNum,
          name,
          reason: '성명이 누락되었습니다.',
        });
        hasError = true;
      }

      // 3. 소속 검증 (공란 불허)
      if (!affiliation) {
        errors.push({
          rowNumber,
          managementNumber: mgmtNum,
          name,
          reason: '소속이 누락되었습니다.',
        });
        hasError = true;
      }

      // 4. 직함 검증
      if (!title) {
        errors.push({
          rowNumber,
          managementNumber: mgmtNum,
          name,
          reason: '직함이 누락되었습니다.',
        });
        hasError = true;
      }

      if (!hasError) {
        seenIds.add(mgmtNum);
        attendees.push({
          managementNumber: mgmtNum,
          name,
          affiliation,
          title,
        });
      }
    });

    return {
      isValid: errors.length === 0,
      attendees,
      errors,
    };
  }
}
