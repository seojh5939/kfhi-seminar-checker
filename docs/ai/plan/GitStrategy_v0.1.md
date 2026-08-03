# 🌿 Git Strategy v0.1 — Git 브랜치 및 커밋 컨벤션 가이드

**문서 버전**: v0.1  
**작성일**: 2026-08-03  
**상태**: 작성 완료  
**적용 대상**: 전체 프로젝트 형상관리 규칙

---

## 1. 브랜치 전략 (Git Branch Strategy)

본 프로젝트는 **`develop` 및 `feature/*` 중심의 Git Flow 변형 아키텍처**를 사용합니다.

```
main (릴리스/배포)  ---------------------------------------------> [v1.0.0 Tag]
                       \                                        /
develop (개발통합)     --------*-------------------*-----------*
                                \                 /           /
feature/* (기능개발)             \--[feature/...]--/           /
                                                              /
hotfix/* (긴급수정)    ---------------------------------------/
```

### 1.1 브랜치 역할 및 명명 규칙

| 브랜치 종류 | 브랜치명 규칙 | 설명 | 병합 타겟 (Target) |
|---|---|---|---|
| **Main** | `main` | 배포 준비 완료된 최상위 프로덕션 브랜치 (태깅 관리) | - |
| **Develop** | `develop` | 기능들이 통합되는 최신 개발 상태 브랜치 | `main` |
| **Feature** | `feature/{기능명}` | 단일 기능 단위 개발 브랜치 (예: `feature/monorepo-shared`) | `develop` |
| **Hotfix** | `hotfix/{이슈명}` | 운영 중 발견된 긴급 버그 수정 브랜치 | `main` & `develop` |

---

## 2. 작업 워크플로우 (Working Workflow)

1. **`develop` 브랜치 최신화**:
   ```bash
   git checkout develop
   git pull origin develop
   ```

2. **단위 기능 브랜치 생성 (`feature/*`)**:
   ```bash
   git checkout -b feature/monorepo-shared
   ```

3. **기능 구현 및 커밋 (한글 커밋 메시지)**:
   ```bash
   git add .
   git commit -m "feat: shared 암복호화 AES-256-GCM 모듈 작성"
   ```

4. **`develop` 브랜치로 기능 병합 (Merge)**:
   ```bash
   git checkout develop
   git merge feature/monorepo-shared
   git push origin develop
   ```

---

## 3. 커밋 메시지 한글 컨벤션 (Commit Convention)

모든 커밋 메시지는 **한글로 작성**하며, 아래 앵커 태그 규칙을 준수합니다.

- **`feat`**: 새로운 기능 추가 (예: `feat: reader 카메라 QR 디바운스 처리 추가`)
- **`fix`**: 버그 수정 (예: `fix: 엑셀 파일 한글 깨짐 방지 BOM 추가`)
- **`docs`**: 문서 작성 및 수정 (예: `docs: Git 브랜치 전략 문서 추가`)
- **`refactor`**: 코드 리팩토링 및 구조 개선 (성능 향상, SOLID 준수)
- **`test`**: 테스트 코드 작성 및 검증 (예: `test: AES256GCM 유닛 테스트 구현`)
- **`chore`**: 패키지 설정, 빌드 스크립트 수정 (`package.json` 등)
