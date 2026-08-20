# 🔬 Research v0.3 — QR 인식기 성능 최적화 & QR 페이로드 길축(데이터 밀도) 개선 연구

**문서 버전**: v0.3  
**작성일**: 2026-08-04  
**상태**: Research 진행 중 (카메라 성능 최적화 + QR 페이로드 데이터 밀도 축소 방안 추가)  
**이전 버전**: Research_v0.2.md (기술 스택 및 모노레포 구조 확정)

---

## 1. 요구사항 재정의 및 추가 이슈

### 1.1 저사양 웹캠 환경 최적화
- **배경**: 현장 테스트 결과 LG Gram 구형 모델 등 저사양 노트북의 카메라(낮은 해상도, 노이즈, 초점 부진) 환경에서 QR 인식 지연/버벅임 문제 발생.
- **핵심 목표**: 세미나 입장 및 부스 출입 시 1초 미만(목표: **100ms ~ 300ms 이내**)의 즉각적인 오프라인 QR 인식 및 UI 프레임 유지.

### 1.2 QR 코드 데이터 밀도(Text Length) 축소 [신규 추가]
- **배경**: 암호화 텍스트 길이(AES-256-GCM + Base64 등)가 길어질수록 QR 코드의 버전(격자 밀도)이 높아져 모듈 크기가 작아지고, 구형 웹캠에서 인식 실패율이 급증함.
- **핵심 목표**: QRPayload 복호화 무결성을 유지하면서 텍스트 길이를 최소화하여, **낮은 버전(예: Version 3~5 이하)의 듬성듬성하고 큼직한 QR 코드**를 생성.

---

## 2. 크로스 플랫폼 개발 및 테스트 환경 (Cross-Platform Strategy)

- **개발 및 테스트 환경**: macOS (macOS 웹캠 환경에서 `pnpm dev`를 통한 로컬 개발 및 스캔 테스트 100% 가능) 및 Windows PC.
- **운영 환경**: Windows 10/11 64-bit 데스크톱 (Portable `.exe` 배포).
- **검증 체계**: macOS에서 Electron Main/Renderer 프로세스 및 `getUserMedia` 카메라 인식 로직을 완전하게 구동 및 검증한 뒤, Windows 빌드(`electron-builder`) 산출물 생성.

---

## 3. 미확정 사항 및 가정 (Assumptions)

### 가정 (Assumptions)
1. **[A-01]** 카메라 영상 전체 스캔 대신 **ROI(Region of Interest, 중앙 스캔 구역) Crop**을 적용하면 프레임당 디코딩 연산량을 50% 이상 감소시킬 수 있다.
2. **[A-02]** **Web Worker** 또는 **Native C++ Thread**를 사용하여 QR 디코딩 연산을 UI 메인 스레드와 완전 분리할 수 있다.
3. **[A-03]** QRPayload 구조를 JSON 형태에서 단축 포맷(Delimiter Separated / Compact Binary / Base64URL)으로 변환하면 암호화 결과 문자열 길이를 30~50% 이상 줄일 수 있다.

---

## 4. 위험 요소 식별 (Risk Assessment)

| 위험 요소 | Level | Impact | 내용 및 설명 |
|---|---|---|---|
| **QR 데이터 과다로 인한 격자 세밀화** | **High** | 성능/기능 | 암호문 길이가 길면 QR 셀 크기가 작아져 저사양 웹캠의 핀트 아웃 시 디코딩 불가능 |
| **저화질/노이즈로 인한 인식 실패** | **High** | 성능/기능 | 구형 웹캠 초점 아웃 및 모션 블러 발생 시 QR 디코더가 포착하지 못하고 연속 실패 발생 |
| **CPU 과점유 및 UI 프리징** | **High** | 성능/운영 | 매 프레임(30fps)마다 메인 스레드에서 QR 탐지 수행 시 CPU 100% 점유 및 화면 멈춤 |

---

## 5. 기술 선택지 후보군 (Candidate Solutions)

### 5.1 QR 스캔 라이브러리 후보군
1. **`qr-scanner` (Nimiq)**: Web Worker 기반 비동기 디코딩 + ZXing C++ WASM.
2. **`html5-qrcode`**: 카메라 제어 및 ZXing 래퍼, ROI 및 프레임 인터벌 조정.
3. **`@zxing/library`**: Pure TS/JS 포팅 라이브러리.
4. **`jsQR`**: Pure JS 경량 디코더.
5. **`zxing-cpp` (Node.js Native Addon)**: Main Process Native C++ 디코딩.
6. **`OpenCV.js` + QR Detector**: 이미지 전처리(Binarization/Blur) 후 QR 인식.

### 5.2 QR 페이로드 텍스트 길축(Compact Payload) 후보군 [신규 추가]
1. **구분자 기반 경량 스트링 (Delimiter-Separated String)**
   - JSON 객체(`{"v":1,"id":"00001",...}`) 대신 구분자 기반 텍스트(`1|00001|홍길동|소속|직함`) 암호화.
2. **짧은 키 JSON / MsgPack / CBOR**
   - 이진 프로토콜 서식 변환 후 암호화.
3. **AES 초기화 벡터(IV) 및 인증 태그(Tag) 경량화 / 바이너리 결합**
   - Hex 인코딩 대신 Base64URL 또는 Raw Byte 축소 표현.
4. **오류 정정 수준 (Error Correction Level) 최적화**
   - QR 코드 오류 정정 레벨을 Level H/Q에서 Level L/M으로 낮추어 Cell 개수 절감.

---

## 6. Research 질문 산출물 (Questions for Alignment)

1. **[QRPayload 데이터 필수성]** QR 코드에 포함되어야 하는 참석자 정보 필수 항목은 어디까지인가요? (예: 관리번호 5자리 + 성명 + 소속 + 직함 전부 필수인지 여부)
2. **[인식 속도 목표]** 현장에서 용인 가능한 최대 인식 반응 시간(ms)과 연속 스루풋 목표 기준은 어느 정도인가요?
3. **[하드웨어 확장 가능성]** 구형 LG Gram 전면 웹캠 외에, 외부 저가형 USB 웹캠이나 2D 바코드/QR 스캐너(하드웨어) 도입 가능성이 열려 있나요?
