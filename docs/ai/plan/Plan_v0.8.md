# 📐 Plan v0.8: 상단 Bar 100% Full Width (풀-위드) 스타일 구현 설계

## 1. 개요
본 문서는 `reader` 및 `generator` 앱의 상단 Header Bar 패널을 화면 좌우 100% (Full Width)로 확장 밀착시키고, 내부 로고/타이틀/버튼 콘텐츠를 중앙 1280px 영역으로 가독성 있게 정렬하는 UI 레이아웃 변경을 정의한다.

## 2. 세부 스타일 명세 (Style Spec)
- **Header Outer Bar**:
  - `width: '100vw'` (또는 최상위 컨테이너 상단 100% 확장)
  - `margin: '0 -24px 20px -24px'` (또는 Full Width 레이어)
  - `borderRadius: 0` (라운드 제거, 화면 상단/좌우 끝 100% 밀착)
  - `backgroundColor: 'rgba(15, 23, 42, 0.88)'`, `backdropFilter: 'blur(12px)'`, `borderBottom: '1px solid rgba(255, 255, 255, 0.12)'`
- **Header Inner Content**:
  - `maxWidth: '1280px'`, `margin: '0 auto'`, `padding: '0 24px'`, `display: 'flex'`, `justifyContent: 'space-between'`, `alignItems: 'center'`

## 3. 검증 전략 (Verification Plan)
- `pnpm build:all` 모노레포 컴파일 성공 확인.
- 창 좌측 0px부터 우측 끝 100%까지 상단 Bar가 틈새 없이 Full Width로 채워지는지 확인.
