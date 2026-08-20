# 🔬 Research Report v1.2 — 클라이언트 직접 구글 스프레드시트 실시간 연동 기술 연구

**문서 버전**: v1.2  
**작성일**: 2026-08-20  
**상태**: 연구 완료 (Research Complete)  
**대상 모듈**: `reader` (QR 인식기), `shared`

---

## 1. 개요 및 요구사항 분석

별도의 백엔드 웹 서버 없이, **Electron 데스크톱 클라이언트(QR 인식기)에서 직접 Google Workspace(조직 계정)와 연동**하여 출입 기록을 구글 스프레드시트에 실시간으로 기록하는 기능에 대한 기술적 실현 가능성을 검토하고 최적의 아키텍처를 설계합니다.

### 1.1 핵심 요구사항
1. **별도 서버 없는 클라이언트 직접 연동**: Electron 메인/렌더러 프로세스에서 Google Sheets API v4 및 Drive API v3 직접 호출.
2. **장소별 시트(Worksheet/Tab) 자동 생성 및 분리**:
   - 예: 장소명이 `입구`, `행복한나눔` 등 N개일 때, 스프레드시트 내에 해당 장소명으로 시트 탭이 각각 자동 생성/연동.
3. **일관된 데이터 규격**: 기존 엑셀/CSV 생성 및 내보내기 포맷과 100% 동일한 헤더 및 행 구조로 데이터 누적.
4. **조직 계정(Google Workspace) OAuth 2.0 인증 플로우**:
   - 조직 계정 로그인 ➡️ 권한 승인 ➡️ 내 드라이브의 스프레드시트 목록 조회 및 선택 (또는 신규 생성) ➡️ 장소별 실시간 기록.

---

## 2. 기술적 실현 가능성 검토 (Technical Feasibility: 100% 가능)

### 2.1 결론 요약
- **결론**: **100% 구현 가능하며 현장 환경에 매우 적합합니다.**
- 별도 데이터베이스나 중계 서버를 구축/운영할 필요 없이, Google의 공식 REST API(`googleapis` 또는 경량 `fetch/axios`)를 활용하여 완전한 서버리스(Client-to-Google) 방식으로 동작합니다.

---

## 3. 세부 기술 아키텍처 및 설계

```mermaid
flowchart TD
    subgraph Client [Electron QR 인식기 Client]
        OAuth[Google OAuth 2.0 Loopback Auth]
        Drive[Drive API: 시트 목록 조회/선택]
        Queue[Local Queue & Storage (Zero-Loss)]
        Sync[Google Sheets API Sync Worker]
    end

    subgraph GoogleCloud [Google Cloud / Workspace]
        AuthSrv[Google Accounts Auth]
        DriveSrv[Google Drive API v3]
        SheetsSrv[Google Sheets API v4]
        TargetSheet[(선택된 Google Spreadsheet)]
    end

    OAuth -->|1. 로그인 요청| AuthSrv
    AuthSrv -->|2. Access/Refresh Token| OAuth
    Drive -->|3. 시트 목록 요청| DriveSrv
    DriveSrv -->|4. 스프레드시트 목록| Drive
    Queue -->|5. 스캔 즉시 로컬 저장| Queue
    Sync -->|6. 장소 탭 확인/자동 생성| SheetsSrv
    Sync -->|7. values.append (실시간 행 추가)| SheetsSrv
    SheetsSrv --> TargetSheet
```

---

### 3.1 Google OAuth 2.0 인증 메커니즘 (No-Server Loopback Flow)

Electron과 같은 데스크톱 애플리케이션을 위한 Google 표준 인증 방식인 **RFC 8252 (OAuth 2.0 for Native Apps - Loopback Interface)**를 적용합니다.

1. **인증 시작**:
   - 사용자가 인식기 설정 또는 상단 바에서 **[구글 계정 로그인]** 클릭.
   - Electron 메인 프로세스가 임시 로컬 루프백 서버(`http://127.0.0.1:포트`)를 1회성으로 구동.
2. **시스템 기본 브라우저 열기**:
   - `shell.openExternal(authUrl)`을 통해 시스템 기본 웹 브라우저(Chrome/Edge 등)에서 구글 로그인 및 권한 승인 화면을 표시.
   - *(Google은 보안상 Electron 내부 임베디드 웹뷰 로그인을 차단하므로, 외부 브라우저를 통한 Loopback 방식이 필수이자 표준 규격입니다.)*
3. **토큰 획득 및 로컬 서버 종료**:
   - 로그인 완료 시 `http://127.0.0.1:포트/?code=AUTH_CODE`로 콜백.
   - 로컬 서버가 Auth Code를 수신하여 `access_token` 및 `refresh_token`으로 교환 후 로컬 서버 즉시 정상 종료.
