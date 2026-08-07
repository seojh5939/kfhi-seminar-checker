# 📐 Plan v0.11: 수동 생성 결과 화면 탭 격리 버그 수정 설계

## 1. 개요
본 문서는 수동 입력 탭(`activeTab === 'single'`)에서 QR 생성 완료 시 결과 화면(`completedResult`)이 1번 탭(`batch`) 내부에만 갇혀 있어 결과가 즉시 보이지 않던 렌더링 영역 격리 버그를 원천 해결하는 설계를 정의한다.

## 2. 원인 및 해결방안 (Root Cause & Solution)
- **원인**: Step 4 `completedResult` 결과 리포트 카드가 `{activeTab === 'batch' && (...)}` 블록 내부에 기재되어 있어, `'single'` 탭에서 생성 시 1번 탭을 눌러야만 결과가 표출되었음.
- **해결방안**:
  - `completedResult` 결과 카드 및 `isGenerating` 진행 바를 탭 상태(`activeTab`)와 무관한 **공통 결과 렌더링 레이어**로 최상위 분리.
  - `completedResult`가 존재할 때는 탭 선택 버튼 바를 가리고 **생성 완료 화면(Step 4)**으로 바로 전면 전환.
  - `handleReset` (새 작업하기 버튼) 클릭 시 `completedResult`가 clearing 되면서 탭 화면으로 되돌아옴.

## 3. 검증 전략 (Verification Plan)
- `pnpm build:all` 컴파일 성공 검증
- 수동 탭(`'single'`)에서 QR 생성 즉시 1번 탭 전환 조작 없이 결과 화면이 직관적으로 표출되는지 테스트
