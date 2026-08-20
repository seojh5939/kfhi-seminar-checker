import * as fs from 'fs';
import * as path from 'path';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { QRGeneratorEngine } from '../src/services/qrGenerator';
import { ManifestExporter } from '../src/services/manifestExporter';
import { CryptoEngine, AttendeeInput } from 'shared';

describe('QRGeneratorEngine 대량 생성 및 이미지 디코딩 무결성 유닛 테스트 (v1.1)', () => {
  const testOutputDir = path.join(__dirname, 'temp_qr_output');
  const secretKey = 'kfhi-seminar-checker-secret-32b';
  const generatorEngine = new QRGeneratorEngine(secretKey);
  const cryptoEngine = new CryptoEngine(secretKey);

  afterAll(() => {
    // 테스트 완료 후 임시 디렉터리 정리
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  test('생성된 평문 및 암호화 QR PNG 이미지를 디코딩하여 원본 정보와 100% 일치함을 검증한다', async () => {
    const dummyAttendee: AttendeeInput = {
      name: '홍길동',
      affiliation: '서울후원이사회',
      title: '회장',
      tshirtSize: '105',
      isSpouse: false,
    };

    // 1. 평문 QR 생성 검증
    const manifest = await generatorEngine.generateBulk([dummyAttendee], testOutputDir, false);
    expect(manifest).toHaveLength(1);

    const expectedFileName = '서울후원이사회_회장_홍길동.png';
    const qrFilePath = path.join(testOutputDir, expectedFileName);
    expect(fs.existsSync(qrFilePath)).toBe(true);

    const buffer = fs.readFileSync(qrFilePath);
    const png = PNG.sync.read(buffer);
    const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(code).not.toBeNull();
    expect(code?.data).toBeDefined();

    const payload = cryptoEngine.decryptToPayload(code!.data);
    expect(payload.n).toBe(dummyAttendee.name);
    expect(payload.a).toBe(dummyAttendee.affiliation);
    expect(payload.t).toBe(dummyAttendee.title);
    expect(payload.s).toBe(dummyAttendee.tshirtSize);
  });

  test('사모님 QR 코드 파일명 및 데이터 분리 생성을 검증한다', async () => {
    const spouseAttendee: AttendeeInput = {
      name: '김영희',
      affiliation: '서울후원이사회',
      title: '사모',
      tshirtSize: '95',
      isSpouse: true,
    };

    const manifest = await generatorEngine.generateBulk([spouseAttendee], testOutputDir, false);
    expect(manifest).toHaveLength(1);

    const expectedFileName = '서울후원이사회_사모_김영희.png';
    const qrFilePath = path.join(testOutputDir, expectedFileName);
    expect(fs.existsSync(qrFilePath)).toBe(true);

    const buffer = fs.readFileSync(qrFilePath);
    const png = PNG.sync.read(buffer);
    const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(code).not.toBeNull();

    const payload = cryptoEngine.decryptToPayload(code!.data);
    expect(payload.n).toBe('김영희');
    expect(payload.t).toBe('사모');
    expect(payload.s).toBe('95');
  });

  test('매니페스트 TXT 파일이 InDesign 호환 UTF-16 LE 탭 구분으로 정상 내보내기된다', () => {
    const sampleManifest = [
      {
        affiliation: '서울후원이사회',
        title: '회장',
        name: '홍길동',
        tshirtSize: '105',
        fileName: '서울후원이사회_회장_홍길동.png',
        createdAt: '2026-08-20 09:00:00',
      },
      {
        affiliation: '서울후원이사회',
        title: '사모',
        name: '김영희',
        tshirtSize: '95',
        fileName: '서울후원이사회_사모_김영희.png',
        createdAt: '2026-08-20 09:00:00',
      },
    ];

    const txtPath = path.join(testOutputDir, 'manifest.txt');
    ManifestExporter.exportToTxt(sampleManifest, txtPath);

    expect(fs.existsSync(txtPath)).toBe(true);
    const buffer = fs.readFileSync(txtPath);
    // UTF-16 LE BOM (\uFEFF -> Buffer: 0xFF, 0xFE) 검증
    expect(buffer[0]).toBe(0xff);
    expect(buffer[1]).toBe(0xfe);

    // Adobe InDesign 데이터 병합 호환 탭 구분 헤더 [이사회명, 직함, 성명, #QR코드] 검증
    const txtString = buffer.toString('utf16le');
    expect(txtString).toContain('이사회명\t직함\t성명\t#QR코드');
    expect(txtString).toContain('서울후원이사회\t회장\t홍길동\t서울후원이사회_회장_홍길동.png');
    expect(txtString).toContain('서울후원이사회\t사모\t김영희\t서울후원이사회_사모_김영희.png');
  });
});
