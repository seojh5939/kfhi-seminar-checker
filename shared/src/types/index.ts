import { ALLOWED_TITLES } from '../constants';

export type TitleType = typeof ALLOWED_TITLES[number] | string;

/**
 * 엑셀 명단 참석자 원본 인터페이스
 */
export interface AttendeeInput {
  managementNumber: string; // 5자리 관리번호 (예: "00001")
  name: string;             // 성명
  affiliation: string;      // 소속 (공란 불가)
  title: TitleType;         // 직함
}

/**
 * QR코드 내부에 암호화되어 담기는 페이로드 포맷
 */
export interface QRPayload {
  v: number;       // 규격 버전 (예: 1)
  id: string;      // 관리번호 (5자리)
  n: string;       // 성명
  a: string;       // 소속
  t: string;       // 직함
  ts: number;      // 생성 시각 (Unix Epoch ms)
}

/**
 * QR 스캔 및 로컬 DB 방문 기록 인터페이스
 */
export interface ScanRecord {
  id?: number;              // Auto Increment PK
  managementNumber: string; // 관리번호
  name: string;             // 성명
  affiliation: string;      // 소속
  title: string;            // 직함
  location: string;         // 방문 장소 (예: "메인홀 입구")
  scannedAt: string;        // 스캔 시각 (YYYY-MM-DD-HH:mm:ss)
  isDuplicate: boolean;     // 중복 스캔 여부
}

/**
 * 생성기 매니페스트 CSV 기록 인터페이스
 */
export interface ManifestRecord {
  managementNumber: string;
  name: string;
  affiliation: string;
  title: string;
  fileName: string;         // 예: "00001.png"
  createdAt: string;        // 생성 시각 (YYYY-MM-DD-HH:mm:ss)
}

/**
 * 엑셀 파일 검증 실패 에러 항목
 */
export interface ValidationErrorItem {
  rowNumber: number;        // 엑셀 행 번호
  managementNumber: string;
  name: string;
  reason: string;           // 사유 (예: "관리번호 중복", "소속 공란")
}
