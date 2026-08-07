# 📐 Plan v0.6: 배경 이미지 100% Exact Stretch 및 Generator 설정 모달 구현 설계

## 1. 개요
본 문서는 `reader` 및 `generator` 앱의 텍스트 섀도우 제거, 배경 이미지 100% Exact Fit 스타일 적용, 그리고 `generator` 앱 내의 ⚙️ 설정 모달 및 v1.0.0 버전 표기 구현 명세를 정의한다.

## 2. 상세 구현 명세 (Implementation Specification)

### 2.1 텍스트 섀도우 제거 & 100% Exact Stretch 배경 레이어
- `reader/src/renderer/App.tsx` & `generator/src/renderer/App.tsx`:
  - `textShadow` 속성 전면 삭제.
  - 배경 이미지 `img` 태그 스타일:
    ```tsx
    style={{
      width: '100%',
      height: '100%',
      objectFit: '100% 100%', // 1px도 자르지 않고 창 픽셀 전체에 100% 맞춤
      objectPosition: 'center',
      display: 'block',
    }}
    ```

### 2.2 Generator ⚙️ 설정 모달 구조 (`generator/src/renderer/App.tsx`)
- 헤더 우상단에 `⚙️ 설정` 버튼 배치.
- `showSettingsModal` 상태에 따라 팝업 오픈:
  - ⬅️ 뒤로가기 버튼
  - 🖼️ 배경화면 변경 및 1920×1080 픽셀 디자인 가이드 버튼
  - 최하단 `generator/package.json` 연동 버전 명시 (`기아대책 QR 생성기 v1.0.0`)
- `showBgModal` 상태에 따라 배경 업로드 및 1920×1080 디자인 가이드 모달 오픈.

## 3. 검증 전략 (Verification Plan)
- `pnpm build:all` 모노레포 컴파일 성공 확인.
- `generator` 및 `reader` 앱 실행 시 우측 상단 로고 이미지 잘림 현상 해소 확인.
