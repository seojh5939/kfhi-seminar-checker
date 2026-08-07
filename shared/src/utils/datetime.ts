/**
 * 한국 표준시(KST, Asia/Seoul) YYYY-MM-DD HH:mm:ss 포맷 문자열 반환
 */
export function formatKSTDateTime(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '00';

  let hour = getPart('hour');
  if (hour === '24') hour = '00';

  return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${hour}:${getPart('minute')}:${getPart('second')}`;
}
