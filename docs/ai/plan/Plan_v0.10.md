# 📐 Plan v0.10: 수동 입력 UX 개선 (버튼 중복 제거 & 생성 완료 플로우 통일) 설계

## 1. 개요
본 문서는 수동 입력 탭 내의 중복되던 `+ 참석자 행 추가` 버튼을 하단 1개로 통일하고, 수동 QR 코드 생성 완료 후 기존 엑셀 일괄 생성과 동일하게 **생성 완료 화면(Step 4 결과 리포트 및 검증 화면)**으로 플로우를 100% 통일하는 변경 설계를 정의한다.

## 2. 세부 설계 명세 (Specification)

### 2.1 버튼 중복 해소
- 수동 입력 폼 상단 헤더 영역의 `➕ 참석자 행 추가` 버튼 제거
- 입력 폼 최하단의 `[ ➕ 참석자 1명 더 추가하기 ]` 단일 버튼으로 일원화

### 2.2 생성 완료 플로우 통합 (`completedResult` 공통 연동)
- 수동 QR 생성 성공 시 `setCompletedResult`를 공통 업데이트:
  ```typescript
  setCompletedResult({
    count: attendeesToGenerate.length,
    outputDir: singleOutputDir,
    manifestPath: res.manifestPath,
    attendees: attendeesToGenerate,
  });
  ```
- 수동 QR 생성 후에도 생성 완료 카드, `📂 생성 폴더 열기`, `🔍 생성물 검증하기` 및 `🔄 새 작업하기` 기능을 동일한 플로우로 지원.

## 3. 검증 전략 (Verification Plan)
- `pnpm build:all` 컴파일 성공 검증
- 수동 폼 생성 후 결과 화면 전환 및 🔍 생성물 검증 기능 동작 대조 테스트
