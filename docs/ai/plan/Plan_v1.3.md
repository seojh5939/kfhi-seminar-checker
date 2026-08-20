# 📋 Implementation Plan v1.3 — 다중 클라이언트(최대 10대) 동시 운영을 위한 Google Sheets API 연동 주기 최적화

**문서 버전**: v1.3  
**작성일**: 2026-08-21  
**상태**: 계획 수립 및 구현 (In Progress)  
**대상 모듈**: `reader` (QR 인식기)

---

## 1. 배경 및 목적

행사 현장에서 **최대 7~10대의 노트북**에 QR 인식기 프로그램을 동시 설치하여 운영할 예정입니다.
Google Sheets API의 쓰기 할당량(Quota)은 **사용자당 분당 60회(프로젝트당 300회)**로 제한되어 있으므로, 10대의 노트북에서 동시 다발적인 스캔이 발생할 때 `429 (Too Many Requests)` 오류 자체를 예방하고 100% 무손실 동기화를 유지하도록 동기화 주기 및 배치 파라미터를 최적화합니다.

---

## 2. 수학적 분석 및 파라미터 최적화

### 2.1 기존 파라미터 vs 10대 최적화 파라미터 비교

| 설정 항목 | 기존 파라미터 (v1.2) | 10대 최적화 파라미터 (v1.3) | 최적화 사유 및 효과 |
| :--- | :---: | :---: | :--- |
| **스캔 디바운스 대기시간 (`SYNC_DEBOUNCE_MS`)** | `800ms` | **`1,500ms (1.5초)`** | 연속 입장 시 2~4명씩 자연스럽게 묶어서 1회 전송 |
| **단일 기기 최소 요청 간격 (`MIN_REQUEST_INTERVAL_MS`)** | `1,500ms` (분당 40회) | **`4,000ms (4.0초)`** (분당 15회) | 10대 풀가동 시에도 분당 총 호출량 $10 \times 4\text{회} \approx 40\text{회}$로 60회 한도 완전 방어 |
| **안전 폴러 주기 (`SYNC_POLL_INTERVAL_MS`)** | `2,500ms` | **`5,000ms (5.0초)`** | 백그라운드 큐 정리 빈도를 완화하여 유휴 API 호출 방지 |
| **1회 최대 묶음 전송량 (`MAX_BATCH_SIZE`)** | `25건` | **`25건`** | 1회 호출당 최대 25명까지 한 번에 시트 추가 |

### 2.2 수학적 한도 보장 (Upper Bound Proof)
- **노트북 1대당 1분간 최대 요청 수**:
  $$\frac{60\text{초}}{4.0\text{초}} = 15\text{회 / 분}$$
- **실제 연속 스캔 시 (1.5초 디바운스 적용)**: 1대당 분당 $4 \sim 6\text{회}$ 호출
- **10대 동시 운영 시 분당 총 호출 수**:
  $$10\text{대} \times 5\text{회} = 50\text{회 / 분} \le 60\text{회 / 분 (Google Quota Safe Zone)}$$
- **10대 동시 운영 시 분당 최대 참석자 처리량**:
  $$10\text{대} \times 15\text{회} \times 25\text{명} = 3,750\text{명 / 분}$$

---

## 3. 수정 대상 파일 및 변경 내역

- **`reader/src/renderer/App.tsx`**:
  - 명시적인 동기화 상수(`SYNC_DEBOUNCE_MS`, `MIN_REQUEST_INTERVAL_MS`, `SYNC_POLL_INTERVAL_MS`, `MAX_BATCH_SIZE`) 정의
  - `processSyncQueue`의 최소 간격 검사 로직에 `MIN_REQUEST_INTERVAL_MS` 적용
  - `handleScanSuccess`의 디바운스 타이머에 `SYNC_DEBOUNCE_MS` 적용
  - `useEffect` 주기적 폴링 타이머에 `SYNC_POLL_INTERVAL_MS` 적용

---

## 4. 검증 절차
1. `pnpm test`: 공통 및 단위 테스트 통과 확인.
2. `pnpm build:all`: 빌드 및 번들링 무오류 검증.
3. `git commit` 및 원격 푸시, GitHub PR 생성.
