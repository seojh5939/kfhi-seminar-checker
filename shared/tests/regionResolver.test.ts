import { resolveRegionCode, getRegionName } from '../src/utils/regionResolver';

describe('RegionCodeResolver 유닛 테스트 (v1.5)', () => {
  test('서울 지역 이사회는 특수 규칙에 따라 20 코드를 반환한다', () => {
    expect(resolveRegionCode('서울후원이사회')).toBe('20');
    expect(resolveRegionCode('서울동대문후원이사회')).toBe('20');
    expect(resolveRegionCode('서대문이사회')).toBe('20');
    expect(resolveRegionCode('강남구이사회')).toBe('20');
    expect(resolveRegionCode('영등포이사회')).toBe('20');
  });

  test('경기 및 인천 지역 이사회는 31, 32 코드를 반환한다', () => {
    expect(resolveRegionCode('경기후원이사회')).toBe('31');
    expect(resolveRegionCode('고양후원이사회')).toBe('31');
    expect(resolveRegionCode('파주후원이사회')).toBe('31');
    expect(resolveRegionCode('수원지부')).toBe('31');
    expect(resolveRegionCode('부천이사회')).toBe('31');
    expect(resolveRegionCode('인천후원이사회')).toBe('32');
    expect(resolveRegionCode('부평이사회')).toBe('32');
  });

  test('전국 주요 광역시 및 도별 지역코드를 정상 판별한다', () => {
    expect(resolveRegionCode('강원춘천후원이사회')).toBe('33');
    expect(resolveRegionCode('천안아산이사회')).toBe('41'); // 충남 41
    expect(resolveRegionCode('대전유성이사회')).toBe('42'); // 대전 42
    expect(resolveRegionCode('청주이사회')).toBe('43');     // 충북 43
    expect(resolveRegionCode('세종이사회')).toBe('44');     // 세종 44
    expect(resolveRegionCode('부산해운대이사회')).toBe('51'); // 부산 51
    expect(resolveRegionCode('울산이사회')).toBe('52');     // 울산 52
    expect(resolveRegionCode('대구수성이사회')).toBe('53'); // 대구 53
    expect(resolveRegionCode('포항이사회')).toBe('54');     // 경북 54
    expect(resolveRegionCode('창원이사회')).toBe('55');     // 경남 55
    expect(resolveRegionCode('전남여수이사회')).toBe('61'); // 전남 61
    expect(resolveRegionCode('광주광역시후원이사회')).toBe('62'); // 광주 62
    expect(resolveRegionCode('전주완산이사회')).toBe('63'); // 전북 63
    expect(resolveRegionCode('제주서귀포이사회')).toBe('64'); // 제주 64
  });

  test('미분류 또는 빈 값인 경우 기본값 99를 반환한다', () => {
    expect(resolveRegionCode('')).toBe('99');
    expect(resolveRegionCode('해외선교본부')).toBe('99');
    expect(resolveRegionCode('미지정조직')).toBe('99');
  });

  test('지역코드로 한글 지역명을 조회한다', () => {
    expect(getRegionName('20')).toBe('서울');
    expect(getRegionName('31')).toBe('경기');
    expect(getRegionName('51')).toBe('부산');
    expect(getRegionName('99')).toBe('기타');
  });
});
