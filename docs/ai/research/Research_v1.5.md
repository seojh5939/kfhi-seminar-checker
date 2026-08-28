# 🔬 Research Report v1.5 — 구글 스프레드시트 실시간 연동 환경에서의 API Quota 절감형 중복방문 검증 아키텍처 연구

**문서 버전**: v1.5  
**작성일**: 2026-08-27  
**상태**: 연구 완료 (Research Complete)  
**대상 모듈**: `reader` (QR 인식기), `shared` (공통 모듈)

---

## 1. 연구 배경 및 핵심 과제

### 1.1 현상 및 문제 정의
현재 QR 인식기(`reader`)는 스캔된 참석자의 중복 방문 여부(`isDuplicate`)를 **로컬 단말기의 메모리/로컬스토리지(`scanHistory`)에만 의존하여 판정**하고 있습니다.

- **오프라인 모드**: 단일 노트북에서 단독으로 운영되므로 로컬 기록만으로 중복 검사가 완벽히 동작합니다.
- **온라인 모드 (구글 시트 연동 상태)**:
  - 현장 게이트가 여러 개이거나 노트북이 다수(예: 입구 1번 데스크, 2번 데스크, 세미나실 입구 등) 배치된 환경에서는 **다른 노트북에서 이미 체크인한 참석자**나 **앱 재시작 전 시트에 저장된 참석자**를 현재 노트북이 알지 못하여 중복 판정 누락(False Negative)이 발생합니다.
  - 따라서 온라인 상태에서는 **구글 스프레드시트에 이미 누적된 전체 출입 데이터를 기준**으로 중복 여부를 판별해야 합니다.

### 1.2 핵심 기술적 우려 (API 사용량 및 한도)
> **사용자 핵심 질문**:  
> *"QR을 스캔할 때마다 구글 스프레드시트에서 중복 여부를 실시간으로 체크하면, 구글 API 사용량(Quota) 초과나 네트워크 딜레이 문제가 발생하지 않을까?"*

본 연구는 **Google Sheets API v4의 호출 할당량(Quota) 정책을 완벽히 준수**하면서, **스캔 반응속도 0ms(지연 없음)와 데이터 정합성을 동시에 달성하는 최적의 아키텍처**를 규명합니다.

---

## 2. Google Sheets API v4 할당량(Quota) 및 제약 분석

### 2.1 Google 공식 Quota 기준표 (무료 제공 한도)
Google Cloud의 Google Sheets API v4는 금전적 과금 없이 완전 무료로 제공되지만, 남용 방지를 위한 분당 호출 횟수(Rate Limit)가 엄격히 적용됩니다.

| 요청 구분 (Request Type) | 프로젝트당 분당 한도 (Per Project / Min) | 사용자(토큰)당 분당 한도 (Per User / Min) | 비고 |
| :--- | :---: | :---: | :--- |
| **읽기 요청 (Read Requests)** | **300회 / 분** | **60회 / 분** | `get`, `batchGet` 등 데이터 조회 |
| **쓰기 요청 (Write Requests)** | **300회 / 분** | **60회 / 분** | `append`, `update`, `batchUpdate` 등 |

* 한도 초과 시 Google 서버는 **`HTTP 429 Too Many Requests (RESOURCE_EXHAUSTED)`** 에러를 반환하며 일시적으로 API 호출이 차단됩니다.

---

### 2.2 안티패턴 분석: 매 스캔 시점 단건 조회 (Point Query on Scan)

스캔이 발생할 때마다 구글 시트 API로 해당 참석자가 있는지 조회(`spreadsheets.values.get`)하는 방식의 치명적 결함:

```
[QR 스캔 발생] ──> [Google Sheets GET API 호출] ──(200~800ms 네트워크 대기)──> [중복여부 확인] ──> [띵동/환영음 출력]
```

