/**
 * 시스템 공통 상수 정의
 */

// AES-256-GCM 대칭 암호화 비밀키 (정확히 32바이트 = 256비트)
export const DEFAULT_AES_SECRET_KEY = 'kfhi-seminar-checker-secret-32b';

// QR 페이로드 규격 버전
export const QR_PAYLOAD_VERSION = 1;

// 관리번호 정규식 (5자리 숫자)
export const MANAGEMENT_NUMBER_REGEX = /^\d{5}$/;

// 직함 수용 목록 (기아대책 SRS 양식 표준)
export const ALLOWED_TITLES = [
  '목사',
  '장로',
  '권사',
  '집사',
  '성도',
  '후원자',
  '이사장',
  '이사',
  '회장',
  '부회장',
  '지회장',
  '총무',
  '간사',
  '스탭',
  '기타',
] as const;
