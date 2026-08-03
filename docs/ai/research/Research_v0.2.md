# 🔬 Research v0.2 — 기아대책 행사 출입관리 QR 시스템 (기술 스택 확정)

**문서 버전**: v0.2  
**작성일**: 2026-08-03  
**상태**: Research 완료 (기술 스택 확정 및 모노레포 구조 승인)

---

## 1. 요구사항 재정의 및 최종 확정사항

본 프로젝트는 오프라인 환경에서 동작하는 약 800명 규모의 출입관리 **Windows 데스크톱 애플리케이션 2종 (QR코드 생성기, QR코드 인식기)** 개발 프로젝트이다.

- **QR코드 생성기 (Generator)**: 관리자 PC 1대에 설치/배포. 명단 Excel 입력 -> AES-256-GCM 암호화 QR 생성 -> 파일명/소속별 폴더 분류 및 매니페스트 CSV 생성.
- **QR코드 인식기 (Reader)**: 출입 지점 PC N대에 배포. 로컬 장소 등록 -> 웹캠 QR 스캔/복호화 -> 중복 검증/환영 안내 -> 로컬 DB 및 방문기록 CSV 저장/추출.
- **운영 방식**: N대 인식기 데이터는 통합 서버 없이 스탭이 CSV 추출 후 관리자가 엑셀로 수동 취합.

---

## 2. 확정된 기술 스택 (Official Tech Stack)

- **프레임워크**: **Electron + TypeScript**
- **모노레포 패키지 매니저**: `pnpm` (또는 `npm`) Workspaces
- **UI 라이브러리**: React + HTML/CSS
- **카메라 제어 API**: HTML5 `getUserMedia` / WebRTC MediaDevices API
- **암호화 라이브러리**: Node.js `crypto` (AES-256-GCM 대칭키)
- **패키징 툴**: `electron-builder` (Portable .exe / NSIS Installer)

---

## 3. 모노레포 아키텍처 및 독립 프로그램 배포 구조

단일 Git 레포지토리 안에서 공통 로직을 공유하되, **2개의 완전 독립된 EXE 바이너리**를 산출하는 구조를 갖춘다.

```
/ (Monorepo Root)
├── package.json
├── pnpm-workspace.yaml
├── docs/
│   └── ai/
│       ├── research/
│       │   ├── Research_v0.1.md
│       │   └── Research_v0.2.md (본 문서)
│       └── plan/
├── shared/                   # 공용 패키지 (암복호화, Data Schema, Constants)
│   ├── src/
│   │   ├── crypto/           # AES-256-GCM 모듈
│   │   ├── types/            # Attendee, ScanRecord, Manifest 타입 정의
│   │   └── constants/        # 공통 비밀키 상수 등
│   └── package.json
├── generator/                # QR코드 생성기 전용 Electron 애플리케이션
│   ├── src/
│   │   ├── main/             # Electron Main Process (Excel 파일 처리, QR 이미지 대량 인코딩)
│   │   └── renderer/         # 생성기 관리자 UI (Excel 업로드, 검증 리포트, 생성 진행바)
│   ├── package.json          # name: "kfhi-qr-generator"
│   └── electron-builder.json # Generator 전용 독립 EXE 빌드 설정
└── reader/                   # QR코드 인식기 전용 Electron 애플리케이션
    ├── src/
    │   ├── main/             # Electron Main Process (SQLite/로컬 DB 파일 관리, CSV 내보내기)
    │   └── renderer/         # 인식기 스탭 UI (카메라 스캔 화면, 팝업 알림, 설정)
    ├── package.json          # name: "kfhi-qr-reader"
    └── electron-builder.json # Reader 전용 독립 EXE 빌드 설정
```

### 독립 배포 흐름
1. `shared` 패키지는 코드 컴파일 시점에 `generator`와 `reader` 각각에 정적으로 포함(Bundled)됩니다.
2. `generator` 패키지에서 빌드 실행 시 ➡️ **`QR-Generator-Portable.exe`** (관리자 PC 1대 전용) 산출물 생성.
3. `reader` 패키지에서 빌드 실행 시 ➡️ **`QR-Reader-Portable.exe`** (현장 출입 지점 PC N대 전용) 산출물 생성.
4. 인식기 바이너리에는 생성기 UI나 엑셀 파싱 코드 등이 일체 들어가지 않으므로 완전 독립된 가벼운 프로그램으로 동작합니다.

---

## 4. Research 종료 조건 점검 (Gate Passed)
- [x] 요구사항 재정의 완료
- [x] 미확정 사항 및 Assumptions 정리 완료
- [x] 위험 요소 식별 및 오프라인 배포 시나리오 수립
- [x] **기술 스택 확정 (Electron + TypeScript)**
- [x] **모노레포 2종 독립 바이너리 구조 수립 완료**
