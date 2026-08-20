# 📋 Plan v1.1 — QR 생성기 헤더 동적 인식, 사모님 분리 생성 및 데이터 경량화 개발 계획

**문서 버전**: v1.1  
**작성일**: 2026-08-20  
**상태**: 계획 수립 (Plan Proposed)  
**부모 브랜치**: `develop`  
**생성 예정 작업 브랜치**: `feature/v1.1-generator-dynamic-header-spouse`

---

## 1. 개발 목표 및 작업 범위

1. **`shared` 공통 모듈 개편**:
   - 일련번호(관리번호) 제거 및 `AttendeeInput`, `QRPayload`, `ManifestRecord` 모델 확장 (`tshirtSize`, `isSpouse` 추가).
   - 평문 포맷(`v2|소속|직책|이름|티셔츠사이즈|ts`) 및 암호문(Base64URL) 자동 감지 디코더/엔코더 지원.
2. **`generator` 백엔드 서비스 계층 개편**:
   - `ExcelParser`: 1행 헤더 동적 추출 및 스마트 매칭 로직, 사용자 지정 컬럼 매핑 기반 파싱 함수 구현.
   - `ExcelValidator`: 필수값 검증 (이사회명, 직책, 성명) 및 사모님 레코드 조건부 분리 생성.
   - `QRGeneratorEngine`: `${이사회명}_${직책}_${성명}.png` 파일명 안전 생성, 평문/암호화 옵션 지원.
   - `ManifestExporter`: InDesign 호환 UTF-16 LE TXT (`이사회명\t직함\t성명\t티셔츠사이즈\t#QR코드`).
   - `QRVerifier`: 개편된 파일명 규칙 및 평문/암호문 복호화 대조 검증.
3. **`generator` 프론트엔드 UI/UX 개편**:
   - **Step 1 (파일 선택)** ➡️ **Step 2 (헤더 매핑 UI 신설)** ➡️ **Step 3 (미리보기 및 폴더 지정)** ➡️ **Step 4 (생성 진행)** ➡️ **Step 5 (결과 및 검증)**
   - 긴급 수동 입력 탭도 관리번호 필드 제거 및 티셔츠사이즈 필드 추가.
4. **`reader` 인식기 호환성 보장**:
   - 평문 및 암호화 QR 코드 동시 자동 인식 지원.
   - 스캔 기록 및 CSV 내보내기 시 티셔츠사이즈 연동.

---

## 2. 세부 개발 단계 및 구현 계획

```mermaid
flowchart TD
    subgraph Phase 1: Shared Core
        P1_1[types/index.ts 모델 확장] --> P1_2[crypto/aes256gcm.ts 평문/암호문 하이브리드 지원]
    end
    subgraph Phase 2: Generator Backend Services
        P2_1[ExcelParser.ts 동적 헤더 파싱 및 매핑] --> P2_2[ExcelValidator.ts 사모님 분리 및 유효성 검증]
        P2_2 --> P2_3[QRGeneratorEngine.ts 파일명 규칙 및 평문/암호 생성]
        P2_3 --> P2_4[ManifestExporter & QRVerifier 수정]
    end
    subgraph Phase 3: Generator UI/Renderer
        P3_1[Main Process IPC 핸들러 등록] --> P3_2[App.tsx 헤더 매핑 UI & Step 플로우 구현]
        P3_2 --> P3_3[수동 입력 탭 업데이트]
    end
    subgraph Phase 4: Reader App Compatibility
        P4_1[Reader Scanner & Main 복호화/파싱 개선] --> P4_2[CSV Export 및 UI 연동]
    end
    subgraph Phase 5: Testing & PR
        P5_1[단위 테스트 작성 및 실행] --> P5_2[통합 빌드 및 구동 테스트]
        P5_2 --> P5_3[GitHub PR 생성]
    end

    Phase 1 --> Phase 2 --> Phase 3 --> Phase 4 --> Phase 5
```

---

### Step 1. `shared` 공통 모듈 개편
- **파일**: `shared/src/types/index.ts`, `shared/src/crypto/aes256gcm.ts`, `shared/src/constants/index.ts`
- **작업 내용**:
  1. `AttendeeInput` 타입 수정:
     ```typescript
     export interface AttendeeInput {
       affiliation: string;    // 이사회명
       title: string;          // 직책 (본인 직책 또는 "사모")
       name: string;           // 성명
       tshirtSize?: string;    // 티셔츠 사이즈 (예: "100", "XL", "L")
       isSpouse?: boolean;     // 사모님 여부
       managementNumber?: string; // 하위 호환용 (optional)
     }
     ```
  2. `QRPayload` v2 인터페이스 및 `CryptoEngine` 확장:
     - `encodePayload(attendee, isEncrypted)` / `decodePayload(rawText)`
     - 평문: `v2|소속|직책|이름|티셔츠사이즈|ts`
     - 복호화 엔진에서 `v2|`로 시작하면 평문 파싱, 아니면 복호화 수행.

---

### Step 2. `generator` 서비스 계층 개편
- **파일**:
  - `generator/src/services/excelParser.ts`
  - `generator/src/services/excelValidator.ts`
  - `generator/src/services/qrGenerator.ts`
  - `generator/src/services/manifestExporter.ts`
  - `generator/src/services/qrVerifier.ts`
