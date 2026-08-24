import * as crypto from 'crypto';
import { DEFAULT_AES_SECRET_KEY, QR_PAYLOAD_VERSION } from '../constants';
import { QRPayload, AttendeeInput } from '../types';

/**
 * AES-256-GCM 암복호화 및 평문 하이브리드 인코딩/디코딩 전담 엔진
 */
export class CryptoEngine {
  private readonly secretKey: Buffer;
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly IV_LENGTH = 12; // 96비트 GCM 추천 IV 길이

  constructor(secretKey: string = DEFAULT_AES_SECRET_KEY) {
    // 입력 비밀키를 256비트(32바이트) 해시 값으로 정규화
    this.secretKey = crypto.createHash('sha256').update(secretKey || DEFAULT_AES_SECRET_KEY).digest();
  }

  /**
   * 참석자 정보를 초경량 평문 구분자 포맷 문자열로 변환 (v2 규격 - 20mm QR 점 크기 극대화)
   * 포맷: v2|이사회명|직책|성명|티셔츠사이즈
   */
  public toPlainPayloadString(attendee: AttendeeInput): string {
    const tshirt = attendee.tshirtSize || '';
    const id = attendee.managementNumber || '';
    if (id) {
      return `v2|${attendee.affiliation}|${attendee.title}|${attendee.name}|${tshirt}|${id}`;
    }
    return `v2|${attendee.affiliation}|${attendee.title}|${attendee.name}|${tshirt}`;
  }

  /**
   * 참석자 정보를 QR 문자열로 인코딩 (옵션에 따라 평문 또는 Base64URL 콤팩트 암호화)
   */
  public encodeAttendee(attendee: AttendeeInput, encrypted: boolean = false): string {
    const plainText = this.toPlainPayloadString(attendee);
    if (encrypted) {
      return this.encryptCompactString(plainText);
    }
    return plainText;
  }

  /**
   * 참석자 정보를 구분자 콤팩트 규격으로 변환 후 Base64URL 이진 바이너리 AES-256-GCM 암호화
   */
  public encryptAttendeeCompact(attendee: AttendeeInput): string {
    const plainText = this.toPlainPayloadString(attendee);
    return this.encryptCompactString(plainText);
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
   * 평문 문자열을 Hex 구분자 형태로 암호화 (하위 호환용)
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
   * 문자열을 분석하여 QRPayload 객체로 복원 (평문 / 콤팩트 암호문 / Hex 암호문 / JSON 자동 감지)
   */
  public decryptToPayload(input: string): QRPayload {
    if (!input || typeof input !== 'string') {
      throw new Error('QR 데이터가 비어있습니다.');
    }

    const trimmed = input.trim();

    // 1. 평문 v2 구분자 포맷 직접 파싱 (v2|affiliation|title|name|tshirt|ts)
    if (trimmed.startsWith('v2|') || trimmed.startsWith('2|')) {
      return this.parseV2Plain(trimmed);
    }

    // 2. 평문 v1 구분자 포맷 직접 파싱 (v1|id|name|affiliation|title|ts)
    if (trimmed.startsWith('v1|') || trimmed.startsWith('1|')) {
      return this.parseV1Plain(trimmed);
    }

    // 3. 평문 JSON 포맷 직접 파싱
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const payload = JSON.parse(trimmed) as QRPayload;
        if (payload.n && payload.a) return payload;
      } catch {
        // 복호화 시도로 이동
      }
    }

    // 4. 암호문 복호화 수행 (Base64URL 또는 Hex 구분자)
    const decryptedStr = this.decryptString(trimmed);

    // 복호화된 문자열 재파싱
    if (decryptedStr.startsWith('v2|') || decryptedStr.startsWith('2|')) {
      return this.parseV2Plain(decryptedStr);
    }

    if (decryptedStr.startsWith('v1|') || decryptedStr.startsWith('1|')) {
      return this.parseV1Plain(decryptedStr);
    }

    if (decryptedStr.startsWith('{')) {
      const payload = JSON.parse(decryptedStr) as QRPayload;
      if (payload.n) return payload;
    }

    // 구분자 포맷 fallback 파싱
    if (decryptedStr.includes('|')) {
      const parts = decryptedStr.split('|');
      if (parts.length >= 4) {
        return {
          v: 2,
          a: parts[1] || '',
          t: parts[2] || '',
          n: parts[3] || '',
          s: parts[4] || '',
          ts: (parts[5] ? Number(parts[5]) : Date.now()),
        };
      }
    }

    throw new Error('유효하지 않은 QR 페이로드 포맷입니다.');
  }

  /**
   * v2 평문 파싱: v2|affiliation|title|name|tshirt (신규 규격) 또는 v2|affiliation|title|name|tshirt|id (v1.5 일련번호 규격)
   */
  private parseV2Plain(str: string): QRPayload {
    const parts = str.split('|');
    if (parts.length < 4) {
      throw new Error('v2 QR 데이터 필드가 부족합니다.');
    }
    const [vStr, a, t, n, s, extra1, extra2] = parts;
    const v = Number(vStr.replace(/^v/, '')) || 2;
    let id: string | undefined;
    let ts = Date.now();

    if (extra1) {
      if (/^\d{5,6}$/.test(extra1)) {
        id = extra1;
        if (extra2) ts = Number(extra2) || Date.now();
      } else {
        ts = Number(extra1) || Date.now();
        if (extra2) id = extra2;
      }
    }

    return {
      v,
      id,
      a: a || '',
      t: t || '',
      n: n || '',
      s: s || '',
      ts,
    };
  }

  /**
   * v1 평문 파싱: v1|id|name|affiliation|title|ts
   */
  private parseV1Plain(str: string): QRPayload {
    const parts = str.split('|');
    const [vStr, id, n, a, t, tsStr] = parts;
    const v = Number(vStr.replace(/^v/, '')) || 1;
    const ts = Number(tsStr) || Date.now();
    return {
      v,
      id: id || '',
      n: n || '',
      a: a || '',
      t: t || '',
      ts,
    };
  }

  /**
   * AES-256-GCM 암호문 복호화 (Hex 구분자 포맷 및 콤팩트 Base64URL 바이너리 포맷 지원)
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