4. **토큰 영속성 & 자동 갱신**:
   - `refresh_token`을 로컬 보안 스토리지에 저장하여, 이후 앱을 껐다 켜도 재로그인 없이 토큰이 자동 갱신(Refresh)되도록 지원.
5. **조직 계정(Workspace) 권한 범위(Scopes)**:
   - `https://www.googleapis.com/auth/spreadsheets`: 스프레드시트 읽기/쓰기/생성
   - `https://www.googleapis.com/auth/drive.readonly` (또는 `drive.file`): 사용자의 스프레드시트 목록 탐색용

---

### 3.2 스프레드시트 및 장소별 시트(탭) 자동 관리

#### A. 스프레드시트 선택 및 신규 생성
- **시트 목록 검색**: Google Drive API `files.list` 쿼리(`mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`)로 사용자가 접근 가능한 파일 목록을 가져와 드롭다운으로 표시.
- **신규 생성 옵션**: [새 출입기록 시트 생성] 버튼을 누르면 `2026_기아대책_행사_출입기록` 명칭으로 즉시 자동 생성 가능.

#### B. 장소별 시트 탭(Worksheet) 자동 감지 및 생성
- 사용자가 인식기에서 **장소명(예: `입구`, `행복한나눔`)**을 입력하거나 변경할 때:
  1. `spreadsheets.get` API로 현재 스프레드시트에 존재하는 탭(Sheet Title) 목록을 조회.
  2. 해당 장소명의 탭이 없으면 `spreadsheets.batchUpdate` (`AddSheetRequest`)로 **새 탭을 즉시 자동 생성**.
  3. 새 탭의 1행(헤더)에 표준 컬럼을 자동 입력 및 서식(굵은 글씨, 중앙 정렬, 연회색 배경) 적용:
     ```
     [ 이사회명 | 직함 | 성명 | 티셔츠사이즈 | 방문장소 | 방문시각 | 중복방문여부 ]
     ```
  4. 기본 기본 탭(`Sheet1` 또는 `시트1`)이 비어있는 경우 장소명으로 자동 이름 변경 가능.

---

### 3.3 실시간 데이터 동기화 및 무손실(Zero-Loss) 큐 설계

현장 행사장 네트워크(Wi-Fi/테더링)의 일시적 끊김이나 지연에도 **데이터 유실 0%** 및 **초고속 스캔 반응 속도**를 보장하기 위해 **Local-First & Background Sync Queue** 방식을 채택합니다.

1. **스캔 처리 흐름 (UI 블로킹 없음)**:
   - QR 스캔 즉시 로컬 메모리/스토리지에 저장 ➡️ UI에 팝업 및 출입 성공 즉시 표출 (0ms 지연).
   - 동시에 백그라운드 **Sync Queue**에 스캔 레코드 Push.
2. **구글 시트 행 추가 API (`spreadsheets.values.append`)**:
   - Range: `'[장소명]'!A:G`
   - ValueInputOption: `USER_ENTERED`
   - Body Values:
     ```json
     [
       [
         "서울후원이사회",
         "회장",
         "홍길동",
         "100",
         "입구",
         "2026-08-20 14:30:15",
         "정상"
       ]
     ]
     ```
3. **네트워크 에러 / 오프라인 복구**:
   - 오프라인 상태일 때는 큐에 쌓아두고 상단 바에 `🟡 동기화 대기중: N건` 표시.
   - 네트워크 연결이 복구되면 누적된 레코드를 묶음(`Batch Append`)으로 자동 재전송 후 `🟢 구글 시트 동기화 완료` 상태로 복귀.

---

### 3.4 다중 기기(Multi-Device) 동시 스캔 동시성 검토

- **시나리오**:
  - 노트북 A: `입구` 장소에서 스캔
  - 노트북 B: `입구` 장소에서 동시 스캔
  - 노트북 C: `행복한나눔` 장소에서 스캔
- **Google Sheets 동작 특성**:
  - Google Sheets API의 `values.append` 엔드포인트는 서버사이드에서 원자적(Atomic)으로 테이블 맨 마지막 빈 행을 찾아 Insert하므로, **여러 대의 노트북에서 동시에 기록을 쏘아도 데이터 충돌/덮어쓰기 없이 순서대로 온전하게 쌓입니다.**
  - 서로 다른 장소는 각 장소 탭(`입구` 탭, `행복한나눔` 탭)에 독립적으로 기록되므로 완벽히 분리됩니다.

---

### 3.5 Google API 할당량(Quota) 및 성능 검토

