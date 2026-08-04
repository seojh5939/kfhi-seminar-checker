# 🌿 Git Strategy v0.2 — Git 브랜치, PR 및 커밋 컨벤션 가이드

**문서 버전**: v0.2  
**작성일**: 2026-08-04  
**상태**: 개정 완료  
**변경 사유**: 로컬 직병합(Direct Merge) 금지 및 GitHub Pull Request(PR) 필수 규칙 추가

---

## 0. 형상 관리 필수 원칙 (Ground Rules)

> 🚨 **[핵심 원칙] 로컬 직병합 (Direct Merge) 절대 금지 & GitHub PR 필수**

1. **로컬 direct merge 금지**: AI 보조도구 및 개발자는 작업 완료 시 `develop` 브랜치에 `git merge`를 로컬에서 직접 수행해서는 안 된다.
2. **Pull Request (PR) 필수**: 모든 기능 구현은 단위 기능 브랜치(`feature/*`)에서 진행 후 원격 레포지토리에 푸시(`git push origin feature/*`)하고, GitHub에서 PR을 생성하여 사용자의 검토/승인을 거쳐 병합(Merge)한다.

---

## 1. 브랜치 전략 (Git Branch Strategy)

본 프로젝트는 **`develop` 및 `feature/*` 중심의 Git Flow 변형 아키텍처**를 사용합니다.

```
main (릴리스/배포)  ---------------------------------------------> [v1.0.0 Tag]
                       \                                        /
develop (개발통합)     --------*-------------------*-----------*
                                \                 / (PR Merge) /
feature/* (기능개발)             \--[feature/...]--/           /
                                                               /
hotfix/* (긴급수정)    ---------------------------------------/
```

### 1.1 브랜치 역할 및 명명 규칙

| 브랜치 종류 | 브랜치명 규칙 | 설명 | 병합 방식 (Merge Method) |
|---|---|---|---|
| **Main** | `main` | 배포 준비 완료된 최상위 프로덕션 브랜치 (태깅 관리) | PR 승인 후 병합 |
| **Develop** | `develop` | 기능들이 통합되는 최신 개발 상태 브랜치 | PR 승인 후 병합 (로컬 직병합 금지) |
| **Feature** | `feature/{기능명}` | 단일 기능 단위 개발 브랜치 (예: `feature/generator-ui`) | PR 생성 후 `develop`에 병합 |
| **Hotfix** | `hotfix/{이슈명}` | 운영 중 발견된 긴급 버그 수정 브랜치 | PR 생성 후 `main` & `develop` 병합 |

---

## 2. 작업 워크플로우 (Working Workflow)

1. **`develop` 브랜치 최신화**:
   ```bash
   git checkout develop
   git pull origin develop
   ```

2. **단위 기능 브랜치 생성 (`feature/*`)**:
   ```bash
   git checkout -b feature/generator-ui
   ```

3. **기능 구현 및 커밋 (한글 커밋 메시지)**:
   ```bash
   git add .
   git commit -m "feat: generator Electron Main 및 React UI 구현"
   ```

4. **원격 푸시 및 Pull Request (PR) 생성**:
   ```bash
   git push -u origin feature/generator-ui
   ```
   * **[필수]** GitHub 웹/CLI에서 `develop` 브랜치를 대상(Base)으로 하는 Pull Request를 생성합니다.
   * **[필수]** 사용자가 PR 내용을 리뷰하고 승인(Approve) 및 Merge를 진행합니다.

---

## 3. 커밋 메시지 한글 컨벤션 (Commit Convention)

모든 커밋 메시지는 **한글로 작성**하며, 아래 앵커 태그 규칙을 준수합니다.

- **`feat`**: 새로운 기능 추가 (예: `feat: reader 카메라 QR 디바운스 처리 추가`)
- **`fix`**: 버그 수정 (예: `fix: 엑셀 파일 한글 깨짐 방지 BOM 추가`)
- **`docs`**: 문서 작성 및 수정 (예: `docs: Git 브랜치 및 PR 전략 문서 개정`)
- **`refactor`**: 코드 리팩토링 및 구조 개선 (성능 향상, SOLID 준수)
- **`test`**: 테스트 코드 작성 및 검증 (예: `test: AES256GCM 유닛 테스트 구현`)
- **`chore`**: 패키지 설정, 빌드 스크립트 수정 (`package.json` 등)