1. **API Quota 고갈 위험 (위험도: 🔴 극도)**:
   - 세미나 입장 피크 타임에 5~10대의 노트북에서 분당 100명이 입장할 경우:
     - 분당 Read 요청: 100회/분 (사용자당 한도인 60회/분을 즉시 초과하여 **429 에러 발생**)
2. **현장 UX 반응성 훼손 (Latency)**:
   - 웹캠에 QR을 대었을 때 즉시 소리/팝업이 뜨지 않고 0.3~1.0초간 멈칫거림(Lag) 발생.
3. **네트워크 단절 시 먹통 현상**:
   - 현장 Wi-Fi가 일시적으로 불안정해지면 스캔 화면 자체가 멈추거나 에러 팝업 발생.

---

## 3. 해결 아키텍처: 인메모리 시트 캐시 폴링 (Local Cache-First Sync)

읽기(Read)와 스캔(Scan) 동작을 완전히 분리(Decoupling)하는 **"Local Cache-First + 주기적 배치 폴링"** 방식을 적용합니다.

```mermaid
flowchart TD
    subgraph BackgroundSync [백그라운드 동기화 파이프라인]
        Sheets[(구글 스프레드시트)]
        PollWorker[주기적 읽기 워커: 15초 주기]
        AppendWorker[쓰기 워커: 1.5초 디바운스 배치]
        
        Sheets -->|1회 values.get (전체 명단 배치 수신)| PollWorker
        PollWorker -->|동기화 Set 업데이트| InMemCache[(인메모리 출입자 Cache Set)]
        AppendWorker -->|values.append| Sheets
    end

    subgraph ScanPipeline [실시간 QR 스캔 파이프라인: 0ms 지연]
        Webcam[웹캠 QR 인식] --> Decrypt[복호화]
        Decrypt --> CacheCheck{인메모리 Cache Set에\n존재하는가?}
        
        CacheCheck -- 존재함 --> Dup[중복 방문 판정: 환영음 재생]
        CacheCheck -- 없음 --> First[최초 방문 판정: 띵동 재생]
        
        Dup --> UpdateCache[Cache Set에 즉시 반영]
        First --> UpdateCache
        UpdateCache --> PushQueue[쓰기 큐 Push]
        PushQueue --> AppendWorker
    end
```

---

### 3.1 3대 핵심 메커니즘

#### ① 스캔 시점: 0ms 인메모리 O(1) 초고속 검증 (API 호출 0회)
- 앱 내부 메모리에 `syncedAttendeesSet` (Set 구조체: `일련번호` 또는 `이사회_직함_성명`)을 유지.
- QR이 스캔되면 네트워크를 타지 않고 **메모리 Set에서 즉시 O(1) 시간 복잡도로 중복 여부를 판정**.
- 판정 즉시 메모리 Set에 해당 참석자를 등록하여, 0.5초 뒤 같은 노트북에서 다시 대더라도 100% 즉시 중복 처리.

#### ② 백그라운드 읽기: 주기적 단일 배치 폴링 (Polling Rate Limiting)
- 백그라운드 타이머가 **15초 ~ 20초 간격**으로 해당 시트 탭(또는 전체 탭)의 데이터를 **단 1회의 `spreadsheets.values.get`**으로 통째로 읽어와 메모리 Set을 갱신.
- 다른 게이트의 노트북 B, C가 시트에 기록한 최신 출입자 정보가 15초 내에 내 노트북 A의 로컬 캐시로 자동 병합(Sync).

#### ③ 초기 로드 (Initial Load): 시트 연동 즉시 1회 전체 로드
- 구글 시트를 처음 연결하거나 장소를 변경하는 즉시 1회 전체 읽기를 수행하여, 과거에 기록된 모든 출입자 목록을 메모리에 완벽히 적재.

---

## 4. API 사용량 정량 분석 및 검증 (Safety Calculation)

### 4.1 10대 단말기 동시 운영 시뮬레이션 (최악 조건)

