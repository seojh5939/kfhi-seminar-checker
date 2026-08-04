# 🌿 Git Strategy v0.3 — Git 브랜치, PR 필수 및 AI 워크플로우 규칙

**문서 버전**: v0.3  
**작성일**: 2026-08-04  
**상태**: 최종 확정 (AI 자동 참조 및 개발 워크플로우 강제 지침)  
**변경 사유**: `develop` 부모 브랜치 기반 `feature/*` 생성, Direct Merge 절대 금지 및 GitHub PR 생성 워크플로우 명시적 선언

---

## 0. 개발 형상 관리 절대 원칙 (AI Ground Rules)

> 🚨 **[필수 준수 지침] AI는 모든 구현 시작 전 항상 본 문서를 자동 참조하며 다음 수칙을 100% 강제 준수합니다.**

1. **`develop` 기반 기능 브랜치 생성**: 모든 작업은 반드시 `develop` 브랜치를 부모(Parent)로 하여 `feature/{기능명}` 형태의 단위 기능 브랜치를 생성(`git checkout -b feature/...`)한 뒤 시작합니다.
2. **로컬 직병합 (Direct Merge) 절대 금지**: `develop` 또는 `main` 브랜치에 로컬에서 `git merge` 명령을 직접 수행하는 행위를 엄격히 금지합니다.
3. **GitHub Pull Request (PR) 필수 생성**: 기능 개발 및 테스트가 완료되면 해당 `feature` 브랜치를 원격 레포지토리에 푸시(`git push origin feature/...`)하고, **반드시 GitHub PR을 생성**하여 사용자에게 승인을 요청합니다.
4. **한글 커밋 메시지 컨벤션 준수**: 모든 커밋 메시지는 지정된 앵커 태그(`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`)와 함께 한글로 상세히 작성합니다.

---

## 1. 브랜치 생명주기 및 흐름 (Git Branch Lifecycle)

```
main (릴리스/프로덕션)  ---------------------------------------------> [v1.0.0 Tag]
                         \                                        /
develop (개발통합)       --------*-------------------*-----------*
                                  \                 / (PR Merge) /
feature/* (기능개발)               \--[feature/...]--/           /
                                                                  /
hotfix/* (긴급수정)      ---------------------------------------/
```

### 1.1 브랜치 상세 명명법
- **`develop`**: 모든 기능 브랜치의 부모이자 통합 지점.
- **`feature/compact-crypto-payload`**: 콤팩트 암복호화 DTO 및 파이프라인 기능 개발.
- **`feature/reader-scaffolding-and-scanner`**: Reader 앱 초기화 및 초고속 QR 스캐너 컴포넌트 개발.

---

## 2. 작업 이행 단계 (Step-by-Step Execution Workflow)

### Step 1. 부모 브랜치(`develop`) 체크아웃 및 최신화
```bash
git checkout develop
git pull origin develop
```

### Step 2. `develop` 기반 기능 브랜치 생성
```bash
git checkout -b feature/{기능명}
```

### Step 3. 기능 구현 및 테스트 수행, 한글 커밋
```bash
git add .
git commit -m "feat: {구현 내용 상세}"
```

### Step 4. 원격 푸시 및 GitHub PR 생성
```bash
git push origin feature/{기능명}
gh pr create --title "feat: {기능 제목}" --body "{PR 설명}" --base develop --head feature/{기능명}
```

### Step 5. 사용자 승인 후 병합(Merge)
- 사용자 검토 후 GitHub UI 상에서 Merge 완료.
