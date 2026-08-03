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
   * 참석자 정보(AttendeeInput)를 JSON QRPayload 규격으로 구성 후 AES-256-GCM 암호화
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
   * 암호문 문자열을 복호화하여 QRPayload 검증 객체로 반환
   * @throws 위변조, 복호화 실패, 페이로드 누락 시 Error 발생
   */
  public decryptToPayload(cipherText: string): QRPayload {
    const jsonStr = this.decryptString(cipherText);
    const payload = JSON.parse(jsonStr) as QRPayload;

    if (!payload.id || !payload.n || typeof payload.v !== 'number') {
      throw new Error('유효하지 않은 QR 페이로드 포맷입니다.');
    }
    return payload;
  }

  /**
   * AES-256-GCM 암호문 복호화
   */
  public decryptString(cipherText: string): string {
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
}
