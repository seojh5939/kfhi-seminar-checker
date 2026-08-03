# 💻 Environment v0.1 — Cross-Platform (macOS / Windows) 개발 환경 설정 가이드

**문서 버전**: v0.1  
**작성일**: 2026-08-03  
**상태**: 작성 완료  
**적용 대상**: macOS 및 Windows 10/11 개발자 환경

---

## 1. 개요 및 크로스 플랫폼 개발 목적

본 프로젝트(기아대책 행사 출입관리 QR 시스템)는 **macOS와 Windows 10/11 환경 모두에서 소스코드 수정, 실행, 테스트가 가능**해야 합니다.  
또한 최종 배포 타겟은 Windows 오프라인 PC이므로, 개발 과정에서 Windows 네이티브 패키징 및 웹캠 인식 동작 테스트를 신속하게 진행할 수 있도록 환경을 표준화합니다.

---

## 2. 필수 개발 환경 구성요소 (Prerequisites)

| 도구명 | 권장 버전 | 비고 / 설치 가이드 |
|---|---|---|
| **Node.js** | `v20.x LTS` 이상 | macOS: Homebrew 또는 nvm / Windows: 공식 인스톨러 |
| **pnpm** | `v9.x` 이상 | 모노레포 패키지 관리자 (`npm i -g pnpm`) |
| **Git** | `v2.40.x` 이상 | 줄바꿈(CRLF/LF) 및 한글 파일명 설정 필요 |
| **VS Code** | 최신 버전 | 권장 확장: ESLint, Prettier, TypeScript, Tailwind CSS |
| **C++ Build Tools** | (Windows 전용) | Native 네이티브 모듈 빌드용 (Visual Studio Build Tools - C++ Desktop Development) |

---

## 3. OS별 환경 설정 및 유의사항

### 3.1 Git 줄바꿈(LF / CRLF) 및 인코딩 설정
Windows와 macOS 간 코드가 이동할 때 줄바꿈 문자로 인한 Git Diff 혼선을 방지하기 위해 다음 명령어를 필수 실행합니다.

```bash
# macOS 환경
git config --global core.autocrlf input

# Windows 환경
git config --global core.autocrlf true
git config --global core.quotepath false  # 한글 파일명 깨짐 방지
```

### 3.2 경로 처리 개발 원칙 (Path Resolution)
- **금지**: 하드코딩된 하이픈/슬래시 경로 (`const p = "C:\\Users\\..."` 또는 `"docs/ai/..."`)
- **필수**: Node.js 내장 `path` 모듈 활용 (`path.join(__dirname, '..', 'shared')`)
- **Electron `app.getPath('userData')`**: OS별 로컬 디렉터리 자동 추상화 활용 (Windows: `%APPDATA%`, macOS: `~/Library/Application Support`)

### 3.3 Cross-Platform 환경변수 처리
CLI 명령 스크립트 실행 시 OS 간 환경변수 주입 차이를 극복하기 위해 **`cross-env`** 패키지를 의존성에 추가하여 사용합니다.
- 예시: `"dev": "cross-env NODE_ENV=development electron ."`

---

## 4. 프로젝트 초기화 및 개발 명령어 표준 (Commands)

```bash
# 1. 레포지토리 클론 및 이동
cd /Users/seojeonghan/Documents/GitHub/kfhi-seminar-checker

# 2. 모든 모노레포 의존성 일괄 설치 (Shared / Generator / Reader)
pnpm install

# 3. Shared 공통 모듈 빌드 (TypeScript 컴파일)
pnpm --filter shared build

# 4. QR 생성기 (Generator) 개발 서버 및 Electron 실행
pnpm --filter generator dev

# 5. QR 인식기 (Reader) 개발 서버 및 Electron 실행
pnpm --filter reader dev

# 6. 전체 단위 테스트 (Jest) 실행
pnpm test
```

---

## 5. Windows 배포 바이너리 빌드 방법

Windows 개발 환경 또는 macOS (Wine/Cross-build 환경)에서 Windows 전용 Portable / Installer 바이너리를 추출할 때 다음 명령을 사용합니다.

```bash
# Windows 전용 Generator 바이너리 빌드 (.exe)
pnpm --filter generator build:win

# Windows 전용 Reader 바이너리 빌드 (.exe)
pnpm --filter reader build:win
```

> **참고**: `electron-builder` 설정(`electron-builder.json`)에 Windows 타겟(`win: { target: ["portable", "nsis"] }`)을 명시하여 Windows 10/11 64-bit 전용 바이너리를 생성하도록 구성합니다.
