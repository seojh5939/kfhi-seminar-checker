import { app, shell } from 'electron';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import { GoogleAuthStatus } from 'shared';

interface GoogleCredentials {
  client_id: string;
  client_secret: string;
  project_id?: string;
}

interface StoredTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  user_email?: string;
  user_name?: string;
}

export class GoogleAuthService {
  private customCredentialsPath: string | null = null;
  private activeServer: http.Server | null = null;

  private getTokensFilePath(): string {
    return path.join(app.getPath('userData'), 'google-tokens.json');
  }

  /**
   * google-credentials.json 경로 종합 탐색 (설치형 패키지, 포터블, AppData, 루트 전체 지원)
   */
  public findCredentialsPath(): string | null {
    if (this.customCredentialsPath && fs.existsSync(this.customCredentialsPath)) {
      return this.customCredentialsPath;
    }

    const candidateDirs: string[] = [
      // 1. 사용자 영구 AppData 폴더 (%APPDATA%/reader/) - 설치형에서 수동 선택 시 복사되는 위치
      app.getPath('userData'),

      // 2. 패키징된 실행 환경: exe 파일과 동일한 디렉터리 (포터블 또는 설치 폴더)
      process.execPath ? path.dirname(process.execPath) : '',

      // 3. 패키징된 리소스 폴더 (resources/)
      process.resourcesPath || '',

      // 4. asar 패키지 내부 및 내부 dist 폴더
      app.getAppPath(),
      path.join(app.getAppPath(), 'dist'),
      path.join(app.getAppPath(), 'dist', 'main'),
      path.resolve(app.getAppPath(), '..'),
      path.resolve(app.getAppPath(), '../..'),

      // 5. 작업 디렉터리 (프로젝트 루트 및 reader 폴더)
      process.cwd(),
      path.resolve(process.cwd(), 'reader'),
      path.resolve(process.cwd(), '..'),

      // 6. 사용자가 바탕화면이나 내 문서에 둘 경우 자동 감지
      app.getPath('desktop'),
      app.getPath('documents'),
    ].filter(Boolean);

    const filenames = [
      'google-credentials.json',
      'credentials.json',
      'client_secret.json',
      'client_secrets.json',
    ];

    for (const dir of candidateDirs) {
      for (const fn of filenames) {
        try {
          const fullPath = path.join(dir, fn);
          if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const parsed = JSON.parse(content);
            if (parsed.installed || parsed.web || (parsed.client_id && parsed.client_secret)) {
              return fullPath;
            }
          }
        } catch {
          // ignore parsing / permission error, try next
        }
      }
    }

