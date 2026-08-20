# 📐 Plan v0.9: 동적 수동 입력 (Multi-Row Manual QR Generator) 설계

## 1. 개요
본 문서는 엑셀 업로드 없이 현장에서 개별/다건 긴급 참석자 정보를 동적으로 여러 행(`ManualAttendeeRow[]`) 추가/삭제하며 수동 입력 받아 QR 이미지 및 매니페스트를 일괄 생성하는 기능 설계를 정의한다.

## 2. 세부 설계 명세 (Specification)

### 2.1 State 데이터 구조 (`generator/src/renderer/App.tsx`)
```typescript
interface ManualAttendeeRow {
  id: string;
  managementNumber: string;
  name: string;
  affiliation: string;
  title: string;
}

const [manualRows, setManualRows] = useState<ManualAttendeeRow[]>([
  { id: '1', managementNumber: '', name: '', affiliation: '', title: '' }
]);
```

### 2.2 동적 행 제어 함수 (Row Operations)
- `handleAddRow()`: 신규 입력 행 추가
- `handleRemoveRow(id)`: 해당 행 삭제 (최소 1개 행 유지)
- `handleRowChange(id, field, value)`: 해당 행의 필드 값 업데이트

### 2.3 입력 데이터 검증 및 생성 (Validation & Encoding)
- 각 행별 5자리 관리번호 `^\d{5}$` 검증 및 성명, 소속, 직함 필수 검사
- 입력된 행들 간 관리번호 중복 검사
- `generateQRCodes({ attendees: manualRows, outputDir })` 호출하여 PNG 생성 및 `manifest.txt` 기록

## 3. 검증 전략 (Verification Plan)
- `pnpm build:all` 컴파일 검증
- 1개 이상 여러 행 추가 및 삭제 테스트
- 생성물 PNG 개수 및 `manifest.txt` UTF-16 LE 레코드 대조 검증
