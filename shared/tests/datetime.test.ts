import { formatKSTDateTime } from '../src';

describe('formatKSTDateTime 유닛 테스트', () => {
  it('대한민국 서울 시간대(KST, UTC+9)로 YYYY-MM-DD HH:mm:ss 포맷을 반환한다', () => {
    // 2026-08-07 15:00:00 UTC -> 2026-08-08 00:00:00 KST
    const utcDate = new Date('2026-08-07T15:00:00.000Z');
    const result = formatKSTDateTime(utcDate);
    expect(result).toBe('2026-08-08 00:00:00');
  });

  it('기본값으로 현재 시간을 KST 포맷으로 반환한다', () => {
    const result = formatKSTDateTime();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
