# 📐 Plan v0.7: 상단 Bar 상단 밀착, 배경 기준점 조정 및 Generator 개별 QR 생성기 설계

## 1. 개요
본 문서는 상단 Bar 상단 패딩 제거, 상단 Bar 하단 지점(Y 오프셋) 기준 배경화면 레이어 정밀 배치, 그리고 `generator` 앱 내의 개별 1줄 수동 입력 QR 생성기 구현 설계를 정의한다.

## 2. 세부 설계 명세 (Implementation Specs)

### 2.1 상단 Bar 상단 패딩 제거 및 밀착 (`reader` & `generator`)
- **최상위 Container**:
  - `padding: '0 24px 24px 24px'` (상단 패딩 0 적용)
- **Header**:
  - `marginTop: 0`
  - `borderRadius: '0 0 16px 16px'` (상단 라운드 제거, 하단만 라운드 적용으로 모니터 최상단 완벽 밀착)

### 2.2 배경화면 기준점 오프셋 레이어링 (Bar 겹침 방지)
- 상단 Bar의 실제 높이(약 80px) 하단에서부터 배경화면이 시작되도록 설정하여, 배경 이미지 상단의 로고나 그래픽 디자인이 상단 Bar 뒤로 들어가 가려지는 현상을 100% 방지한다.
- 배경 레이어 Style:
  ```tsx
  style={{
    position: 'fixed',
    top: '80px', // 상단 Bar 높이 만큼 내림 (가림 방지)
    left: 0,
    width: '100vw',
    height: 'calc(100vh - 80px)', // 하단이 비지 않도록 뷰포트 바닥까지 채움
    zIndex: -1,
    overflow: 'hidden',
    pointerEvents: 'none',
  }}
  ```

### 2.3 Generator 개별 1줄 수동 입력 QR 생성기 (`generator/src/renderer/App.tsx`)
- **탭 분리**: `const [activeTab, setActiveTab] = useState<'batch' | 'single'>('batch');`
- **단건 입력 폼**:
  - `managementNumber` (5자리 정규식 `^\d{5}$` 검증)
  - `name` (성명)
  - `affiliation` (소속/이사회명)
  - `title` (직함)
- **단건 QR 생성 처리**:
  - AES-256-GCM + Base64URL 콤팩트 패킹으로 1건 QR 이미지(`${managementNumber}.png`) 및 UTF-16 LE 인디자인 매니페스트 레코드 즉시 작성/저장.

## 3. 검증 전략 (Verification Plan)
- `pnpm build:all` 컴파일 검증.
- 실행 후 상단 Bar 상단 틈새 0px 밀착 및 배경 이미지 상단 디자인 가림 방지 검증.
- 개별 1줄 입력 폼으로 생성 시 정상 PNG 및 매니페스트 생성 검증.