| 항목 | Google API Quota 기준 | 본 시스템 예상 사용량 | 여유도 |
| :--- | :--- | :--- | :--- |
| **프로젝트당 읽기/쓰기** | 분당 300회 | 10대 동시 운영 시 분당 약 30~60회 | **충분 (안전)** |
| **사용자당 분당 쓰기** | 분당 60회 (단일 토큰 기준) | 단일 기기당 분당 10~30회 | **충분 (안전)** |
| **최적화 기법** | 0.5초 디바운스 배치 묶음 전송 | 스캔이 몰릴 경우 2~3건을 1회 호출로 묶음 처리 가능 | **할당량 70% 이상 절감 가능** |

---

## 4. UI / UX 플로우 설계

1. **상단 Header Bar 연동 상태 표시**:
   - `[ 📊 구글 시트: 미연동 / 로그인 필요 ]` 또는 `[ 📊 시트: 2026_기아대책_출입기록 (🟢 실시간 연동 중) ]`
2. **설정 모달 내 '구글 스프레드시트 연동' 섹션**:
   - **Google 계정 로그인/로그아웃**: 현재 로그인된 계정 표시 (`user@kfhi.or.kr`)
   - **연동할 스프레드시트 선택**:
     - 드롭다운: 내 드라이브의 시트 목록 (`[선택하세요]` / `2026 희망친구 기아대책 세미나 출입관리`)
     - [➕ 새 스프레드시트 만들기] 버튼
     - [🔗 웹에서 시트 바로 열기] 버튼
   - **실시간 동기화 On/Off 토글**

---

## 5. Google Cloud Console 필수 사전 준비 사항

조직 계정(Google Workspace) 환경에서 사용하기 위해 필요한 1회성 설정:
1. **Google Cloud Console 프로젝트 생성** (예: `kfhi-seminar-qr`)
2. **API 사용 설정**:
   - `Google Sheets API` 활성화
   - `Google Drive API` 활성화
3. **OAuth 동의 화면 설정**:
   - 사용자 유형: **내부(Internal)** 선택 *(조직 내 계정만 접근 허용되어 별도 구글 검수 불필요)*
   - 앱 이름: `기아대책 QR 출입관리기`
4. **OAuth 2.0 클라이언트 ID 생성**:
   - 애플리케이션 유형: **데스크톱 앱 (Desktop App)**
   - 발급된 `Client ID` 및 `Client Secret`을 앱 설정에 등록 (또는 환경설정 파일로 관리)

---

## 6. 비용 및 과금 정책 검토 (Pricing & Cost Analysis)

### 6.1 과금 발생 여부: **100% 완전 무료 (비용 0원)**

| 항목 | 과금 여부 | 상세 내용 |
| :--- | :--- | :--- |
| **Google Sheets API v4** | **무료 (0원)** | Google에서 별도 사용료를 부과하지 않는 무료 API |
| **Google Drive API v3** | **무료 (0원)** | 파일 목록 조회/탐색 무료 API |
| **GCP 결제 계정(신용카드)** | **등록 불필요** | Sheets/Drive API는 Billing Account 연결 없이 사용 가능 |
| **Google Workspace 조직 계정** | **추가 비용 없음** | 기존 사용 중인 계정 저장 공간 내에서 동작 |

### 6.2 구글의 정책 (비용 과금이 아닌 '호출 제한(Quota)' 방식)
- Google Maps나 번역/AI API와 달리, Google Sheets API는 **호출당 요금이 발생하는 유료 API가 아닙니다.**
- 구글은 비용 청구 대신 **분당 호출 횟수 제한(무료 쿼터: 분당 300회)**으로 남용을 방지합니다.
- 따라서 스캔이 아무리 많이 발생해도 **금전적 요금이 부과될 가능성은 0%**입니다.
- **물리적 차단 방안**: Google Cloud Console에서 프로젝트 생성 시 **결제 계정(Billing Account)을 아예 연결하지 않고 생성**하면, 구글 정책상 유료 과금 자체가 물리적으로 불가능합니다.

---

## 7. 결론 및 구현 추천 로드맵

- **타당성**: 모든 요구조건이 기술적으로 100% 충족되며, **비용이 전혀 발생하지 않는 완전 무료(Free-tier) 환경**에서 운영 가능합니다.
- **다음 단계**:
  1. `shared` 또는 `reader`에 Google Auth / Sheets Client 서비스 모듈 구현
  2. Electron 메인 프로세스에 Loopback OAuth 핸들러 및 Sheets IPC API 추가
  3. `reader` UI에 구글 로그인, 시트 선택, 실시간 동기화 인디케이터 및 오프라인 큐 렌더링 추가
  4. 다중 장소 탭 생성 및 실시간 Append 테스트
