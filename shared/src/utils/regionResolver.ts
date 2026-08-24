/**
 * 대한민국 국내 유선전화 지역번호 기반 2자리 지역코드(Prefix) 매핑 및 해석기 (v1.5)
 */

export interface RegionMappingItem {
  code: string;         // 2자리 코드 (예: '20', '31')
  name: string;         // 시/도 명칭 (예: '서울', '경기')
  areaCode: string;     // 원본 지역번호 (예: '02', '031')
  keywords: string[];   // 매칭 키워드 목록 (시/도 및 시·군·구)
}

/**
 * 전국 17개 광역시도별 지역번호 끝 2자리 및 시·군·구 매핑 테이블
 * (단, 서울 02는 특수 규칙 '20' 적용)
 */
export const REGION_CODE_TABLE: RegionMappingItem[] = [
  {
    code: '20',
    name: '서울',
    areaCode: '02',
    keywords: [
      '서울', '강남', '강동', '강북', '강서', '관악', '광진', '구로', '금천',
      '노원', '도봉', '동대문', '동작', '마포', '서대문', '서초', '성동', '성북',
      '송파', '양천', '영등포', '용산', '은평', '종로', '중랑', '여의도',
    ],
  },
  {
    code: '31',
    name: '경기',
    areaCode: '031',
    keywords: [
      '경기', '경기광주', '고양', '일산', '덕양', '과천', '광명', '구리', '군포', '김포',
      '남양주', '동두천', '부천', '성남', '분당', '수원', '영통', '팔달', '권선', '장안',
      '시흥', '안산', '안성', '안양', '양주', '양평', '여주', '연천', '오산', '용인',
      '수지', '기흥', '처인', '의왕', '의정부', '이천', '파주', '평택', '포천', '하남',
      '화성', '동탄', '판교',
    ],
  },
  {
    code: '32',
    name: '인천',
    areaCode: '032',
    keywords: ['인천', '부평', '계양', '남동', '연수', '미추홀', '강화', '옹진', '송도', '청라'],
  },
  {
    code: '33',
    name: '강원',
    areaCode: '033',
    keywords: [
      '강원', '춘천', '원주', '강릉', '동해', '태백', '속초', '삼척', '홍천', '횡성',
      '영월', '평창', '정선', '철원', '화천', '양구', '인제', '고성(강원)', '양양',
    ],
  },
  {
    code: '41',
    name: '충남',
    areaCode: '041',
    keywords: [
      '충남', '충청남', '천안', '공주', '보령', '아산', '서산', '논산', '계룡', '당진',
      '금산', '부여', '서천', '청양', '홍성', '예산', '태안',
    ],
  },
  {
    code: '42',
    name: '대전',
    areaCode: '042',
    keywords: ['대전', '유성', '대덕'],
  },
  {
    code: '43',
    name: '충북',
    areaCode: '043',
    keywords: [
      '충북', '충청북', '청주', '충주', '제천', '보은', '옥천', '영동', '증평', '진천',
      '괴산', '음성', '단양',
    ],
  },
  {
    code: '44',
    name: '세종',
    areaCode: '044',
    keywords: ['세종'],
  },
  {
    code: '51',
    name: '부산',
    areaCode: '051',
    keywords: [
      '부산', '해운대', '사하', '금정', '연제', '수영', '사상', '기장', '부산진', '동래',
      '영도',
    ],
  },
  {
    code: '52',
    name: '울산',
    areaCode: '052',
    keywords: ['울산', '울주'],
  },
  {
    code: '53',
    name: '대구',
    areaCode: '053',
    keywords: ['대구', '수성', '달서', '달성'],
  },
  {
    code: '54',
    name: '경북',
    areaCode: '054',
    keywords: [
      '경북', '경상북', '포항', '경주', '김천', '안동', '구미', '영주', '영천', '상주',
      '문경', '경산', '군위', '의성', '청송', '영양', '영덕', '청도', '고령', '성주',
      '칠곡', '예천', '봉화', '울진', '울릉', '독도',
    ],
  },
  {
    code: '55',
    name: '경남',
    areaCode: '055',
    keywords: [
      '경남', '경상남', '창원', '마산', '진해', '진주', '통영', '사천', '김해', '밀양',
      '거제', '양산', '의령', '함안', '창녕', '남해', '하동', '산청', '함양', '거창', '합천',
    ],
  },
  {
    code: '61',
    name: '전남',
    areaCode: '061',
    keywords: [
      '전남', '전라남', '목포', '여수', '순천', '나주', '광양', '담양', '곡성', '구례',
      '고흥', '보성', '화순', '장흥', '강진', '해남', '영암', '무안', '함평', '영광',
      '장성', '완도', '진도', '신안',
    ],
  },
  {
    code: '62',
    name: '광주',
    areaCode: '062',
    keywords: ['광주', '광산'],
  },
  {
    code: '63',
    name: '전북',
    areaCode: '063',
    keywords: [
      '전북', '전라북', '전주', '군산', '익산', '정읍', '남원', '김제', '완주', '진안',
      '무주', '장수', '임실', '순창', '고창', '부안',
    ],
  },
  {
    code: '64',
    name: '제주',
    areaCode: '064',
    keywords: ['제주', '서귀포'],
  },
];

const DEFAULT_REGION_CODE = '99'; // 기타/미분류 코드

/**
 * 소속/이사회명 문자열을 분석하여 해당 권역의 2자리 지역코드를 반환합니다.
 * @param affiliation 이사회명 또는 소속 텍스트 (예: '서울동대문후원이사회', '고양후원이사회', '서대문이사회')
 * @returns 2자리 지역코드 (예: '20', '31', '62', '99')
 */
export function resolveRegionCode(affiliation?: string, sheetName?: string): string {
  const matchCode = (text?: string): string | null => {
    if (!text || typeof text !== 'string') return null;
    const normalized = text.replace(/\s+/g, '').toLowerCase();

    // 1. 경기 광주 예외 처리
    if (normalized.includes('경기광주')) {
      return '31';
    }

    // 2. 전체 시도별 키워드 정합 검사
    for (const item of REGION_CODE_TABLE) {
      for (const kw of item.keywords) {
        const normKw = kw.toLowerCase();
        if (normalized.includes(normKw)) {
          return item.code;
        }
      }
    }
    return null;
  };

  // 1. 소속(이사회명)에서 지역코드 우선 판별
  const affCode = matchCode(affiliation);
  if (affCode) return affCode;

  // 2. 소속에서 판별되지 않으면 탭/시트명(관할 지역명)에서 판별
  const sheetCode = matchCode(sheetName);
  if (sheetCode) return sheetCode;

  // 3. 매칭 실패 시 기본 Fallback 코드 반환
  return DEFAULT_REGION_CODE;
}

/**
 * 2자리 지역코드로 지역 명칭을 조회합니다.
 */
export function getRegionName(code: string): string {
  const item = REGION_CODE_TABLE.find((r) => r.code === code);
  return item ? item.name : '기타';
}
