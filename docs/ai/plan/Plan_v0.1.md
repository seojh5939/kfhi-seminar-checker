# 📐 Plan v0.1 — 기아대책 행사 출입관리 QR 시스템 상세 설계

**문서 버전**: v0.1  
**작성일**: 2026-08-03  
**상태**: Plan 작성 완료 (기술 스택: Electron + TypeScript Monorepo)

---

## 1. 시스템 모듈 및 레이어 아키텍처

본 시스템은 단일 Git 레포지토리(`pnpm workspaces`) 구조 내에서 공통 모듈 `/shared`를 기반으로 두 개의 독립된 Electron 데스크톱 앱을 구성합니다.

```
+-----------------------------------------------------------------------+
|                            Shared Layer                               |
| - AES-256-GCM Crypto Module (CryptoEngine)                            |
| - Data Schemas & Types (Attendee, QRPayload, ScanRecord, Manifest)    |
| - System Constants (Default Key, Regex Rules, Storage Keys)           |
+-----------------------------------+-----------------------------------+
                                    | (Static Import)
          +-------------------------+-------------------------+
          |                                                   |
          v                                                   v
+-----------------------------------+   +-----------------------------------+
|         Generator App             |   |            Reader App             |
| [Main Process]                    |   | [Main Process]                    |
| - Excel Reader & Validator        |   | - SQLite / Local Storage Manager  |
| - Parallel QR Generator           |   | - CSV Exporter (BOM Encoding)     |
| - Manifest CSV Generator          |   | - App State & Config Store        |
| [Renderer Process]                |   | [Renderer Process]                |
| - Admin UI (React)                |   | - Webcam Scanner (HTML5 Camera)   |
| - File Dropzone & Progress Bar    |   | - Result Banner & Audio Feedback  |
+-----------------------------------+   +-----------------------------------+
```

---

## 2. 데이터 인터페이스 및 DTO 스키마

### 2.1 참석자 원본 데이터 (AttendeeInput)
```typescript
export interface AttendeeInput {
  managementNumber: string; // 5자리 관리번호 (예: "00001")
  name: string;             // 성명
  affiliation: string;      // 소속 (공란 불가)
  title: string;            // 직함 (드롭다운/목록 일치 필수)
}
```

### 2.2 QR코드 암호화 페이로드 (QRPayload)
QR 코드 이미지 내부에 담기는 암호화된 문자열 구조입니다.
```typescript
export interface QRPayload {
  v: number;       // 버전 (예: 1)
  id: string;      // 관리번호 (5자리)
  n: string;       // 성명
  a: string;       // 소속
  t: string;       // 직함
  ts: number;      // 생성 타임스탬프 (Unix Epoch ms)
}
// 실제 QR 텍스트 = AES256GCM_Encrypt(JSON.stringify(QRPayload))
```

### 2.3 스캔 및 방문 기록 (ScanRecord)
```typescript
export interface ScanRecord {
  id?: number;              // Auto Increment ID
  managementNumber: string; // 관리번호
  name: string;             // 성명
  affiliation: string;      // 소속
  title: string;            // 직함
  location: string;         // 방문 장소 (예: "메인홀 입구")
  scannedAt: string;        // 방문 시간 (포맷: YYYY-MM-DD-HH:mm:ss)
  isDuplicate: boolean;     // 당일 해당 장소 중복 방문 여부
}
```

### 2.4 매니페스트 기록 (ManifestRecord)
```typescript
export interface ManifestRecord {
  managementNumber: string;
  name: string;
  affiliation: string;
  title: string;
  fileName: string;         // 저장된 QR 파일명 (예: "00001.png")
  createdAt: string;        // 생성 일시 (YYYY-MM-DD-HH:mm:ss)
}
```

---

## 3. 핵심 프로세스 IPC 및 상태 모델

### 3.1 QR 생성기 (Generator) 상태 모델
```
[IDLE] ──(Excel 업로드)──> [VALIDATING] ──(검증 성공)──> [READY]
                               │                             │
                        (검증 실패/오류)               (생성 시작)
                               v                             v
                        [VALIDATION_ERR]               [GENERATING] ──(완료)──> [COMPLETED]
```

