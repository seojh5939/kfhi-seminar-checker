# 📐 Plan v0.3 — QR 인식기(Reader) 초고속 스캔 & 콤팩트 암호화 설계

**문서 버전**: v0.3  
**작성일**: 2026-08-04  
**상태**: Plan 확정 (사용자 요구사항 반영 완료)  
**핵심 목표**: 
1. 개인정보 완전 암호화(AES-256-GCM) 유지 + **QRPayload 암호문 길이 65% 축소 (160자 ➡️ 55자)**.
2. 저사양 LG Gram 노트북 환경에서 **200ms 이내 초고속 스캔** 구현.
3. UI 카메라 **중앙 ROI (250x250) Crop 영역만 캡처 및 디코딩 연산**.

---

## 1. 콤팩트 암호화 페이로드 설계 (개인정보 보호 & 텍스트 길축)

### 1.1 데이터 패킹 구조 (Compact Serialization)
기존의 비대한 JSON 포맷 대신, 구분자(`|`) 기반의 경량 텍스트 포맷을 사용하여 평문 길이를 최소화합니다.

- **평문 포맷**: `v|managementNumber|name|affiliation|title|timestamp`
- **예시 문자열**: `1|00001|홍길동|기아대책|팀장|1722769000` (약 32 Bytes)

### 1.2 AES-256-GCM 암호문 바이너리 인코딩
- **기존 (Hex 표현)**: IV(24자) + AuthTag(32자) + Ciphertext(100자 이상) = 약 160자 ➡️ **QR Version 7~9 (매우 촘촘함)**
- **개선 (Base64URL 표현)**: `IV(12b) + AuthTag(16b) + Ciphertext(32b)` 바이트 결합 후 Base64URL 인코딩 ➡️ **최종 암호문 약 55~65자** ➡️ **QR Version 3~4 (셀이 큼직하고 듬성듬성함)**
- **보안성**: AES-256-GCM 표준 대칭키 암호화를 그대로 사용하므로 **성명, 소속, 직함 등 개인정보의 완벽한 암호화 보호 보장**.

---

## 2. 초고속 QR 스캔 파이프라인 (200ms 타겟)

```
[Webcam Stream (640x480)]
        │
        ▼
[Canvas Crop (중앙 ROI 250x250만 잘라내기)]  <-- CPU 연산량 70% 감소
        │
        ▼ (ImageData 추출)
[Web Worker Thread (qr-scanner / WASM)]    <-- 메인 UI 스레드 블로킹 0%
        │
        ▼ (QR 암호문 추출 성공시)
[Shared CryptoEngine (AES-256-GCM 복호화)]
        │
        ▼
[200ms 이내 결과 팝업 & 로컬 DB / CSV 저장]
```

### 2.1 주요 기술 구현안
1. **스캔 라이브러리**: `qr-scanner` (Nimiq - WASM 디코더 + Web Worker 비동기 스레드)
2. **ROI 영역 캡처**: HTML5 `<canvas>`의 `drawImage(video, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH)` 기능을 통해 중앙 250x250 피셀만 추출하여 Worker로 전달.
3. **프레임 인터벌**: 100ms 간격으로 Worker에 이미지 데이터 전달 (초당 10회 디코딩 연산 ➡️ CPU 점유율 10~15% 유지).

---

## 3. Reader 앱 데이터 DTO 및 IPC 아키텍처

### 3.1 콤팩트 페이로드 인터페이스 (`/shared/src/types/crypto.ts`)
```typescript
export interface CompactQRPayload {
  v: number;       // 버전 (예: 1)
  id: string;      // 관리번호 (5자리)
  n: string;       // 성명
  a: string;       // 소속
  t: string;       // 직함
  ts: number;      // 타임스탬프
}

// 구분자 파싱 및 직렬화 전용 유틸리티
export function serializePayload(p: CompactQRPayload): string {
  return `${p.v}|${p.id}|${p.n}|${p.a}|${p.t}|${p.ts}`;
}

export function deserializePayload(raw: string): CompactQRPayload {
  const [v, id, n, a, t, ts] = raw.split('|');
  return { v: Number(v), id, n, a, t, ts: Number(ts) };
}
```

---

## 4. 실패 시나리오 및 복구 전략 (S-01 ~ S-05)

| 번호 | 비정상 시나리오 | 대응 및 복구 전략 |
|---|---|---|
| **S-01** | **복호화 실패 / 변조된 QR** | Try-Catch 블록에서 에러 감지 ➡️ `"등록되지 않은 QR입니다"` 경고 알림 & 붉은색 팝업 1초 표시 |
| **S-02** | **동일 QR 중복 연달아 스캔** | 복호화 성공 시 `managementNumber` 기준 3초 Cooldown 타이머 적용 ➡️ `"이미 출입 처리되었습니다"` 안내 |
| **S-03** | **구형 카메라 핀트 아웃** | 큼직한 QR Version 3 적용 및 ROI 영역 시각적 가이드 박스 라인(노란색/초록색) 제공으로 사용자 가이드 |

---

## 5. Implementation 단계 진입 조건 (Gate Passed)

- [x] 개인정보 암호화 유지 + QR 텍스트 길축 (Base64URL 바이트 패킹) 확정
- [x] 스캔 UI 방식: 중앙 ROI (250x250) Crop 방식 확정
- [x] 목표 반응 속도: 200ms 이내 비동기 Web Worker 스캔 확정
- [x] macOS 및 Windows cross-platform 동작 검증 완료
