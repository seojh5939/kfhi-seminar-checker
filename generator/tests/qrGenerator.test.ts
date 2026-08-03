import * as fs from 'fs';
import * as path from 'path';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { QRGeneratorEngine } from '../src/services/qrGenerator';
import { ManifestExporter } from '../src/services/manifestExporter';
import { CryptoEngine, AttendeeInput } from 'shared';

describe('QRGeneratorEngine 대량 생성 및 이미지 디코딩 무결성 유닛 테스트', () => {
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

  test('생성된 QR PNG 이미지를 디코딩 및 복호화하여 원본 참석자 정보와 100% 일치함을 검증한다', async () => {
    const dummyAttendee: AttendeeInput = {
      managementNumber: '99999',
      name: '성공검증',
      affiliation: '테스트후원이사회',
      title: '장로',
    };

    const manifest = await generatorEngine.generateBulk([dummyAttendee], testOutputDir);
    expect(manifest).toHaveLength(1);

    const qrFilePath = path.join(testOutputDir, '테스트후원이사회', '99999.png');
    expect(fs.existsSync(qrFilePath)).toBe(true);

    // 1. PNG 이미지 바이너리 읽기 및 RGBA 픽셀 변환
    const buffer = fs.readFileSync(qrFilePath);
    const png = PNG.sync.read(buffer);

    // 2. jsQR 엔진으로 이미지 내 픽셀 스캔 및 암호문 추출
    const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(code).not.toBeNull();
    expect(code?.data).toBeDefined();

    // 3. 추출된 암호문을 CryptoEngine으로 복호화
    const payload = cryptoEngine.decryptToPayload(code!.data);

    // 4. 복호화 결과 무결성 100% 일치 검증
    expect(payload.id).toBe(dummyAttendee.managementNumber);
    expect(payload.n).toBe(dummyAttendee.name);
    expect(payload.a).toBe(dummyAttendee.affiliation);
    expect(payload.t).toBe(dummyAttendee.title);
  });

  test('참석자 대량 명단을 정상 생성하고 소속별 폴더로 분류한다', async () => {
    const attendees: AttendeeInput[] = [];
    const affiliations = ['고양후원이사회', '파주후원이사회', '김포후원이사회', '은평후원이사회'];

    for (let i = 1; i <= 20; i++) {
      const numStr = i.toString().padStart(5, '0');
      attendees.push({
        managementNumber: numStr,
        name: `참석자_${i}`,
        affiliation: affiliations[i % affiliations.length],
        title: '목사',
      });
    }

    const startTime = Date.now();
    let progressCallCount = 0;

    const manifestRecords = await generatorEngine.generateBulk(
      attendees,
      testOutputDir,
      (current, total) => {
        progressCallCount++;
      }
    );

    const elapsedTimeMs = Date.now() - startTime;

    expect(manifestRecords).toHaveLength(20);
    expect(progressCallCount).toBe(20);
    expect(elapsedTimeMs).toBeLessThan(60000);

    // 소속별 하위 폴더 존재 여부 확인
    affiliations.forEach((aff) => {
      const affDir = path.join(testOutputDir, aff);
      expect(fs.existsSync(affDir)).toBe(true);
    });
  });

  test('매니페스트 CSV 파일이 UTF-8 BOM으로 정상 내보내기된다', () => {
    const sampleManifest = [
      {
        managementNumber: '00001',
        name: '홍길동',
        affiliation: '고양후원이사회',
        title: '목사',
        fileName: '고양후원이사회/00001.png',
        createdAt: '2026-08-03 21:00:00',
      },
    ];

    const csvPath = path.join(testOutputDir, 'manifest.csv');
    ManifestExporter.exportToCsv(sampleManifest, csvPath);

    expect(fs.existsSync(csvPath)).toBe(true);
    const content = fs.readFileSync(csvPath);
    // UTF-8 BOM (\uFEFF -> Buffer: 0xEF, 0xBB, 0xBF) 검증
    expect(content[0]).toBe(0xef);
    expect(content[1]).toBe(0xbb);
    expect(content[2]).toBe(0xbf);
  });
});
