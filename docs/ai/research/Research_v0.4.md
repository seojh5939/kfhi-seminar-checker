# 🔬 Research v0.4: Windows 패키징 체계 구축 (NSIS & Portable)

## 1. 요구사항 분석 (Requirements)
- 기아대책 출입관리 시스템의 2개 데스크톱 애플리케이션(`generator`, `reader`)을 Windows 운영체제 환경에서 동작 가능한 실행 파일(`.exe`) 및 설치 파일(Installer)로 빌드하는 체계를 구축한다.

## 2. 미확정 사항 및 가정 선언 (Assumptions)
- **Assumption 1**: 현장 노트북 환경은 **Windows 10/11 64-bit (x64)**를 표준으로 한다.
- **Assumption 2**: 배포 아티팩트는 다음 2가지 형태를 동시에 지원한다.
  - **NSIS 설치형 (`.exe`)**: 설치 경로 지정, 바탕화면 및 시작 메뉴 바로가기 자동 생성.
  - **Portable 무설치형 (`.exe`)**: 별도 설치 없이 단일 실행 파일 형태로 즉시 실행 가능.
- **Assumption 3**: macOS 개발 환경에서 `electron-builder --win nsis portable` 명령을 통해 교차 컴파일(Cross-compilation)하여 윈도우 실행 아티팩트를 정상 추출할 수 있다.

## 3. 위험 요소 분석 (Risk Analysis)
| Level | Risk Description | Impact | Mitigation Strategy |
|:---|:---|:---|:---|
| Low | macOS에서 `electron-builder` 교차 패키징 시 Wine 미설치 경고 발생 가능성 | 운영/배포 | `electron-builder` 내장 툴체인을 활용하여 x64 아티팩트 빌드 보장 |
| Low | 대용량 이진 바이너리 릴리즈 생성 시 빌드 시간 증가 | 빌드 성능 | 모노레포 개별 필터 명령(`pnpm package:win:reader`, `pnpm package:win:generator`) 분리 제공 |

## 4. 후보 옵션 검토 (Candidates)
- **Option A**: `electron-builder` 활용 (NSIS + Portable target 지정) — **채택**
- **Option B**: `electron-forge` 활용
