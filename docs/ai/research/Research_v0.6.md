# 🔬 Research v0.6: 텍스트 섀도우 제거, 배경 이미지 100% Exact Stretch/Fit 및 Generator 설정 모달 구축

## 1. 요구사항 분석 (Requirements)
- **텍스트 섀도우 제거**: 지저분해 보일 수 있는 `textShadow` 속성을 100% 제거하고, 상단 Dark Glass Bar 단독 패널 스타일만 유지한다.
- **배경 이미지 우측 잘림(Crop) 해결**: `objectFit: 'cover'` 사용 시 창 비율 및 DPI 스케일링 차이로 우측 디자인(예: 우측 상단 기아대책 로고)이 잘리던 현상을 `objectFit: '100% 100%'` (또는 `backgroundSize: '100% 100%'`)로 변경하여 단 1px의 잘림도 없이 창 전체 뷰포트에 100% 왜곡/잘림 없이 맞춘다.
- **Generator ⚙️ 설정 모달 및 픽셀 디자인 가이드 통합**: Reader 앱에 구현된 ⚙️ 설정 모달, 좌상단 뒤로가기 버튼, 배경 업로드 & 1920×1080 상세 픽셀 가이드, 최하단 `package.json` v1.0.0 버저닝 표기를 Generator 앱에도 동일하게 구축한다.

## 2. 가정 및 해결책 (Assumptions & Solutions)
- **Assumption 1**: `objectFit: '100% 100%'`를 사용하면 이미지 가로/세로 비율이 달라지더라도 1920x1080 템플릿의 우측 상단 로고나 사이드 요소가 잘리지 않고 전체 창에 정확히 노출된다.
- **Assumption 2**: Generator 앱에 Reader 앱과 일치하는 `SettingsModal` 컴포넌트 구조를 도입하여 두 앱 간 UX 통일성을 확보한다.

## 3. 위험 요소 분석 (Risk Analysis)
| Level | Risk Description | Impact | Mitigation Strategy |
|:---|:---|:---|:---|
| Low | 창 크기를 너무 좁힐 때 이미지 비율 왜곡 가능성 | UX | 최소 윈도우 뷰포트 창 크기 보장 및 16:9 권장 디자인 가이드 명시 |