- **작업 내용**:
  1. `ExcelParser`:
     - `getHeadersAndSamples(filePath)`: 1행의 전체 헤더 목록 및 샘플 3행 반환.
     - `parseWithMapping(filePath, columnMapping)`: 사용자가 선택한 컬럼 인덱스 매핑으로 raw 데이터 추출.
  2. `ExcelValidator`:
     - 엑셀 행을 순회하며 본인 레코드 생성.
     - '사모님 성함' 열에 값이 있는 경우 사모님 레코드(`title: '사모'`) 추가 생성.
     - 필수 항목(`affiliation`, `title`, `name`) 누락 검증.
  3. `QRGeneratorEngine`:
     - 파일명: `${sanitize(affiliation)}_${sanitize(title)}_${sanitize(name)}.png`
     - 동일 파일명 충돌 방지 로직 (동명이인 등 존재 시 번호 부여 또는 방어).
     - 옵션에 따라 평문 또는 암호화 QR 버퍼 생성.
  4. `ManifestExporter`:
     - InDesign UTF-16 LE BOM 탭 구분 TXT 헤더: `이사회명\t직함\t성명\t티셔츠사이즈\t#QR코드`
  5. `QRVerifier`:
     - 생성된 TXT 매니페스트 기반으로 QR 이미지 복호화 및 대조 검증.

---

### Step 3. `generator` 메인 및 UI(Renderer) 계층 구현
- **파일**:
  - `generator/src/main/index.ts`
  - `generator/src/main/preload.ts`
  - `generator/src/renderer/App.tsx`
- **작업 내용**:
  1. IPC 채널 추가:
     - `generator:parse-excel-headers`: 헤더 목록 및 샘플 데이터 반환
     - `generator:validate-mapped-excel`: 매핑 정보 기반 검증 및 참석자 목록 생성
  2. UI Step 플로우 구성:
     - **Step 1**: 엑셀 업로드 ➡️ 즉시 헤더 목록 감지
     - **Step 2 (헤더 매핑 화면)**:
       - 6개 필드 (이사회명, 직책, 성명, 티셔츠, 사모님 성함, 사모님 티셔츠) 드롭다운 셀렉트
       - 스마트 자동 매칭 기본값 설정
       - "다음: 명단 확인" 버튼
     - **Step 3 (참석자 미리보기 & 옵션)**:
       - 본인 + 사모님 분리된 총 N명 테이블 미리보기
       - QR 암호화 적용 여부 체크박스 (`[ ] 암호화 적용 (미체크 시 초고속 평문 생성)`)
       - 저장 폴더 선택 및 생성 시작 버튼
     - **Step 4 & 5**: 생성 프로그레스 및 완료/검증 화면
  3. 긴급 수동 입력 탭: 관리번호 제거, 이사회명/직책/성명/티셔츠사이즈 입력 폼으로 업데이트.

---

### Step 4. `reader` 호환성 보장
- **파일**: `reader/src/main/index.ts`, `reader/src/renderer/components/Scanner.tsx`, `reader/src/renderer/App.tsx`
- **작업 내용**:
  - Scanner의 `handleDecodedQr`에서 평문(`v2|...`)과 암호문을 자동 감지하여 파싱.
  - ScanRecord에 `tshirtSize` 필드 연동.
  - 중복 스캔 판정 시 키를 `affiliation_title_name`으로 안전하게 판별.

---

### Step 5. 테스트 및 GitHub PR 생성
- **작업 내용**:
  1. 단위 테스트 코드 업데이트 및 통과 확인 (`pnpm test` 또는 vitest).
  2. Electron 앱 빌드 및 실행 테스트.
  3. Git 브랜치 커밋 및 원격 푸시, `gh pr create`로 PR 작성.

---

## 3. 리스크 및 대응 방안

| 리스크 | 영향도 | 대응 방안 |
| :--- | :--- | :--- |
| 엑셀 컬럼명에 공백/오타 존재 | 중간 | 정규식 기반 스마트 자동 매칭 및 매핑 UI에서 사용자가 직접 수동 교정 가능하도록 지원 |
| 파일명에 특수문자 포함 시 OS 오류 | 높음 | Windows 파일명 예약 문자(`\ / : * ? " < > |`)를 안전하게 언더스코어로 변환하는 Sanitize 유틸리티 적용 |
| 동일 이사회/동일 직책의 동명이인 존재 시 파일명 중복 | 낮음 | 검증 단계에서 파일명 중복을 감지하고 `_2`, `_3` 등의 접미사를 안전하게 부여하여 덮어쓰기 방지 |
| 사모님 티셔츠 사이즈만 있고 이름이 없는 경우 | 낮음 | 사모님 성함이 존재하는 경우에만 사모님 QR을 생성하도록 방어 로직 적용 |

---

## 4. 승인 요청

본 계획에 대해 검토 후 승인해주시면, 즉시 Git 전략에 따라 **새 브랜치(`feature/v1.1-generator-dynamic-header-spouse`)를 생성**하고 구현(Implementation) 단계로 진입하겠습니다.
