import { CryptoEngine } from '../src/crypto/aes256gcm';
import { AttendeeInput } from '../src/types';

describe('CryptoEngine (AES-256-GCM) 유닛 테스트', () => {
  const cryptoEngine = new CryptoEngine();

  const dummyAttendee: AttendeeInput = {
    managementNumber: '00001',
    name: '홍길동',
    affiliation: '고양후원이사회',
    title: '목사',
  };

  test('참석자 정보를 정상적으로 암호화하고 QRPayload로 복호화한다', () => {
    const encrypted = cryptoEngine.encryptAttendee(dummyAttendee);
    expect(typeof encrypted).toBe('string');
    expect(encrypted.split(':')).toHaveLength(3);

    const payload = cryptoEngine.decryptToPayload(encrypted);
    expect(payload.id).toBe(dummyAttendee.managementNumber);
    expect(payload.n).toBe(dummyAttendee.name);
    expect(payload.a).toBe(dummyAttendee.affiliation);
    expect(payload.t).toBe(dummyAttendee.title);
    expect(payload.v).toBe(1);
    expect(typeof payload.ts).toBe('number');
  });

  test('참석자 정보를 콤팩트 규격으로 암호화하고 복호화한다 (길이 축소 검증)', () => {
    const jsonEncrypted = cryptoEngine.encryptAttendee(dummyAttendee);
    const compactEncrypted = cryptoEngine.encryptAttendeeCompact(dummyAttendee);

    expect(typeof compactEncrypted).toBe('string');
    // 콤팩트 암호문 길이는 기존 JSON Hex 암호문 길이의 50% 이하이어야 함
    expect(compactEncrypted.length).toBeLessThan(jsonEncrypted.length * 0.6);

    // 콤팩트 암호문 복호화 검증
    const payload = cryptoEngine.decryptToPayload(compactEncrypted);
    expect(payload.id).toBe(dummyAttendee.managementNumber);
    expect(payload.n).toBe(dummyAttendee.name);
    expect(payload.a).toBe(dummyAttendee.affiliation);
    expect(payload.t).toBe(dummyAttendee.title);
    expect(payload.v).toBe(1);
  });

  test('위변조되거나 잘못된 암호문 복호화 시 예외를 발생시킨다', () => {
    const encrypted = cryptoEngine.encryptAttendee(dummyAttendee);
    const tampered = encrypted.substring(0, encrypted.length - 4) + 'abcd';

    expect(() => {
      cryptoEngine.decryptToPayload(tampered);
    }).toThrow();

    const compactEncrypted = cryptoEngine.encryptAttendeeCompact(dummyAttendee);
    const compactTampered = compactEncrypted.substring(0, compactEncrypted.length - 4) + 'abcd';
    expect(() => {
      cryptoEngine.decryptToPayload(compactTampered);
    }).toThrow();
  });

  test('서로 다른 비밀키를 사용하면 복호화에 실패한다', () => {
    const engineA = new CryptoEngine('secret-key-aaa-32bytes-secret');
    const engineB = new CryptoEngine('secret-key-bbb-32bytes-secret');

    const encrypted = engineA.encryptAttendee(dummyAttendee);
    const compactEncrypted = engineA.encryptAttendeeCompact(dummyAttendee);

    expect(() => {
      engineB.decryptToPayload(encrypted);
    }).toThrow();

    expect(() => {
      engineB.decryptToPayload(compactEncrypted);
    }).toThrow();
  });
});
