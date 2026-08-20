# 🔬 Research v0.5: 로고 로딩 보장 및 배경화면 상단 Dark Glass Bar 가독성 향상

## 1. 요구사항 재정의 (Requirements)
- **로고 미출력 문제**: `reader` 및 `generator` 2개 앱에서 공식 기아대책 로고 이미지가 100% 정상 로드되어 표시되도록 수정을 진행한다.
- **배경화면 대비 텍스트 가독성 문제**: 밝거나 화려한 1920×1080 사용자 정의 배경화면이 적용되더라도 헤더 타이틀, 로고, 장소명, 설정 버튼 및 메인 카드의 텍스트가 100% 또렷하게 돋보이도록 UI/UX 가독성 레이어를 도입한다.

## 2. 미확정 사항 및 가정 선언 (Assumptions)
- **Assumption 1**: 로고 이미지는 상대경로 `./kfhi-logo.png` 대신 React static asset import (`import kfhiLogo from '../assets/kfhi-logo.png'`) 방식으로 번들링하여 Electron `file://` 프로토콜 환경에서도 100% 로드 보장한다.
- **Assumption 2**: 추천 방안인 **상단 Dark Glass Bar 패널 (`background: rgba(15, 23, 42, 0.88)`, `backdrop-filter: blur(12px)`)** 및 주요 텍스트 섀도우(`text-shadow`)를 적용하여 어떤 배경 이미지가 입력되더라도 가독성을 완벽하게 유지한다.

## 3. 위험 요소 분석 (Risk Analysis)
| Level | Risk Description | Impact | Mitigation Strategy |
|:---|:---|:---|:---|
| Low | 구형 GPU 환경에서 `backdrop-filter` 가속 미지원 가능성 | 시각 디자인 | 반투명 `rgba(15, 23, 42, 0.9)` 솔리드 폴백 배경색으로 가독성 보장 |

## 4. 선택안 확정 (Decision)
- **추천 방안 (상단 Dark Glass Bar + 글래스모피즘 카드 패널 + Drop Shadow)** 확정.