### 3.2 QR 인식기 (Reader) 상태 모델
```
[INIT] ──(장소 미설정)──> [LOCATION_SETUP_REQUIRED] ──(장소 입력)──> [READY_TO_SCAN]
                                                                        │
                                                                 (QR 스캔 캡처)
                                                                        v
[RESULT_DISPLAY] ──(2초 디바운스/초기화)── [PROCESSING_SCAN] <──────────┘
```

---

## 4. 실패 및 비정상 시나리오 대응 전략 (5가지)

| 번호 | 비정상 시나리오 | 발생 위험 및 영향 | 시스템 대응 및 복구 전략 |
|---|---|---|---|
| **S-01** | **엑셀 업로드 입력값 오류** | 관리번호 중복, 자릿수(5자리 미만), 직함/소속 공란 시 생성 오류 발생 | 파일 업로드 직후 Validation 파이프라인 작동. 오류 라인 번호와 사유를 다이얼로그로 출력하고 처리 중단 |
| **S-02** | **인식기 설치 장소 변경** | 장소 변경 시 이전 장소 방문 데이터 섞임 및 누락 위험 | 장소 변경 시 기존 **"방문기록 CSV 백업 다운로드" 다이얼로그 강제 팝업**. 백업 완료 후 장소 변경 허용 |
| **S-03** | **인식기 PC 전원 꺼짐/비정상 종료** | SQLite DB 트랜잭션 깨짐 및 방문자 스캔 기록 유실 | SQLite WAL(Write-Ahead Logging) 모드 적용. 매 QR 스캔 성공 직후 DB 및 파일 즉시 Flush(Commit) |
| **S-04** | **동일 QR 연달아 중복 스캔** | 짧은 순간 동일 대상이 중복 처리되어 알림 소리/기록 중첩 | 동일 관리번호 수신 시 **3초 Cooldown/Debounce 타이머** 적용. DB 검후 `"또 오셨네요 반갑습니다"` 안내 제공 |
| **S-05** | **위변조/미등록 QR 스캔** | 복호화 에러 또는 JSON 파싱 오류 발생 | Try-Catch 블록에서 복호화 실패 시 **`"등록되지 않았습니다. 스탭에게 문의하세요"`** 경고 UI 표시 및 에러 로그 기록 |

---

## 5. 관측 전략 (Observability)

- **로그 저장 위치**: 타겟 PC 오프라인 로컬 저장소 (`app.getPath('userData')/logs/app-YYYY-MM-DD.log`)
- **로그 인코딩**: UTF-8 with BOM (Windows 메모장 및 Excel 바로보기 지원)
- **로그 포맷**: `[YYYY-MM-DD HH:mm:ss.SSS] [LOG_LEVEL] [MODULE] - Message`
- **로그 레벨**:
  - `INFO`: 앱 시작, 장소 설정 완료, 스캔 성공(정상/중복), CSV 추출 완료
  - `WARN`: 입력값 검증 경고, 중복 스캔 감지
  - `ERROR`: QR 복호화 실패, 파일 입출력 오류, DB 트랜잭션 에러

---

## 6. 테스트 전략 (Testing Strategy)

1. **Shared 암복호화 단원 테스트 (Jest)**:
   - `AES-256-GCM` 암호화 ➡️ 복호화 무결성 테스트
   - 위변조 텍스트 주입 시 복호화 예외 발생 검증
2. **Generator 대량 성능 및 검증 테스트**:
   - 800건 가상 엑셀 데이터 주입 ➡️ 검증 속도 및 3분 이내 800개 PNG 생성 속도 측정
   - 파일명 및 소속별 폴더 분류 자동 생성 검증
3. **Reader 오프라인 프레임 스캔 & 중복 디바운스 테스트**:
   - 카메라 프레임 데모 영상 주입 ➡️ 1초 이내 복호화 UI 전환 검증
   - 연속 동일 프레임 수신 시 3초 쿨다운 동작 여부 검증

---

## 7. Plan 종료 및 선택안 확정

- **선택안**: **Electron + TypeScript Monorepo (`shared` / `generator` / `reader`)**
- **버린 대안과 이유**:
  - Python PySide6: Windows Defender 오탐 위험성으로 오프라인 현장 배치 실패 위험
  - .NET WPF: 웹 기술 대비 UI 구성 및 TypeScript shared 공유 불가능