- **조건**: 행사장 출입구에 노트북 **10대** 동시 배치, 총 참석자 **1,000명**, 피크 시간대 분당 **120명** 입장.
- **폴링 주기**: 15초 (분당 4회 호출)

| 항목 | 계산식 | 실제 분당 API 사용량 | 구글 한도 (Quota) | 사용률 / 안전 여유도 |
| :--- | :--- | :---: | :---: | :---: |
| **읽기 요청 (Read)** | 10대 x 4회/분 | **40 회 / 분** | **300 회 / 분** | **13.3% 사용 (86.7% 여유)** |
| **단일 단말기 Read** | 단일 기기 15초 주기 | **4 회 / 분** | **60 회 / 분** | **6.6% 사용 (93.4% 여유)** |
| **쓰기 요청 (Write)** | 1.5초 디바운스 배치 | **15 ~ 25 회 / 분** | **300 회 / 분** | **8.3% 사용 (91.7% 여유)** |
| **총 API 호출 합계** | Read(40) + Write(25) | **65 회 / 분** | **600 회 / 분 (합산)** | 🟢 **압도적 안전 구역** |

> **핵심 결론**:  
> 참석자가 100명이든 10,000명이든, 스캔 빈도와 무관하게 **Read API 호출 횟수는 단말기당 분당 4회로 완전히 고정(O(1))**되므로, API Quota 초과(429) 위험이 **수학적으로 0%**입니다.

---

### 4.2 네트워크 페이로드(Payload) 크기 검토
- 1,000명의 출입 기록이 누적된 시트에서 `A:G` 열 전체 텍스트 데이터의 용량:
  - 1행당 약 60 Byte x 1,000행 ≈ 60 KB (Gzip 압축 시 약 **12 KB**)
- 15초마다 12 KB를 다운로드하는 데 걸리는 시간: **0.02~0.05초 (CPU/네트워크 부하 전무)**.

---

## 5. 중복 방문 판정 기준 설계 (장소별 vs 전체 장소)

기아대책 세미나의 운영 방식에 맞춰 2가지 검증 모드를 유연하게 지원하도록 설계합니다:

1. **장소별 중복 (기본 모드 - Recommended)**:
   - 현재 설정된 장소(예: `입구` 탭)에 이미 등록되어 있는지를 검사.
   - 예: `입구`에서 체크인한 사람이 `입구`에 다시 오면 **"중복"**, 이후 식당이나 `행복한나눔` 부스에 처음 가면 **"정상"**.
   - API 호출: `GET /values/'${locationName}'!A2:G` (단 1개 탭 조회).
2. **행사 전체 중복 (글로벌 모드)**:
   - 시트 내 모든 탭(`입구`, `로비`, `식당` 등)을 통틀어 1번이라도 찍힌 적이 있는지 검사 (기념품 중복 수령 방지용 등).
   - API 호출: `GET /values:batchGet?ranges=입구!A2:G&ranges=로비!A2:G...` (1회의 HTTP 요청으로 모든 탭 일괄 수신).

---

## 6. 엣지 케이스 및 데이터 정합성 보장 방안

### 6.1 동시성 경합 (Race Condition in 15s Window)
- **상황**: 15초 폴링 주기 사이에 참석자 A가 게이트 1에서 찍고, 3초 뒤 게이트 2에서 찍는 경우.
- **분석**:
  1. 물리적으로 1명의 참석자가 15초 내에 다른 게이트로 이동하여 다시 스캔할 가능성은 현실적으로 극히 희박함.
  2. 만약 발생하더라도 구글 시트 자체에는 두 기록이 순서대로 모두 보존됨.
  3. **구글 시트 조건부 서식/수식 연동**:
     시트의 G열(중복방문여부)에 수식을 적용하거나 관리자용 중복 필터링을 병행하여 사후 데이터 정합성을 완벽히 보장.

