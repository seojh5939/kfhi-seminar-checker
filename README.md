# 🕊️ 기아대책 행사 출입관리 & 명찰 QR 시스템 (KFHI Seminar Checker)

> **기아대책 오프라인 행사/세미나/부스 참석자 800명 데스크톱 출입관리 및 콤팩트 명찰 QR 생성 모노레포 프로젝트**

---

## 📌 개요 (Project Overview)

본 프로젝트는 기아대책 오프라인 세미나 및 부스에서 구형 노트북(예: LG Gram 등)의 낮은 웹캠 해상도 및 노이즈 환경에서도 **100~200ms 이내의 초고속 스캔**을 수행하고, 안전한 암호화 데이터 기반으로 출입 기록 및 참석자 카운팅을 관리하는 데스크톱 전용 시스템입니다.

---

## 🏗️ 모노레포 구조 (Monorepo Architecture)

```text
kfhi-seminar-checker/
├── shared/       # 공통 콤팩트 암복호화(AES-256-GCM + Base64URL) 및 데이터 모델
├── generator/    # 참석자 엑셀 기반 콤팩트 명찰 QR 배치 생성 데스크톱 앱 (Electron + React)
└── reader/       # 초고속 WASM QR 스캔 및 현장 출입 관리 데스크톱 앱 (Electron + React + WASM)
```

---

## ⚡ 핵심 기술 사양 & 성능 최적화

### 1. 🔑 콤팩트 암복호화 (Compact Crypto Engine)
- **Base64URL 바이너리 패킹**: 암호문 길이를 **160자 ➡️ 55자(65% 감축)**로 획기적으로 줄여, 명찰 출력 시 QR코드 셀 크기를 극대화하고 저해상도 카메라 시인성을 확보했습니다.
- **Electron Main IPC 복호화**: Vite 렌더러 스레드의 Node.js `crypto` 모듈 비호환 크래시 문제를 해결하기 위해, 복호화 연산을 Main Process IPC(`reader:decrypt-payload`)로 안전하게 분리 이관했습니다.

### 2. 🚀 WASM 초고속 ROI 스캔 (200ms Target)
- **중앙 ROI (250x250) dobrze Crop 기법**: 비디오 전체 640x480 프레임을 디코딩하는 대신, 중앙 250x250 오버레이 영역만잘라내어 WASM 엔진으로 전달합니다.
- CPU 연산량이 **70% 감소**되어 구형 노트북 웹캠에서도 100~200ms 이내에 즉각 인식됩니다.

---

## 🌟 주요 기능 (Key Features)

### 🎵 1. 스마트 오디오 피드백 & 전면 팝업 UX
- **최초 정상 입장 (`SUCCESS`)**:
  - 하이패스 통과 띵-동 2음계 사운드 재생 + `"🎉 [입장 완료] 홍길동 님 환영합니다!"` 대형 팝업 모달.
- **중복 입장 (`DUPLICATE`)**:
  - 부스/세미나 재방문자를 반기는 부드럽고 따뜻한 2단 환영음(F5 ➡️ A5) 재생.
  - `"😊 또 오셨네요! 환영합니다! (이미 출입 완료 - 홍길동님)"` 팝업 & 밝은 황금빛(Amber Gold `#b45309`) 테마 적용.
  - 유니크 참석자 수 실시간 카운트에서 중복 건은 자동으로 제외.
- **인식 실패 (`ERROR`)**:
  - 묵직한 2단 삐-삐 경고음 재생 + `"등록되지 않은 QR입니다. 안내데스크에 방문 부탁드립니다."` 안내 팝업.

### ⏱️ 2. 스마트 3초 Cooldown 디바운스
- 동일한 QR 코드가 계속 카메라에 대어져 있을 경우 **3초 동안 연속 팝업 및 경고음 연사를 차단(Cooldown)**합니다.
- 첫 QR 스캔 후 다른 QR 코드가 감지되면 **3초 대기 없이 0ms 반응으로 즉시 새로운 스캔을 진행**합니다.

### ⚙️ 3. 설정 모달 & 🔒 관리자 보안 인증 (`2026-NDS`)
- 우상단 **⚙️ 설정** 버튼 및 설정 모달 내 좌상단 **`⬅️ 뒤로가기`** 버튼 제공.
- **CSV 내보내기 및 QR 인증내역 초기화** 진행 시 관리자 비밀번호(**`2026-NDS`**) 필수 검증.
- **📍 장소 변경 시 바탕화면 자동 백업**:
  - 장소 변경 시 이전 방문 기록이 **`방문기록_장소명_년월일시분초.csv`** 규격으로 바탕화면(Desktop)에 자동 저장된 후, 이전 데이터가 안전하게 초기화됩니다.
- **버전 표기**: `reader/package.json`과 연동되어 설정 모달 최하단에 **`기아대책 QR 인식기 v1.0.0`** 표기.

### 📷 4. 카메라 ON/OFF & 장치 선택 드롭다운 (Device Selector)
- **`[ 🟢 카메라 ON / 🔴 카메라 OFF ]`** 스위치 제공 (OFF 시 웹캠 스트림 완전히 닫힘).
- 내장 웹캠/외장 USB 카메라 등 연결된 카메라는 드롭다운으로 즉시 스위칭 가능하며, 선호 카메라가 `localStorage`에 자동 저장됩니다.

### 🎨 5. 100% 풀스크린 디자인
- 모니터 창 전체 테두리 여백 없이 다크 네이비(`#0f172a`) 배경색으로 꽉 채워진 100% 풀스크린 UX 제공.

---

## 🛠️ 개발 및 실행 가이드 (Development Guide)

### 1. 의존성 패키지 설치
```bash
pnpm install
```

### 2. 개발 모드 실행 (Dev Server)
- **QR 인식기(Reader) 앱 실행**:
  ```bash
  pnpm dev:reader
  # 또는 Electron 포함 구동: pnpm start:reader
  ```
- **QR 생성기(Generator) 앱 실행**:
  ```bash
  pnpm dev:generator
  # 또는 Electron 포함 구동: pnpm start:generator
  ```

### 3. 전체 모노레포 컴파일 테스트
```bash
pnpm build:all
```

---

## 📦 Windows 실행 및 설치 파일 배포 가이드 (Release Guide)

Electron Builder를 이용해 Windows (x64) 배포용 **NSIS 대화형 설치 마법사 (`Setup .exe`)** 및 **Portable 무설치 실행 파일 (`.exe`)**을 자동으로 패키징합니다.

### 1. 인식기(Reader) 윈도우 설치 파일 생성
```bash
pnpm package:win:reader
```
- 📁 **생성 위치**: `reader/release/기아대책 출입관리 QR 인식기 Setup 1.0.0.exe`

### 2. 생성기(Generator) 윈도우 설치 파일 생성
```bash
pnpm package:win:generator
```
- 📁 **생성 위치**: `generator/release/기아대책 명찰 QR 생성기 Setup 1.0.0.exe`

### 3. 전체 앱 일괄 윈도우 설치 파일 생성 (추천)
```bash
pnpm package:win:all
```
- 📁 생성된 `release/` 폴더 내의 **`Setup 1.0.0.exe`** 파일만 현장 담당자에게 배포하면 됩니다.

---

## 📜 라이선스 (License)
본 프로젝트는 **한국기아대책(KFHI)** 오프라인 행사 및 출입 관리를 전용 목적으로 제작되었습니다.
