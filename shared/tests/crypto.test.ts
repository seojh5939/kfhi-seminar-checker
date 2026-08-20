import { CryptoEngine } from '../src/crypto/aes256gcm';
import { AttendeeInput } from '../src/types';

describe('CryptoEngine (AES-256-GCM & 평문 하이브리드) 유닛 테스트', () => {
  const cryptoEngine = new CryptoEngine();

  const dummyAttendee: AttendeeInput = {
    name: '홍길동',
    affiliation: '고양후원이사회',
    title: '목사',
    tshirtSize: '105',
    isSpouse: false,
  };

  test('참석자 정보를 평문(Plaintext)으로 인코딩하고 복호화한다', () => {
    const plainString = cryptoEngine.encodeAttendee(dummyAttendee, false);
    expect(plainString.startsWith('v2|')).toBe(true);

    const payload = cryptoEngine.decryptToPayload(plainString);
    expect(payload.n).toBe(dummyAttendee.name);
    expect(payload.a).toBe(dummyAttendee.affiliation);
    expect(payload.t).toBe(dummyAttendee.title);
    expect(payload.s).toBe(dummyAttendee.tshirtSize);
    expect(payload.v).toBe(2);
  });

  test('참석자 정보를 콤팩트 암호화로 인코딩하고 복호화한다', () => {
    const encrypted = cryptoEngine.encodeAttendee(dummyAttendee, true);
    expect(typeof encrypted).toBe('string');
    expect(encrypted.startsWith('v2|')).toBe(false);

    const payload = cryptoEngine.decryptToPayload(encrypted);
    expect(payload.n).toBe(dummyAttendee.name);
    expect(payload.a).toBe(dummyAttendee.affiliation);
    expect(payload.t).toBe(dummyAttendee.title);
    expect(payload.s).toBe(dummyAttendee.tshirtSize);
    expect(payload.v).toBe(2);
  });

  test('구버전 v1 평문 및 Hex 암호문도 하위 호환 복호화한다', () => {
    const v1Plain = 'v1|00001|홍길동|고양후원이사회|목사|1724000000000';
    const v1Payload = cryptoEngine.decryptToPayload(v1Plain);
    expect(v1Payload.id).toBe('00001');
    expect(v1Payload.n).toBe('홍길동');
    expect(v1Payload.a).toBe('고양후원이사회');
    expect(v1Payload.t).toBe('목사');
  });

  test('위변조되거나 잘못된 암호문 복호화 시 예외를 발생시킨다', () => {
    const encrypted = cryptoEngine.encryptAttendeeCompact(dummyAttendee);
    const tampered = encrypted.substring(0, encrypted.length - 4) + 'abcd';
    expect(() => {
      cryptoEngine.decryptToPayload(tampered);
    }).toThrow();
  });

  test('서로 다른 비밀키를 사용하면 암호문 복호화에 실패한다', () => {
    const engineA = new CryptoEngine('secret-key-aaa-32bytes-secret');
    const engineB = new CryptoEngine('secret-key-bbb-32bytes-secret');

    const encrypted = engineA.encodeAttendee(dummyAttendee, true);
    expect(() => {
      engineB.decryptToPayload(encrypted);
    }).toThrow();
  });
});
