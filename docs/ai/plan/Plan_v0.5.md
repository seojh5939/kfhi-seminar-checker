# 📐 Plan v0.5: 로고 번들링 및 상단 Dark Glass Bar UI 설계

## 1. 개요
본 문서는 `reader` 및 `generator` 앱의 로고 이미지 번들링 바인딩과 배경화면 입력 시 헤더 및 메인 영역의 텍스트 가독성을 100% 보장하기 위한 상단 Dark Glass Bar 및 글래스모피즘 패널 구조를 정의한다.

## 2. 세부 설계 내용 (Component & Style Specification)

### 2.1 로고 번들링 바인딩 (`App.tsx`)
- `import kfhiLogo from '../assets/kfhi-logo.png';` (또는 `../../public/kfhi-logo.png`)
- `<img src={kfhiLogo} alt="희망친구 기아대책" style={{ height: '40px', objectFit: 'contain' }} />`

### 2.2 헤더 상단 Dark Glass Bar 패널
- **Container Style**:
  ```tsx
  <header style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    padding: '16px 24px',
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    backdropFilter: 'blur(12px)',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
  }}>
  ```
- **Text Shadow Style**:
  - `textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)'` 주요 제목 및 설명 텍스트에 적용.

### 2.3 메인 카드 영역 글래스 패널
- `backgroundColor: 'rgba(30, 41, 59, 0.88)'`, `backdropFilter: 'blur(12px)'`, `border: '1px solid rgba(255, 255, 255, 0.1)'` 적용.

## 3. 검증 전략 (Verification Plan)
- `pnpm build:all` 모노레포 전체 컴파일 통과 여부 및 빌드 아티팩트 내 로고 표출 검증.
