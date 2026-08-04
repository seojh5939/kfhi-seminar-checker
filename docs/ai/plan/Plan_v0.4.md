# 📐 Plan v0.4: Windows 패키징 체계 및 빌드 스크립트 설계

## 1. 개요
본 문서는 `generator` 및 `reader` 애플리케이션의 Windows (x64) 배포용 설치 파일(NSIS) 및 무설치 파일(Portable) 생성을 위한 `electron-builder` 설정 및 모노레포 명령어 구조를 정의한다.

## 2. 패키징 빌드 사양 (Packaging Architecture)

### 2.1 Reader 앱 패키징 구정 (`reader/package.json`)
- **appId**: `com.kfhi.reader`
- **productName**: `기아대책 출입관리 QR 인식기`
- **출력 디렉토리**: `reader/release/`
- **Target**: `nsis` (x64), `portable` (x64)
- **NSIS 옵션**:
  - `oneClick`: false (사용자 설치 경로 선택 가능)
  - `allowToChangeInstallationDirectory`: true
  - `createDesktopShortcut`: true
  - `createStartMenuShortcut`: true
  - `shortcutName`: `기아대책 QR 인식기`

### 2.2 Generator 앱 패키징 구성 (`generator/package.json`)
- **appId**: `com.kfhi.generator`
- **productName**: `기아대책 명찰 QR 생성기`
- **출력 디렉토리**: `generator/release/`
- **Target**: `nsis` (x64), `portable` (x64)
- **NSIS 옵션**:
  - `oneClick`: false
  - `allowToChangeInstallationDirectory`: true
  - `createDesktopShortcut`: true
  - `createStartMenuShortcut`: true
  - `shortcutName`: `기아대책 명찰 QR 생성기`

### 2.3 모노레포 통합 명령 체계 (`package.json`)
```json
{
  "scripts": {
    "package:win:reader": "pnpm --filter reader package:win",
    "package:win:generator": "pnpm --filter generator package:win",
    "package:win:all": "pnpm build:shared && pnpm package:win:generator && pnpm package:win:reader"
  }
}
```

## 3. 검증 전략 (Verification Plan)
- `pnpm package:win:reader` 및 `pnpm package:win:generator` 실행 후 각 `release/` 폴더 내에 `.exe` 및 `Setup .exe` 아티팩트 생성을 확인한다.
