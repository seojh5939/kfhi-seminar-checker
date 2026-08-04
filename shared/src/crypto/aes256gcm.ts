import * as crypto from 'crypto';
import { DEFAULT_AES_SECRET_KEY, QR_PAYLOAD_VERSION } from '../constants';
import { QRPayload, AttendeeInput } from '../types';

/**
 * AES-256-GCM 암복호화 전담 엔진 (SOLID: Single Responsibility)
 */
export class CryptoEngine {
  private readonly secretKey: Buffer;
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly IV_LENGTH = 12; // 96비트 GCM 추천 IV 길이

  constructor(secretKey: string = DEFAULT_AES_SECRET_KEY) {
    // 입력 비밀키를 256비트(32바이트) 해시 값으로 정규화
    this.secretKey = crypto.createHash('sha256').update(secretKey).digest();
  }

  /**
   * 참석자 정보(AttendeeInput)를 JSON QRPayload 규격으로 구성 후 AES-256-GCM 암호화 (기존 포맷)
   */
  public encryptAttendee(attendee: AttendeeInput): string {
    const payload: QRPayload = {
      v: QR_PAYLOAD_VERSION,
      id: attendee.managementNumber,
      n: attendee.name,
      a: attendee.affiliation,
      t: attendee.title,
      ts: Date.now(),
    };
    return this.encryptString(JSON.stringify(payload));
  }

  /**
   * 참석자 정보(AttendeeInput)를 구분자 콤팩트 규격으로 변환 후 Base64URL 이진 바이너리 AES-256-GCM 암호화
   * @returns 50~70자 내외의 경량 Base64URL 암호문
   */
  public encryptAttendeeCompact(attendee: AttendeeInput): string {
    const payload: QRPayload = {
      v: QR_PAYLOAD_VERSION,
      id: attendee.managementNumber,
      n: attendee.name,
      a: attendee.affiliation,
      t: attendee.title,
      ts: Date.now(),
    };
    const compactText = `${payload.v}|${payload.id}|${payload.n}|${payload.a}|${payload.t}|${payload.ts}`;
    return this.encryptCompactString(compactText);
  }

  /**
   * 평문 문자열을 AES-256-GCM으로 암호화
   * @returns "IV(hex):AuthTag(hex):EncryptedData(hex)" 형태의 포맷 문자열
   */
  public encryptString(plainText: string): string {
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, this.secretKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * 평문 문자열을 콤팩트 바이너리(Base64URL) 형태의 AES-256-GCM으로 암호화
   * @returns IV(12b) + AuthTag(16b) + Ciphertext(Nb) 가 결합된 Base64URL 문자열
   */
  public encryptCompactString(plainText: string): string {
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, this.secretKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const packed = Buffer.concat([iv, authTag, encrypted]);
    return packed.toString('base64url');
  }

  /**
   * 암호문 문자열을 복호화하여 QRPayload 검증 객체로 반환 (기존 Hex 및 콤팩트 Base64URL 모두 자동 감지 지원)
   * @throws 위변조, 복호화 실패, 페이로드 누락 시 Error 발생
   */
  public decryptToPayload(cipherText: string): QRPayload {
    const decryptedStr = this.decryptString(cipherText);

    // 1. JSON 포맷 시도
    if (decryptedStr.startsWith('{')) {
      const payload = JSON.parse(decryptedStr) as QRPayload;
      if (!payload.id || !payload.n || typeof payload.v !== 'number') {
        throw new Error('유효하지 않은 QR 페이로드 포맷입니다.');
      }
      return payload;
    }

    // 2. 콤팩트 구분자 포맷 시도 (v|id|n|a|t|ts)
    const parts = decryptedStr.split('|');
    if (parts.length >= 6) {
      const [vStr, id, n, a, t, tsStr] = parts;
      const v = Number(vStr);
      const ts = Number(tsStr);
      if (!id || !n || isNaN(v)) {
        throw new Error('유효하지 않은 콤팩트 QR 페이로드 포맷입니다.');
      }
      return { v, id, n, a, t, ts };
    }

    throw new Error('인식할 수 없는 페이로드 포맷입니다.');
  }

  /**
   * AES-256-GCM 암호문 복호화 (기존 Hex 구분자 포맷 및 콤팩트 Base64URL 바이너리 포맷 자동 호환)
   */
  public decryptString(cipherText: string): string {
    // A. 기존 Hex 구분자 포맷 (IV:Tag:Encrypted)
    if (cipherText.includes(':')) {
      const parts = cipherText.split(':');
      if (parts.length !== 3) {
        throw new Error('암호문 포맷이 올바르지 않습니다.');
      }

      const [ivHex, tagHex, encryptedHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(tagHex, 'hex');
      const encryptedText = Buffer.from(encryptedHex, 'hex');

      const decipher = crypto.createDecipheriv(this.ALGORITHM, this.secretKey, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(encryptedText),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    }

    // B. 콤팩트 Base64URL 바이너리 포맷
    const packed = Buffer.from(cipherText, 'base64url');
    if (packed.length < this.IV_LENGTH + 16) {
      throw new Error('암호문 길이가 너무 짧습니다.');
    }

    const iv = packed.subarray(0, this.IV_LENGTH);
    const authTag = packed.subarray(this.IV_LENGTH, this.IV_LENGTH + 16);
    const encryptedText = packed.subarray(this.IV_LENGTH + 16);

    const decipher = crypto.createDecipheriv(this.ALGORITHM, this.secretKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encryptedText),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}
