import * as fs from 'fs';
import * as path from 'path';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { QRGeneratorEngine } from '../src/services/qrGenerator';
import { ManifestExporter } from '../src/services/manifestExporter';
import { QRVerifier } from '../src/services/qrVerifier';
import { CryptoEngine, AttendeeInput } from 'shared';

describe('QRGeneratorEngine 관할지역 탭별 폴더 생성 & 듀얼 매니페스트 대량 생성 유닛 테스트 (v1.5)', () => {
  const secretKey = 'kfhi-seminar-checker-secret-32b';
  const generatorEngine = new QRGeneratorEngine(secretKey);
  const cryptoEngine = new CryptoEngine(secretKey);

  const testDirs = [
    path.join(__dirname, 'temp_qr_output_1'),
    path.join(__dirname, 'temp_qr_output_2'),
    path.join(__dirname, 'temp_qr_output_3'),
  ];

  afterAll(() => {
    for (const dir of testDirs) {
      if (fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
        } catch {
          // ignore
        }
      }
    }
  });

  test('서울 탭(02->20) 및 경기 탭(031->31) 참석자에 대해 탭별 폴더와 {일련번호}.png를 생성한다', async () => {
    const outputDir = testDirs[0];
    const attendees: AttendeeInput[] = [
      { name: '홍길동', affiliation: '서울동대문후원이사회', title: '회장', tshirtSize: '105', sheetName: '서울' },
      { name: '김철수', affiliation: '서울서대문후원이사회', title: '총무', tshirtSize: '100', sheetName: '서울' },
      { name: '이순신', affiliation: '고양후원이사회', title: '이사', tshirtSize: '100', sheetName: '경기' },
    ];

    const records = await generatorEngine.generateBulk(attendees, outputDir, false);

    expect(records).toHaveLength(3);
    // 서울 동대문 1번 -> 200001
    expect(records[0].managementNumber).toBe('200001');
    expect(records[0].fileName).toBe('200001.png');
    expect(records[0].sheetName).toBe('서울');
    // 서울 서대문 1번 (서울 권역 2번) -> 200002
    expect(records[1].managementNumber).toBe('200002');
    expect(records[1].sheetName).toBe('서울');
    // 경기 고양 1번 (경기 권역 1번) -> 310001
    expect(records[2].managementNumber).toBe('310001');
    expect(records[2].sheetName).toBe('경기');

    // 탭별 폴더 생성 및 이미지 저장 확인
    expect(fs.existsSync(path.join(outputDir, '서울', '200001.png'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, '서울', '200002.png'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, '경기', '310001.png'))).toBe(true);

    // QR 디코딩 및 페이로드 id(일련번호) 확인
    const buffer = fs.readFileSync(path.join(outputDir, '서울', '200001.png'));
    const png = PNG.sync.read(buffer);
    const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(code).not.toBeNull();

    const payload = cryptoEngine.decryptToPayload(code!.data);
    expect(payload.n).toBe('홍길동');
    expect(payload.a).toBe('서울동대문후원이사회');
    expect(payload.id).toBe('200001');
  });

  test('InDesign 호환 듀얼 매니페스트 및 전체 정보 통합 마스터 매니페스트(manifest_master.txt)가 정상 생성된다', () => {
    const outputDir = testDirs[1];
    const sampleManifest = [
      {
        managementNumber: '200001',
        affiliation: '서울동대문후원이사회',
        title: '회장',
        name: '홍길동',
        tshirtSize: '105',
        fileName: '200001.png',
        createdAt: '2026-08-24 09:00:00',
        sheetName: '서울',
      },
      {
        managementNumber: '200002',
        affiliation: '서울서대문후원이사회',
        title: '사모',
        name: '김영희',
        tshirtSize: '95',
        fileName: '200002.png',
        createdAt: '2026-08-24 09:00:00',
        sheetName: '서울',
      },
      {
        managementNumber: '310001',
        affiliation: '고양후원이사회',
        title: '이사',
        name: '이순신',
        tshirtSize: '100',
        fileName: '310001.png',
        createdAt: '2026-08-24 09:00:00',
        sheetName: '경기',
      },
    ];

    const { listManifestPath, qrManifestPath, masterManifestPath } = ManifestExporter.exportDualTxt(sampleManifest, outputDir);

    // 1. 루트 폴더 매니페스트 검증
    expect(fs.existsSync(listManifestPath)).toBe(true);
    expect(fs.existsSync(qrManifestPath)).toBe(true);
    expect(fs.existsSync(masterManifestPath)).toBe(true);

    const listBuffer = fs.readFileSync(listManifestPath);
    const listStr = listBuffer.toString('utf16le');
    expect(listStr).toContain('이사회명\t직함\t성명');
    expect(listStr).toContain('서울동대문후원이사회\t회장\t홍길동');
    expect(listStr).not.toContain('일련번호');

    const qrBuffer = fs.readFileSync(qrManifestPath);
    const qrStr = qrBuffer.toString('utf16le');
    expect(qrStr).toContain('일련번호\t#QR코드');
    expect(qrStr).toContain('200001\t서울/200001.png');
    expect(qrStr).toContain('310001\t경기/310001.png');

    // 루트 마스터 매니페스트 검증 (5개 핵심 컬럼: 일련번호, 이사회명, 직함, 성명, #QR코드)
    const masterBuffer = fs.readFileSync(masterManifestPath);
    const masterStr = masterBuffer.toString('utf16le');
    expect(masterStr).toContain('일련번호\t이사회명\t직함\t성명\t#QR코드');
    expect(masterStr).toContain('200001\t서울동대문후원이사회\t회장\t홍길동\t서울/200001.png');
    expect(masterStr).toContain('310001\t고양후원이사회\t이사\t이순신\t경기/310001.png');

    // 2. 탭별 서브 폴더 매니페스트 검증
    const seoulListPath = path.join(outputDir, '서울', 'manifest_list.txt');
    const seoulQrPath = path.join(outputDir, '서울', 'manifest_qr.txt');
    const seoulMasterPath = path.join(outputDir, '서울', 'manifest_master.txt');
    expect(fs.existsSync(seoulListPath)).toBe(true);
    expect(fs.existsSync(seoulQrPath)).toBe(true);
    expect(fs.existsSync(seoulMasterPath)).toBe(true);

    const seoulMasterStr = fs.readFileSync(seoulMasterPath).toString('utf16le');
    expect(seoulMasterStr).toContain('일련번호\t이사회명\t직함\t성명\t#QR코드');
    expect(seoulMasterStr).toContain('200001\t서울동대문후원이사회\t회장\t홍길동\t200001.png');
    expect(seoulMasterStr).toContain('200002\t서울서대문후원이사회\t사모\t김영희\t200002.png');
    expect(seoulMasterStr).not.toContain('310001');
  });

  test('QRVerifier가 탭별 서브 폴더 내의 PNG 이미지들을 성공적으로 전수 검증한다', async () => {
    const outputDir = testDirs[2];
    const attendees: AttendeeInput[] = [
      { name: '홍길동', affiliation: '서울동대문후원이사회', title: '회장', tshirtSize: '105', sheetName: '서울' },
      { name: '김영희', affiliation: '서울서대문후원이사회', title: '사모', tshirtSize: '95', isSpouse: true, sheetName: '서울' },
      { name: '이순신', affiliation: '고양후원이사회', title: '이사', tshirtSize: '100', sheetName: '경기' },
    ];

    const records = await generatorEngine.generateBulk(attendees, outputDir, true);
    ManifestExporter.exportDualTxt(records, outputDir);

    const verifier = new QRVerifier(secretKey);
    const summary = await verifier.verifyOutputDir(outputDir);

    expect(summary.total).toBe(3);
    expect(summary.successCount).toBe(3);
    expect(summary.failCount).toBe(0);
    expect(summary.items[0].status).toBe('success');
    expect(summary.items[0].managementNumber).toBe('200001');
    expect(summary.items[2].managementNumber).toBe('310001');
  });
});