### 6.2 오프라인 및 네트워크 일시 단절 시 Fallback
- 네트워크가 끊기면 백그라운드 폴링은 실패하지만, **기존에 받아둔 메모리 캐시 + 로컬 스캔 이력**을 바탕으로 중복 검사를 중단 없이 지속(Graceful Degradation).
- 네트워크가 복구되면 큐에 쌓인 데이터 전송과 동시에 시트의 최신 데이터를 다시 폴링하여 캐시를 즉시 동기화.

---

## 7. 상세 구현 명세 (Implementation Specification)

### 7.1 구글 시트 서비스 계층 (`googleSheetsService.ts`)
```typescript
/**
 * 특정 장소 탭(또는 전체)의 기존 출입 기록 전체 목록을 경량 조회
 */
public async fetchLocationRecords(
  spreadsheetId: string,
  locationName: string
): Promise<ScanRecord[]> {
  const rawId = this.extractSpreadsheetId(spreadsheetId);
  const locName = (locationName || '기본장소').trim();
  const accessToken = await this.authService.getValidAccessToken();

  // A2부터 G열(헤더 제외) 전체 고속 조회
  const encodedRange = encodeURIComponent(`'${locName}'!A2:G`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${rawId}/values/${encodedRange}?majorDimension=ROWS`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    if (res.status === 404 || res.status === 400) return []; // 시트가 비어있거나 탭이 아직 없는 경우
    throw new Error(`출입 데이터 동기화 실패 (${res.status})`);
  }

  const data = await res.json();
  const rows: string[][] = data.values || [];

  return rows.map((row) => ({
    affiliation: row[0] || '',
    title: row[1] || '',
    name: row[2] || '',
    tshirtSize: row[3] || '',
    location: row[4] || locName,
    scannedAt: row[5] || '',
    isDuplicate: row[6] === '중복',
    managementNumber: '', // 필요시 ID 추출
  }));
}
```

### 7.2 리더 메인 상태 머신 (`App.tsx` & `Scanner.tsx`)
1. **인메모리 캐시 Ref**:
   - `const sheetAttendeeCacheRef = useRef<Set<string>>(new Set());`
   - Key 규칙: `${r.affiliation}_${r.title}_${r.name}` 또는 `${r.managementNumber}`
2. **폴링 타이머 (15초)**:
   - 시트 연동 상태일 때 `setInterval(refreshSheetCache, 15000)` 가동.
3. **스캔 판정 로직 (`Scanner.tsx`)**:
   ```typescript
   // 1. 로컬 스캔 이력 또는 구글 시트 캐시 Set에 존재하는지 판정
   const key = payload.id ? `ID:${payload.id}` : `NAME:${payload.a}_${payload.t}_${payload.n}`;
   const alreadyRegistered = localScanHistory.has(key) || sheetAttendeeCache.has(key);
   
   // 2. 즉시 로컬 캐시에 등록 (연속 태깅 방어)
   sheetAttendeeCache.add(key);
   ```

---

## 8. 최종 결론 및 권장 구현 방향

1. **API 사용량 우려 해소**:
   - **"인메모리 캐시-퍼스트 + 15초 주기적 폴링"** 방식을 적용하면, 다중 노트북(10대) 동시 운영 시에도 **구글 API 허용량의 13% 미만만 사용**하여 429 에러가 원천 차단됩니다.
2. **스캔 0ms 반응성 유지**:
   - 스캔 시점에 네트워크 요청을 보내지 않으므로 현행의 초고속(0ms) 인식 및 즉각적인 사운드/팝업 반응성이 100% 유지됩니다.
3. **오프라인/온라인 매끄러운 호환**:
   - 오프라인일 때는 로컬 이력만으로 동작하고, 구글 시트 연동 시에는 시트 데이터가 로컬 캐시에 실시간 병합되어 완벽한 온·오프라인 하이브리드 중복 방어가 완성됩니다.
