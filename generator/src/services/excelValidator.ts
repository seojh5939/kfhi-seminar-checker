import { AttendeeInput, ValidationErrorItem } from 'shared';

export interface ValidationResult {
  isValid: boolean;
  attendees: AttendeeInput[];
  errors: ValidationErrorItem[];
}

/**
 * Excel 참석자 명단 입력값 검증 전담 서비스 (v1.1)
 */
export class ExcelValidator {
  /**
   * Raw 참석자 데이터 배열을 검증하고 유효한 데이터 및 오류 목록을 반환
   */
  public static validate(rawRows: Partial<AttendeeInput>[]): ValidationResult {
    const attendees: AttendeeInput[] = [];
    const errors: ValidationErrorItem[] = [];

    rawRows.forEach((row, index) => {
      const rowNumber = index + 2; // 엑셀 헤더 제외 2행부터 시작 (참석자 인덱스 기준)
      const affiliation = (row.affiliation || '').toString().trim();
      const title = (row.title || '').toString().trim();
      const name = (row.name || '').toString().trim();
      const tshirtSize = (row.tshirtSize || '').toString().trim();
      const isSpouse = !!row.isSpouse;

      let hasError = false;

      // 1. 소속/이사회명 검증 (공란 불허)
      if (!affiliation) {
        errors.push({
          rowNumber,
          name,
          affiliation,
          reason: isSpouse ? '사모님 소속(이사회명)이 누락되었습니다.' : '소속(이사회명)이 누락되었습니다.',
        });
        hasError = true;
      }

      // 2. 직책/직함 검증 (공란 불허)
      if (!title) {
        errors.push({
          rowNumber,
          name,
          affiliation,
          reason: isSpouse ? '사모님 직함이 누락되었습니다.' : '직책(직함)이 누락되었습니다.',
        });
        hasError = true;
      }

      // 3. 성명 검증 (공란 불허)
      if (!name) {
        errors.push({
          rowNumber,
          name,
          affiliation,
          reason: isSpouse ? '사모님 성함이 누락되었습니다.' : '성명이 누락되었습니다.',
        });
        hasError = true;
      }

      if (!hasError) {
        attendees.push({
          affiliation,
          title,
          name,
          tshirtSize,
          isSpouse,
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
