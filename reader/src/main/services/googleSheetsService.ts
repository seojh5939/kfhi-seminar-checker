import { GoogleAuthService } from './googleAuthService';
import { GoogleSpreadsheetItem, ScanRecord } from 'shared';

export interface SpreadsheetDetails {
  id: string;
  title: string;
  sheetTitles: string[];
}

export class GoogleSheetsService {
  private authService: GoogleAuthService;

  constructor(authService: GoogleAuthService) {
    this.authService = authService;
  }

  /**
   * 구글 시트 URL 또는 ID에서 순수 spreadsheetId 추출
   */
  public extractSpreadsheetId(urlOrId: string): string {
    const trimmed = (urlOrId || '').trim();
    const urlMatch = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (urlMatch && urlMatch[1]) {
      return urlMatch[1];
    }
    return trimmed;
  }

  /**
   * 최근 수정한 스프레드시트 목록 조회 (최대 10개)
   */
  public async listRecentSpreadsheets(limit = 10): Promise<GoogleSpreadsheetItem[]> {
    const accessToken = await this.authService.getValidAccessToken();

    const query = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
    const fields = encodeURIComponent('files(id,name,modifiedTime,webViewLink)');
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&pageSize=${limit}&orderBy=modifiedTime desc&fields=${fields}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`스프레드시트 목록 조회 실패 (${res.status}): ${errText}`);
    }

    const data: any = await res.json();
    return (data.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink || `https://docs.google.com/spreadsheets/d/${f.id}/edit`,
    }));
  }

  /**
   * 스프레드시트 정보 및 시트 탭 목록 조회
   */
  public async getSpreadsheetDetails(urlOrId: string): Promise<SpreadsheetDetails> {
    const spreadsheetId = this.extractSpreadsheetId(urlOrId);
    if (!spreadsheetId) {
      throw new Error('올바른 스프레드시트 ID 또는 URL을 입력해주세요.');
    }

    const accessToken = await this.authService.getValidAccessToken();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets.properties(sheetId,title)`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 404) {
        throw new Error('스프레드시트를 찾을 수 없습니다. URL 또는 ID를 확인해주세요.');
      }
      if (res.status === 403) {
        throw new Error('스프레드시트에 접근 권한이 없습니다. 시트 공유 권한을 확인해주세요.');
      }
      throw new Error(`스프레드시트 정보 조회 실패 (${res.status}): ${errText}`);
    }

    const data: any = await res.json();
    const sheetTitles = (data.sheets || []).map((s: any) => s.properties?.title || '').filter(Boolean);

    return {
      id: data.spreadsheetId,
      title: data.properties?.title || '제목 없음',
      sheetTitles,
    };
  }

  /**
   * 신규 스프레드시트 생성
   */
  public async createSpreadsheet(title?: string): Promise<GoogleSpreadsheetItem> {
    const accessToken = await this.authService.getValidAccessToken();

    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const DD = String(now.getDate()).padStart(2, '0');
    const defaultTitle = `기아대책_행사_출입기록_${YYYY}${MM}${DD}`;
    const targetTitle = title && title.trim() ? title.trim() : defaultTitle;

    const url = 'https://sheets.googleapis.com/v4/spreadsheets';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: targetTitle,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`스프레드시트 생성 실패 (${res.status}): ${errText}`);
    }

    const data: any = await res.json();
    return {
      id: data.spreadsheetId,
      name: data.properties?.title || targetTitle,
      webViewLink: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
    };
  }

  /**
   * 장소별 시트(탭) 존재 여부 확인 및 없으면 자동 생성 + 헤더 초기화
   */
  public async ensureLocationTab(spreadsheetId: string, locationName: string): Promise<void> {
    const rawId = this.extractSpreadsheetId(spreadsheetId);
    const locName = (locationName || '기본장소').trim();
    const details = await this.getSpreadsheetDetails(rawId);

    const accessToken = await this.authService.getValidAccessToken();

    // 1. 해당 장소 탭이 없는 경우 새로 추가
    if (!details.sheetTitles.includes(locName)) {
      const addSheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${rawId}:batchUpdate`;
      const batchRes = await fetch(addSheetUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: locName,
                },
              },
            },
          ],
        }),
      });

      if (!batchRes.ok) {
        const errText = await batchRes.text();
        console.error('Add sheet error:', errText);
        throw new Error(`장소 탭 [${locName}] 생성 실패: ${errText}`);
      }

      // 2. 새 탭의 1행에 7개 표준 헤더 작성 (Google Sheets REST range: '{sheetName}'!A1:G1 URL encoded)
      const encodedRange = encodeURIComponent(`'${locName}'!A1:G1`);
      const headerUrl = `https://sheets.googleapis.com/v4/spreadsheets/${rawId}/values/${encodedRange}?valueInputOption=USER_ENTERED`;
      const headerRes = await fetch(headerUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [['이사회명', '직함', '성명', '티셔츠사이즈', '방문장소', '방문시각', '중복방문여부']],
        }),
      });

      if (!headerRes.ok) {
        const errText = await headerRes.text();
        console.error('Header update error:', errText);
      }
    }
  }

  /**
   * 스캔 기록들을 지정한 장소 시트(탭)에 실시간 행 추가 (values.append)
   */
  public async appendRecords(
    spreadsheetId: string,
    locationName: string,
    records: ScanRecord[]
  ): Promise<{ success: boolean; count: number }> {
    if (!records || records.length === 0) {
      return { success: true, count: 0 };
    }

    const rawId = this.extractSpreadsheetId(spreadsheetId);
    const locName = (locationName || '기본장소').trim();

    // 탭 존재 및 헤더 확인
    await this.ensureLocationTab(rawId, locName);

    const accessToken = await this.authService.getValidAccessToken();

    // 엑셀/CSV 규격과 100% 동일한 7개 열 데이터 매핑
    const rows = records.map((r) => [
      r.affiliation || '',
      r.title || '',
      r.name || '',
      r.tshirtSize || '',
      r.location || locName,
      r.scannedAt || '',
      r.isDuplicate ? '중복' : '정상',
    ]);

    // Google Sheets REST API values.append: POST .../values/{range}:append?valueInputOption=USER_ENTERED
    const encodedRange = encodeURIComponent(`'${locName}'!A:G`);
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${rawId}/values/${encodedRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const res = await fetch(appendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: rows,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Append rows error:', errText);
      throw new Error(`구글 시트 행 추가 실패 (${res.status}): ${errText}`);
    }

    return { success: true, count: records.length };
  }
}
