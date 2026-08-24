import { ALLOWED_TITLES } from '../constants';

export type TitleType = typeof ALLOWED_TITLES[number] | string;

/**
 * 엑셀 명단 참석자 원본 인터페이스 (v1.1)
 */
export interface AttendeeInput {
  name: string;             // 성명
  affiliation: string;      // 소속/이사회명 (공란 불가)
  title: TitleType;         // 직책/직함 (본인 직책 또는 "사모")
  tshirtSize?: string;      // 티셔츠 사이즈 (예: "100", "XL", "L", "95" 등)
  isSpouse?: boolean;       // 사모님 여부
  managementNumber?: string;// 6자리 관리번호/일련번호 (optional)
  sheetName?: string;       // 엑셀 탭(시트) 제목 (예: "서울", "경기")
}

/**
 * QR코드 내부에 담기는 페이로드 포맷 (v1 & v2 호환)
 */
export interface QRPayload {
  v: number;       // 규격 버전 (1 또는 2)
  n: string;       // 성명 (name)
  a: string;       // 소속/이사회명 (affiliation)
  t: string;       // 직책/직함 (title)
  s?: string;      // 티셔츠 사이즈 (t-shirt size)
  ts: number;      // 생성 시각 (Unix Epoch ms)
  id?: string;     // v1 관리번호 (optional)
}

/**
 * QR 스캔 및 로컬 DB 방문 기록 인터페이스
 */
export interface ScanRecord {
  id?: number;              // Auto Increment PK
  name: string;             // 성명
  affiliation: string;      // 소속/이사회명
  title: string;            // 직책/직함
  tshirtSize?: string;      // 티셔츠 사이즈
  location: string;         // 방문 장소 (예: "메인홀 입구")
  scannedAt: string;        // 스캔 시각 (YYYY-MM-DD-HH:mm:ss)
  isDuplicate: boolean;     // 중복 스캔 여부
  managementNumber?: string;// 하위 호환용
}

/**
 * 생성기 매니페스트 (InDesign Data Merge) 기록 인터페이스 (v1.5)
 */
export interface ManifestRecord {
  managementNumber: string; // 6자리 일련번호 (예: "200001")
  affiliation: string;      // 이사회명
  title: string;            // 직함
  name: string;             // 성명
  tshirtSize?: string;      // 티셔츠사이즈
  fileName: string;         // 예: "200001.png"
  createdAt: string;        // 생성 시각 (YYYY-MM-DD-HH:mm:ss)
  sheetName?: string;       // 엑셀 탭(시트) 제목
}

/**
 * 이원화 매니페스트 (Dual Manifest) 파일 경로 결과
 */
export interface DualManifestPaths {
  listManifestPath: string; // manifest_list.txt (인적 정보)
  qrManifestPath: string;   // manifest_qr.txt (QR 매핑 정보)
}

/**
 * 엑셀 파일 검증 실패 에러 항목
 */
export interface ValidationErrorItem {
  rowNumber: number;        // 엑셀 행 번호
  name?: string;
  affiliation?: string;
  reason: string;           // 사유 (예: "성명 누락", "소속 공란")
  managementNumber?: string;
}

/**
 * 엑셀 헤더와 표준 필드 간 매핑 정보
 */
export interface ColumnMapping {
  affiliationCol: string;        // 이사회명/소속 매핑 헤더명
  titleCol: string;              // 직책/직함 매핑 헤더명
  nameCol: string;               // 본인 성명 매핑 헤더명
  tshirtSizeCol?: string;        // 본인 티셔츠사이즈 매핑 헤더명
  spouseNameCol?: string;        // 사모님 성함 매핑 헤더명
  spouseTshirtSizeCol?: string;  // 사모님 티셔츠사이즈 매핑 헤더명
  spouseAccompanyCol?: string;   // 사모님 동행여부 매핑 헤더명
}

/**
 * 엑셀 파일 헤더 추출 및 샘플 데이터 구조
 */
export interface ExcelHeaderInfo {
  headers: string[];             // 인식된 전체 헤더 목록
  sampleRows: Record<string, string>[]; // 상위 3~5행 미리보기 샘플
  suggestedMapping: ColumnMapping;      // 스마트 매칭 추천 매핑
}

/**
 * 구글 계정 인증 및 키 파일 상태
 */
export interface GoogleAuthStatus {
  hasCredentialsFile: boolean;   // google-credentials.json 존재 여부
  credentialsPath?: string;      // 감지된 파일 경로
  isAuthenticated: boolean;      // 로그인 완료 여부
  userEmail?: string;            // 로그인된 구글 계정 이메일
  userName?: string;             // 구글 프로필 성명
}

/**
 * 구글 스프레드시트 요약 정보
 */
export interface GoogleSpreadsheetItem {
  id: string;                    // 스프레드시트 고유 ID
  name: string;                  // 파일명
  modifiedTime?: string;         // 최근 수정 시각
  webViewLink?: string;          // 웹 브라우저 열기 링크
}

/**
 * 구글 시트 실시간 동기화 설정
 */
export interface GoogleSyncConfig {
  spreadsheetId: string;         // 대상 스프레드시트 ID
  spreadsheetTitle: string;      // 대상 스프레드시트 제목
  autoSyncEnabled: boolean;      // 실시간 자동 동기화 켜짐 여부
}
