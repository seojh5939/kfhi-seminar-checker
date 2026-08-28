# 📋 Implementation Plan v1.5 — 지역번호 기반 일련번호 자동 채번 및 InDesign 이원화 매니페스트(Dual Manifest) 구현

**문서 버전**: v1.5  
**작성일**: 2026-08-24  
**상태**: 실행 준비 (Ready for Execution)  
**관련 연구 문서**: [`docs/ai/research/Research_v1.4.md`](file:///C:/Users/20260602/Documents/github/kfhi-seminar-checker/docs/ai/research/Research_v1.4.md)

---

## 1. 구현 목표 및 범위

1. **소속(이사회명) 기반 지역코드 판별 엔진 (`RegionCodeResolver`) 구현**:
   - `shared` 모듈에 시/도 및 전국 시·군·구 사전 매핑 엔진 작성.
   - 서울은 `20`, 경기 `31`, 부산 `51` 등 국내 유선전화 지역번호 끝 2자리 매핑 (미분류 시 `99`).
2. **6자리 일련번호 기반 QR 대량 생성 엔진 (`QRGeneratorEngine`) 수정**:
   - 권역별 순번 카운터(`regionCounters`)를 유지하여 권역 내 0001부터 9999까지 순차 채번.
   - 생성되는 파일명을 `{일련번호}.png` (`200001.png`)로 변경.
   - QR 코드 암호화/평문 페이로드의 `id` 필드에 일련번호 기록.
3. **InDesign Data Merge용 이원화 매니페스트 생성기 (`ManifestExporter`) 구현**:
   - `manifest_list.txt`: `이사회명\t직함\t성명` (UTF-16 LE with BOM, QR 및 일련번호 제외)
   - `manifest_qr.txt`: `일련번호\t#QR코드` (UTF-16 LE with BOM)
4. **출력물 검증기 (`QRVerifier`) 및 메인 프로세스 (`generator:main`) 연동**:
   - 듀얼 매니페스트 및 일련번호 파일명 기반 디코딩 대조 검증 지원.
5. **생성기 UI (`App.tsx`) 업데이트**:
   - 참석자 명단 미리보기 테이블에 `일련번호`, `파일명(200001.png)` 반영.
   - 생성 완료 화면에 2개 매니페스트 파일 링크 및 안내 제공.
6. **유닛 테스트 및 검증**:
   - `shared` 및 `generator` 테스트 코드 업데이트 및 통과 확인.

---

## 2. 세부 구현 작업 단계

### Phase 1: Shared 모듈 (타입 정의 및 지역코드 해석기)
- [x] `shared/src/types/index.ts`: `ManifestRecord`에 `managementNumber` 속성 필수/강화 및 듀얼 매니페스트 결과 인터페이스 추가
- [x] `shared/src/utils/regionResolver.ts`: 지역코드 판별 함수 `resolveRegionCode(affiliation: string): string` 구현
- [x] `shared/src/index.ts`: `resolveRegionCode` 및 관련 상수 export
- [x] `shared/tests/regionResolver.test.ts`: 전국 시도 및 시군구 매핑 테스트 작성

### Phase 2: Generator 백엔드 서비스
- [x] `generator/src/services/qrGenerator.ts`:
  - `generateBulk()`에서 `regionCounters`를 관리하며 `managementNumber` 채번
  - 파일명을 `${managementNumber}.png`로 저장
  - QR 페이로드 `id`에 `managementNumber` 저장
- [x] `generator/src/services/manifestExporter.ts`:
  - `exportDualTxt(records, outputDir)` 구현 (`manifest_list.txt`, `manifest_qr.txt`)
  - 기존 `exportToTxt` 호환성 유지
- [x] `generator/src/services/qrVerifier.ts`:
  - `manifest_list.txt` & `manifest_qr.txt` 읽기 및 일련번호 기반 PNG 파일 검증
- [x] `generator/src/main/index.ts`:
  - `generator:generate-qr` 핸들러에서 `exportDualTxt` 호출 및 결과 반환
  - `generator:verify-output` 핸들러 업데이트

### Phase 3: Generator 프론트엔드 UI 및 단체/수동 생성
- [x] `generator/src/renderer/App.tsx`:
  - Step 3 명단 미리보기 테이블에 `일련번호` 및 `파일명` 컬럼 표시
  - Step 4 완료 화면에 `manifest_list.txt` 및 `manifest_qr.txt` 생성 안내
  - 수동 입력 탭(Single Tab)에서도 동일하게 일련번호 부여 및 듀얼 매니페스트 생성

### Phase 4: 테스트 및 빌드 검증
- [x] `generator/tests/qrGenerator.test.ts`: 일련번호 네이밍 및 듀얼 매니페스트 테스트 업데이트
- [x] 전체 Jest 테스트 스위트 실행
- [x] TypeScript 컴파일 및 린트 검사