    return null;
  }

  public setCustomCredentialsPath(filePath: string): boolean {
    if (fs.existsSync(filePath)) {
      this.customCredentialsPath = filePath;
      return true;
    }
    return false;
  }

  public getCredentials(): GoogleCredentials | null {
    const credPath = this.findCredentialsPath();
    if (!credPath) return null;

    try {
      const raw = fs.readFileSync(credPath, 'utf8');
      const data = JSON.parse(raw);

      if (data.installed) {
        return {
          client_id: data.installed.client_id,
          client_secret: data.installed.client_secret,
          project_id: data.installed.project_id,
        };
      }
      if (data.web) {
        return {
          client_id: data.web.client_id,
          client_secret: data.web.client_secret,
          project_id: data.web.project_id,
        };
      }
      if (data.client_id && data.client_secret) {
        return {
          client_id: data.client_id,
          client_secret: data.client_secret,
          project_id: data.project_id,
        };
      }
    } catch (e) {
      console.error('Failed to parse google-credentials.json:', e);
    }
    return null;
  }

  private loadTokens(): StoredTokens | null {
    const tokenFile = this.getTokensFilePath();
    if (!fs.existsSync(tokenFile)) return null;

    try {
      const raw = fs.readFileSync(tokenFile, 'utf8');
      return JSON.parse(raw) as StoredTokens;
    } catch (e) {
      console.error('Failed to read google-tokens.json:', e);
      return null;
    }
  }

  private saveTokens(tokens: StoredTokens): void {
    const tokenFile = this.getTokensFilePath();
    fs.writeFileSync(tokenFile, JSON.stringify(tokens, null, 2), 'utf8');
  }

  /**
   * 인증 상태 조회
   */
  public async getStatus(): Promise<GoogleAuthStatus> {
    const credPath = this.findCredentialsPath();
    const tokens = this.loadTokens();

    if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
      return {
        hasCredentialsFile: !!credPath,
        credentialsPath: credPath || undefined,
        isAuthenticated: false,
      };
    }

    try {
      const accessToken = await this.getValidAccessToken();
      return {
        hasCredentialsFile: !!credPath,
        credentialsPath: credPath || undefined,
        isAuthenticated: !!accessToken,
        userEmail: tokens.user_email,
        userName: tokens.user_name,
      };
    } catch {
      return {
        hasCredentialsFile: !!credPath,
        credentialsPath: credPath || undefined,
        isAuthenticated: false,
        userEmail: tokens.user_email,
        userName: tokens.user_name,
      };
    }
  }

  /**
   * 유효한 Access Token 획득 (만료 시 Refresh Token으로 자동 갱신)
   */
  public async getValidAccessToken(): Promise<string> {
    const tokens = this.loadTokens();
    if (!tokens) {
      throw new Error('구글 인증 정보가 없습니다. 먼저 로그인해주세요.');
    }

    const now = Date.now();
    // 토큰 만료 2분 전이면 갱신
    if (tokens.access_token && tokens.expiry_date && tokens.expiry_date > now + 120000) {
      return tokens.access_token;
    }

    if (!tokens.refresh_token) {
      if (tokens.access_token) return tokens.access_token;
      throw new Error('인증 토큰이 만료되었습니다. 다시 로그인해주세요.');
    }

    const creds = this.getCredentials();
    if (!creds) {
      throw new Error('google-credentials.json 파일을 찾을 수 없습니다.');
    }

    // Refresh token을 이용해 새 access_token 발급
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.client_id,
        client_secret: creds.client_secret,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`구글 토큰 갱신 실패 (${response.status}): ${errorText}`);
    }

    const data: any = await response.json();
    const newTokens: StoredTokens = {
      ...tokens,
      access_token: data.access_token,
      expiry_date: Date.now() + (data.expires_in || 3600) * 1000,
    };
    this.saveTokens(newTokens);
    return newTokens.access_token;
  }

  /**
   * OAuth 2.0 Loopback 로그인 실행
   */
  public login(): Promise<{ success: boolean; userEmail?: string; userName?: string; error?: string }> {
    return new Promise((resolve) => {
      const creds = this.getCredentials();
      if (!creds) {
        return resolve({
          success: false,
          error: 'google-credentials.json 파일을 찾을 수 없습니다. 설정에서 [📁 키 파일(JSON) 직접 선택]을 눌러 파일을 지정해주세요.',
        });
      }

      if (this.activeServer) {
        try {
          this.activeServer.close();
        } catch {
          // ignore
        }
        this.activeServer = null;
      }

      // 로컬 루프백 HTTP 서버 생성 (포트 0 -> OS가 임의의 빈 포트 자동 할당)
      const server = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url || '', true);
        const code = parsedUrl.query.code as string;
        const error = parsedUrl.query.error as string;

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html>
              <body style="font-family: sans-serif; background-color: #0f172a; color: #f87171; text-align: center; padding: 60px 20px;">
                <h2>❌ 구글 로그인 취소/실패</h2>
                <p style="color: #cbd5e1; font-size: 15px;">인증이 취소되었거나 오류가 발생했습니다 (${error}). 창을 닫고 다시 시도해주세요.</p>
              </body>
            </html>
          `);
          server.close();
          this.activeServer = null;
          return resolve({ success: false, error: `로그인 취소됨: ${error}` });
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('잘못된 요청입니다.');
          return;
        }

        try {
          const port = (server.address() as any)?.port;
          const redirectUri = `http://127.0.0.1:${port}`;

          // Code ➡️ Access/Refresh Token 교환
          const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: creds.client_id,
              client_secret: creds.client_secret,
              code,
              grant_type: 'authorization_code',
              redirect_uri: redirectUri,
            }).toString(),
          });

          if (!tokenRes.ok) {
            const errBody = await tokenRes.text();
            throw new Error(`토큰 발급 실패: ${errBody}`);
          }

          const tokenData: any = await tokenRes.json();
          const accessToken = tokenData.access_token;
          const refreshToken = tokenData.refresh_token;
          const expiresIn = tokenData.expires_in || 3600;

          // 사용자 정보(이메일, 프로필) 조회
          let userEmail = '';
          let userName = '';
          try {
            const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (userRes.ok) {
              const userInfo: any = await userRes.json();
              userEmail = userInfo.email || '';
              userName = userInfo.name || '';
            }
          } catch {
            // 사용자 정보 조회 실패 시에도 계속 진행
          }

          // 기존 토큰에 새 정보 덮어쓰기
          const existing = this.loadTokens();
          const tokensToSave: StoredTokens = {
            access_token: accessToken,
            refresh_token: refreshToken || existing?.refresh_token,
            expiry_date: Date.now() + expiresIn * 1000,
            user_email: userEmail || existing?.user_email,
            user_name: userName || existing?.user_name,
          };
          this.saveTokens(tokensToSave);

          // 브라우저에 성공 페이지 출력
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html>
              <head><title>기아대책 출입관리 QR 인식기 인증 성공</title></head>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; color: #f8fafc; text-align: center; padding: 60px 20px;">
                <div style="max-width: 480px; margin: 0 auto; background-color: #1e293b; padding: 40px; border-radius: 16px; border: 1px solid #334155; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                  <div style="font-size: 48px; margin-bottom: 16px;">🎉</div>
                  <h2 style="color: #38bdf8; margin: 0 0 12px 0;">구글 계정 인증 완료!</h2>
                  <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
                    <b style="color: #f1f5f9;">${userEmail || '계정'}</b>으로 성공적으로 연결되었습니다.<br/>
                    이 브라우저 창을 닫고 <b>QR 인식기 앱</b>으로 돌아가세요.
                  </p>
                </div>
              </body>
            </html>
          `);

          server.close();
          this.activeServer = null;
          resolve({ success: true, userEmail, userName });
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html>
              <body style="font-family: sans-serif; background-color: #0f172a; color: #f87171; text-align: center; padding: 60px 20px;">
                <h2>오류가 발생했습니다</h2>
                <p style="color: #cbd5e1;">${err.message}</p>
              </body>
            </html>
          `);
          server.close();
          this.activeServer = null;
          resolve({ success: false, error: err.message });
        }
      });

      server.listen(0, '127.0.0.1', () => {
        this.activeServer = server;
        const port = (server.address() as any).port;
        const redirectUri = `http://127.0.0.1:${port}`;

        const scopes = [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive.readonly',
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile',
        ].join(' ');

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
          client_id: creds.client_id,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: scopes,
          access_type: 'offline',
          prompt: 'consent',
        }).toString();

        shell.openExternal(authUrl);
      });

      server.on('error', (e) => {
        this.activeServer = null;
        resolve({ success: false, error: `로컬 인증 서버 시작 실패: ${e.message}` });
      });
    });
  }

  /**
   * 로그아웃 (토큰 삭제)
   */
  public logout(): boolean {
    const tokenFile = this.getTokensFilePath();
    if (fs.existsSync(tokenFile)) {
      try {
        fs.unlinkSync(tokenFile);
        return true;
      } catch (e) {
        console.error('Failed to delete google-tokens.json:', e);
      }
    }
    return true;
  }
}
