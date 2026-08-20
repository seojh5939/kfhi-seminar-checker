import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Scanner } from './components/Scanner';
import { ScanRecord, GoogleAuthStatus, GoogleSpreadsheetItem, GoogleSyncConfig } from 'shared';
import appPackageJson from '../../package.json';
import kfhiLogo from '../assets/kfhi-logo.png';

declare global {
  interface Window {
    electronAPI?: {
      selectOutputDir: (locationName?: string) => Promise<string | null>;
      exportCsv: (records: any[], targetPath: string) => Promise<{ success: boolean; count?: number; error?: string }>;
      exportDesktopBackup: (records: any[], locationName: string) => Promise<{ success: boolean; filePath: string; fileName: string; count: number; error?: string }>;
      decryptPayload: (cipherText: string, secretKey?: string) => Promise<{ success: boolean; payload?: any; error?: string }>;
      openFolder: (folderPath: string) => Promise<void>;

      // Google APIs
      googleGetStatus: () => Promise<GoogleAuthStatus>;
      googleSelectCredentialsFile: () => Promise<string | null>;
      googleLogin: () => Promise<{ success: boolean; userEmail?: string; userName?: string; error?: string }>;
      googleLogout: () => Promise<boolean>;
      googleListRecentSheets: (limit?: number) => Promise<GoogleSpreadsheetItem[]>;
      googleGetSpreadsheetDetails: (urlOrId: string) => Promise<{ id: string; title: string; sheetTitles: string[] }>;
      googleCreateSpreadsheet: (title?: string) => Promise<GoogleSpreadsheetItem>;
      googleSyncRecords: (spreadsheetId: string, locationName: string, records: any[]) => Promise<{ success: boolean; count: number; error?: string }>;
      googleOpenSheetUrl: (url: string) => Promise<void>;
    };
  }
}

export const App: React.FC = () => {
  const [locationName, setLocationName] = useState<string>(() => {
    return localStorage.getItem('kfhi_reader_location') || '';
  });
  const [isLocationSet, setIsLocationSet] = useState<boolean>(() => {
    return !!localStorage.getItem('kfhi_reader_location');
  });
  const [inputLocation, setInputLocation] = useState<string>('');
  const locationInputRef = useRef<HTMLInputElement>(null);

  // 장소 입력 화면으로 전환될 때마다 인풋에 자동 포커스 복구 (Alt+Tab 방지)
  useEffect(() => {
    if (!isLocationSet) {
      const timer = setTimeout(() => {
        locationInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLocationSet]);

  const [scanHistory, setScanHistory] = useState<ScanRecord[]>(() => {
    const saved = localStorage.getItem('kfhi_scan_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [showHistoryToggle, setShowHistoryToggle] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  // 유니크 참석 인원 카운트 (중복 스캔 제외)
  const uniqueAttendeeCount = scanHistory.filter((r) => !r.isDuplicate).length;

  // QR 스캔 성공 팝업 노출 시간 설정 (초 단위, 기본 3초)
  const [popupDuration, setPopupDuration] = useState<number>(() => {
    const saved = localStorage.getItem('kfhi_reader_popup_duration');
    return saved ? Math.max(1, Math.min(30, Number(saved))) : 3;
  });

  const handlePopupDurationChange = (seconds: number) => {
    setPopupDuration(seconds);
    localStorage.setItem('kfhi_reader_popup_duration', String(seconds));
  };

  const [customBg, setCustomBg] = useState<string>(() => {
    return localStorage.getItem('kfhi_reader_bg') || '';
  });
  const [showBgModal, setShowBgModal] = useState<boolean>(false);

  // ==========================================
  // Google Sheets 실시간 연동 상태
  // ==========================================
  const [showGoogleModal, setShowGoogleModal] = useState<boolean>(false);
  const [googleAuth, setGoogleAuth] = useState<GoogleAuthStatus>({
    hasCredentialsFile: false,
    isAuthenticated: false,
  });
  const [googleSyncConfig, setGoogleSyncConfig] = useState<GoogleSyncConfig>(() => {
    const saved = localStorage.getItem('kfhi_google_sync_config');
    return saved
      ? JSON.parse(saved)
      : {
          spreadsheetId: '',
          spreadsheetTitle: '',
          autoSyncEnabled: true,
        };
  });

  // 동기화 대기 큐 (Local-First Zero-Loss Queue)
  const [syncQueue, setSyncQueue] = useState<ScanRecord[]>(() => {
    const saved = localStorage.getItem('kfhi_google_sync_queue');
    return saved ? JSON.parse(saved) : [];
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncStatus, setLastSyncStatus] = useState<string>('');

  // 다중 기기 Quota 방어 및 Rate Limiter Ref 상태
  const syncQueueRef = useRef<ScanRecord[]>(syncQueue);
  const googleSyncConfigRef = useRef<GoogleSyncConfig>(googleSyncConfig);
  const locationNameRef = useRef<string>(locationName);
  const isSyncingRef = useRef<boolean>(false);
  const syncDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const backoffUntilRef = useRef<number>(0);
  const retryCountRef = useRef<number>(0);
  const lastRequestTimeRef = useRef<number>(0); // 단일 기기 최소 요청 간격(1.5초) 보장용 타임스탬프

  useEffect(() => {
    syncQueueRef.current = syncQueue;
    localStorage.setItem('kfhi_google_sync_queue', JSON.stringify(syncQueue));
  }, [syncQueue]);

  useEffect(() => {
    googleSyncConfigRef.current = googleSyncConfig;
    localStorage.setItem('kfhi_google_sync_config', JSON.stringify(googleSyncConfig));
  }, [googleSyncConfig]);

  useEffect(() => {
    locationNameRef.current = locationName;
  }, [locationName]);

  // 시트 설정 입력 상태
  const [inputSheetUrl, setInputSheetUrl] = useState<string>('');
  const [recentSheets, setRecentSheets] = useState<GoogleSpreadsheetItem[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState<boolean>(false);
  const [sheetActionMsg, setSheetActionMsg] = useState<string>('');

  // 구글 인증 상태 새로고침
  const refreshGoogleAuthStatus = useCallback(async () => {
    if (window.electronAPI?.googleGetStatus) {
      try {
        const status = await window.electronAPI.googleGetStatus();
        setGoogleAuth(status);
      } catch (e) {
        console.error('Failed to get google status:', e);
      }
    }
  }, []);

  useEffect(() => {
    refreshGoogleAuthStatus();
  }, [refreshGoogleAuthStatus]);

  useEffect(() => {
    localStorage.setItem('kfhi_scan_history', JSON.stringify(scanHistory));
  }, [scanHistory]);

  // 최근 시트 목록 조회
  const loadRecentSheets = async () => {
    if (!window.electronAPI?.googleListRecentSheets || !googleAuth.isAuthenticated) return;
    setIsLoadingRecent(true);
    setSheetActionMsg('');
    try {
      const sheets = await window.electronAPI.googleListRecentSheets(10);
      setRecentSheets(sheets);
    } catch (e: any) {
      setSheetActionMsg(`시트 목록 조회 실패: ${e.message}`);
    } finally {
      setIsLoadingRecent(false);
    }
  };

  // 구글 로그인 처리
  const handleGoogleLogin = async () => {
    if (!window.electronAPI?.googleLogin) return;
    setSheetActionMsg('브라우저에서 로그인을 진행해주세요...');
    try {
      const res = await window.electronAPI.googleLogin();
      if (res.success) {
        await refreshGoogleAuthStatus();
        setSheetActionMsg(`✅ ${res.userEmail || '계정'} 로그인 완료!`);
        loadRecentSheets();
      } else {
        setSheetActionMsg(`❌ 로그인 실패: ${res.error}`);
      }
    } catch (e: any) {
      setSheetActionMsg(`❌ 로그인 오류: ${e.message}`);
    }
  };

  // [버그수정 1] 구글 로그아웃 시 UI 즉시 갱신 및 상태 초기화
  const handleGoogleLogout = async () => {
    if (!window.electronAPI?.googleLogout) return;
    if (confirm('구글 계정 연결을 해제하시겠습니까?')) {
      await window.electronAPI.googleLogout();

      // UI 상태 즉시 미인증으로 리셋
      setGoogleAuth((prev) => ({
        hasCredentialsFile: prev.hasCredentialsFile,
        credentialsPath: prev.credentialsPath,
        isAuthenticated: false,
        userEmail: undefined,
        userName: undefined,
      }));

      const clearedConfig: GoogleSyncConfig = {
        spreadsheetId: '',
        spreadsheetTitle: '',
        autoSyncEnabled: false,
      };
      setGoogleSyncConfig(clearedConfig);
      googleSyncConfigRef.current = clearedConfig;
      localStorage.removeItem('kfhi_google_sync_config');

      setRecentSheets([]);
      setSheetActionMsg('로그아웃되었습니다.');
      await refreshGoogleAuthStatus();
    }
  };

  // 키 파일 수동 선택
  const handleSelectCredentialsFile = async () => {
    if (!window.electronAPI?.googleSelectCredentialsFile) return;
    const path = await window.electronAPI.googleSelectCredentialsFile();
    if (path) {
      alert(`키 파일이 설정되었습니다:\n${path}`);
      await refreshGoogleAuthStatus();
    }
  };

  // 구글 시트 URL/ID로 연동
  const handleConnectSheetByUrl = async () => {
    if (!inputSheetUrl.trim()) {
      alert('구글 시트 URL 또는 ID를 입력해주세요.');
      return;
    }
    if (!window.electronAPI?.googleGetSpreadsheetDetails) return;

    setSheetActionMsg('시트 정보를 확인 중입니다...');
    try {
      const details = await window.electronAPI.googleGetSpreadsheetDetails(inputSheetUrl.trim());
      const newConfig: GoogleSyncConfig = {
        spreadsheetId: details.id,
        spreadsheetTitle: details.title,
        autoSyncEnabled: true,
      };
      setGoogleSyncConfig(newConfig);
      googleSyncConfigRef.current = newConfig;
      setInputSheetUrl('');
      setSheetActionMsg(`✅ [${details.title}] 시트가 성공적으로 연동되었습니다!`);
    } catch (e: any) {
      setSheetActionMsg(`❌ 시트 연결 실패: ${e.message}`);
    }
  };

  // 최근 시트 드롭다운에서 선택하여 연동
  const handleSelectRecentSheet = (sheet: GoogleSpreadsheetItem) => {
    const newConfig: GoogleSyncConfig = {
      spreadsheetId: sheet.id,
      spreadsheetTitle: sheet.name,
      autoSyncEnabled: true,
    };
    setGoogleSyncConfig(newConfig);
    googleSyncConfigRef.current = newConfig;
    setSheetActionMsg(`✅ [${sheet.name}] 시트가 선택되었습니다.`);
  };

  // 새 시트 자동 생성
  const handleCreateNewSpreadsheet = async () => {
    if (!window.electronAPI?.googleCreateSpreadsheet) return;
    setSheetActionMsg('새 구글 스프레드시트를 생성하는 중입니다...');
    try {
      const newSheet = await window.electronAPI.googleCreateSpreadsheet();
      const newConfig: GoogleSyncConfig = {
        spreadsheetId: newSheet.id,
        spreadsheetTitle: newSheet.name,
        autoSyncEnabled: true,
      };
      setGoogleSyncConfig(newConfig);
      googleSyncConfigRef.current = newConfig;
      setSheetActionMsg(`🎉 새 시트 [${newSheet.name}] 가 생성 및 연동되었습니다!`);
      loadRecentSheets();
    } catch (e: any) {
      setSheetActionMsg(`❌ 새 시트 생성 실패: ${e.message}`);
    }
  };

  // 연동 해제
  const handleDisconnectSheet = () => {
    if (confirm('현재 구글 스프레드시트 연동을 해제하시겠습니까?')) {
      const newConfig: GoogleSyncConfig = {
        spreadsheetId: '',
        spreadsheetTitle: '',
        autoSyncEnabled: false,
      };
      setGoogleSyncConfig(newConfig);
      googleSyncConfigRef.current = newConfig;
      setSheetActionMsg('시트 연동이 해제되었습니다.');
    }
  };

  // 브라우저에서 시트 열기
  const handleOpenSheetInBrowser = () => {
    if (!googleSyncConfig.spreadsheetId || !window.electronAPI?.googleOpenSheetUrl) return;
    const url = `https://docs.google.com/spreadsheets/d/${googleSyncConfig.spreadsheetId}/edit`;
    window.electronAPI.googleOpenSheetUrl(url);
  };

  // [다중 기기 Quota 방어 2 & 3] 지능형 마이크로 배치 및 429 지수 백오프 동기화 워커
  const processSyncQueue = useCallback(async () => {
    if (isSyncingRef.current) return;

    // 429 한도 초과 백오프 대기 시간 확인
    const now = Date.now();
    if (now < backoffUntilRef.current) {
      const remainingSec = Math.ceil((backoffUntilRef.current - now) / 1000);
      setLastSyncStatus(`호출량 조절 중 (${remainingSec}초 후 재시도)`);
      return;
    }

    // 단일 기기 최소 요청 간격(1.5초) 강제 보장 -> 단일 기기당 분당 최대 40회(안전구역)로 물리적 락다운
    if (now - lastRequestTimeRef.current < 1500) {
      return;
    }

    const queue = syncQueueRef.current;
    const config = googleSyncConfigRef.current;
    const currentLoc = locationNameRef.current || '기본장소';

    if (queue.length === 0) return;
    if (!config.autoSyncEnabled || !config.spreadsheetId) return;
    if (!window.electronAPI?.googleSyncRecords) return;

    lastRequestTimeRef.current = Date.now();
    isSyncingRef.current = true;
    setIsSyncing(true);

    // 1회 요청에 최대 25건 묶음(Batch) 전송으로 분당 API 호출 수 극적 절감
    const batch = queue.slice(0, 25);

    try {
      const res = await window.electronAPI.googleSyncRecords(
        config.spreadsheetId,
        currentLoc,
        batch
      );

      if (res.success) {
        // 성공 시 큐에서 처리 완료된 배치 제거 및 백오프 리셋
        setSyncQueue((prev) => prev.slice(batch.length));
        retryCountRef.current = 0;
        backoffUntilRef.current = 0;
        setLastSyncStatus(`실시간 동기화 완료 (${new Date().toLocaleTimeString()})`);
      } else {
        // 429 Rate Limit 감지 시 지수 백오프 + 무작위 지터 적용
        if (res.error?.includes('429') || res.error?.includes('RATE_LIMIT')) {
          retryCountRef.current = Math.min(retryCountRef.current + 1, 5);
          const backoffDelay = Math.min(30000, 2000 * Math.pow(2, retryCountRef.current) + Math.random() * 1000);
          backoffUntilRef.current = Date.now() + backoffDelay;
          setLastSyncStatus(`API 한도 조절 대기 중 (${Math.round(backoffDelay / 1000)}초)`);
        } else {
          setLastSyncStatus(`동기화 지연: ${res.error}`);
        }
      }
    } catch (e: any) {
      setLastSyncStatus(`네트워크 대기: ${e.message}`);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, []);

  // 주기적 동기화 폴링 타이머 (2.5초 간격)
  useEffect(() => {
    const timer = setInterval(() => {
      processSyncQueue();
    }, 2500);
    return () => clearInterval(timer);
  }, [processSyncQueue]);

  const handleBgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setCustomBg(base64);
        localStorage.setItem('kfhi_reader_bg', base64);
        alert('인식기 배경화면이 성공적으로 변경되었습니다!');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetBg = () => {
    setCustomBg('');
    localStorage.removeItem('kfhi_reader_bg');
    alert('기본 배경(다크 네이비)으로 초기화되었습니다.');
  };

  const [currentResult, setCurrentResult] = useState<{
    type: 'SUCCESS' | 'DUPLICATE' | 'ERROR';
    message: string;
    record?: ScanRecord;
  } | null>(null);

  const handleLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputLocation.trim()) return;
    const loc = inputLocation.trim();
    setLocationName(loc);
    locationNameRef.current = loc;
    localStorage.setItem('kfhi_reader_location', loc);
    setIsLocationSet(true);
  };

  // [버그수정 2] 장소 변경 처리 (백업 후 인풋 포커스 보장)
  const handleLocationResetWithBackup = async () => {
    if (!confirm('장소 변경을 진행하시겠습니까?')) {
      return;
    }

    if (window.electronAPI?.exportDesktopBackup) {
      const res = await window.electronAPI.exportDesktopBackup(scanHistory, locationName);
      if (res.success) {
        alert(`방문 기록이 바탕화면에 정상 저장되었습니다.\n\n저장 위치: ${res.filePath}`);
      } else {
        alert(`바탕화면 자동 저장 중 오류가 발생했습니다: ${res.error}`);
      }
    }

    setScanHistory([]);
    localStorage.removeItem('kfhi_scan_history');
    localStorage.removeItem('kfhi_reader_location');

    setShowSettingsModal(false);
    setIsLocationSet(false);
    setInputLocation('');
  };

  // [기능변경 3] QR 인증 내역 초기화 (비밀번호 제거, 즉시 confirm 확인)
  const handleResetHistoryClick = () => {
    if (!confirm('정말 초기화하시겠습니까? 그동안의 모든 인증 및 방문 기록이 삭제됩니다.')) {
      return;
    }
    setScanHistory([]);
    localStorage.removeItem('kfhi_scan_history');
    setSyncQueue([]);
    localStorage.removeItem('kfhi_google_sync_queue');
    setShowSettingsModal(false);
    alert('인증 내역이 성공적으로 초기화되었습니다.');
  };

  const popupTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleScanSuccess = (record: ScanRecord) => {
    // 1. 로컬 상태 및 스토리지 즉시 추가 (0ms 지연)
    setScanHistory((prev) => [record, ...prev]);

    // 2. 구글 시트 동기화 큐에 추가 및 800ms 마이크로 디바운스 배치 전송 트리거
    if (googleSyncConfigRef.current.autoSyncEnabled && googleSyncConfigRef.current.spreadsheetId) {
      setSyncQueue((prev) => [...prev, record]);

      if (syncDebounceTimerRef.current) {
        clearTimeout(syncDebounceTimerRef.current);
      }
      syncDebounceTimerRef.current = setTimeout(() => {
        processSyncQueue();
      }, 800);
    }

    if (popupTimerRef.current) {
      clearTimeout(popupTimerRef.current);
    }

    const tshirtInfo = record.tshirtSize ? ` · 사이즈: ${record.tshirtSize}` : '';
    if (record.isDuplicate) {
      setCurrentResult({
        type: 'DUPLICATE',
        message: `😊 또 오셨네요! 환영합니다! (이미 출입 완료 - ${record.name} ${record.title}${tshirtInfo})`,
        record,
      });
    } else {
      setCurrentResult({
        type: 'SUCCESS',
        message: `🎉 [입장 완료] ${record.name} (${record.affiliation} ${record.title}${tshirtInfo}) 님 환영합니다!`,
        record,
      });
    }

    popupTimerRef.current = setTimeout(() => {
      setCurrentResult(null);
    }, popupDuration * 1000);
  };

  const handleScanError = (msg: string) => {
    if (popupTimerRef.current) {
      clearTimeout(popupTimerRef.current);
    }

    setCurrentResult({
      type: 'ERROR',
      message: msg,
    });

    popupTimerRef.current = setTimeout(() => {
      setCurrentResult(null);
    }, popupDuration * 1000);
  };

  // [기능변경 3] CSV 내보내기 (비밀번호 제거, 즉시 저장 경로 다이얼로그 호출)
  const handleExportCsvClick = async () => {
    if (scanHistory.length === 0) {
      alert('내보낼 방문 기록이 없습니다.');
      return;
    }
    const currentLoc = locationName || localStorage.getItem('kfhi_reader_location') || '장소미지정';
    if (window.electronAPI) {
      const filePath = await window.electronAPI.selectOutputDir(currentLoc);
      if (filePath) {
        const result = await window.electronAPI.exportCsv(scanHistory, filePath);
        if (result.success) {
          alert(`총 ${result.count}건의 방문 기록이 CSV로 정상 내보내기 되었습니다.`);
        } else {
          alert(`CSV 내보내기 실패: ${result.error}`);
        }
      }
    }
  };

  return (
    <div
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        backgroundColor: customBg ? 'transparent' : '#0f172a',
        color: '#f8fafc',
        width: '100%',
        minHeight: '100vh',
        boxSizing: 'border-box',
        margin: 0,
        position: 'relative',
        zIndex: 1,
      }}
    >
      {/* 1920x1080 고정 배경 레이어 */}
      {customBg && (
        <div
          style={{
            position: 'fixed',
            top: '80px',
            left: 0,
            width: '100vw',
            height: 'calc(100vh - 80px)',
            zIndex: -1,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <img
            src={customBg}
            alt="Program Background"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'fill',
              objectPosition: 'center',
              display: 'block',
            }}
          />
        </div>
      )}

      {/* 100% Full Width 상단 Header Bar */}
      <header
        style={{
          width: '100%',
          marginTop: 0,
          marginBottom: '24px',
          padding: '16px 0',
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          backdropFilter: 'blur(12px)',
          borderRadius: 0,
          borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            maxWidth: '1360px',
            width: '100%',
            margin: '0 auto',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <img
              src={kfhiLogo}
              alt="희망친구 기아대책"
              style={{ height: '42px', objectFit: 'contain', display: 'block' }}
            />
            <div>
              <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: '#38bdf8' }}>
                기아대책 출입관리 QR 인식기
              </h1>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#cbd5e1' }}>
                {isLocationSet ? `현재 장소: [ ${locationName} ]` : '스캔 시작 전 장소를 먼저 등록해주세요'}
              </p>
            </div>
          </div>

          {/* 구글 시트 연동 상태 인디케이터 배지 & 설정 버튼 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setShowGoogleModal(true)}
              style={{
                backgroundColor: googleSyncConfig.spreadsheetId ? 'rgba(16, 185, 129, 0.15)' : '#334155',
                color: googleSyncConfig.spreadsheetId ? '#34d399' : '#cbd5e1',
                border: googleSyncConfig.spreadsheetId ? '1px solid #10b981' : '1px solid #475569',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
              title="구글 스프레드시트 실시간 연동 설정 열기"
            >
              <span>📊 구글 시트:</span>
              {googleSyncConfig.spreadsheetId ? (
                <>
                  <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {googleSyncConfig.spreadsheetTitle}
                  </span>
                  <span style={{ fontSize: '12px', color: '#a7f3d0' }}>({locationName || '탭'} 탭)</span>
                  {syncQueue.length > 0 ? (
                    <span style={{ backgroundColor: '#eab308', color: '#000', padding: '1px 6px', borderRadius: '10px', fontSize: '11px', fontWeight: '900' }}>
                      {syncQueue.length}건 대기
                    </span>
                  ) : (
                    <span style={{ color: '#10b981' }}>● 실시간</span>
                  )}
                </>
              ) : (
                <span style={{ color: '#94a3b8' }}>미연동 (로컬 단독)</span>
              )}
            </button>

            {isLocationSet && (
              <button
                onClick={() => setShowSettingsModal(true)}
                style={{
                  backgroundColor: '#334155',
                  color: '#f8fafc',
                  border: '1px solid #475569',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                }}
              >
                ⚙️ 설정
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 메인 컨텐츠 영역 */}
      <main style={{ padding: '0 24px 24px 24px' }}>
        {!isLocationSet ? (
          <div style={{ maxWidth: '420px', margin: '60px auto', backgroundColor: '#1e293b', padding: '32px', borderRadius: '16px', textAlign: 'center', border: '1px solid #334155' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '16px', color: '#f8fafc' }}>📍 스캔 장소 등록</h2>
            <form onSubmit={handleLocationSubmit}>
              <input
                ref={locationInputRef}
                type="text"
                placeholder="예: 입구, 행복한나눔, 로비"
                value={inputLocation}
                onChange={(e) => setInputLocation(e.target.value)}
                autoFocus
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #475569',
                  backgroundColor: '#0f172a',
                  color: 'white',
                  marginBottom: '16px',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#0284c7',
                  color: 'white',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '15px',
                }}
              >
                스캔 시작하기
              </button>
            </form>
          </div>
        ) : (
          <div style={{ maxWidth: '680px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* QR 스캔 영역 */}
            <div
              style={{
                width: '100%',
                backgroundColor: 'rgba(30, 41, 59, 0.88)',
                backdropFilter: 'blur(12px)',
                padding: '24px',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                boxSizing: 'border-box',
                marginBottom: '20px',
                textAlign: 'center',
              }}
            >
              <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#38bdf8', textAlign: 'center', fontWeight: 'bold' }}>
                명찰의 QR코드를 카메라에 보여주세요
              </h3>
              <Scanner
                locationName={locationName}
                scanHistory={scanHistory}
                onScanSuccess={handleScanSuccess}
                onScanError={handleScanError}
              />
            </div>

            {/* 최근 스캔기록 */}
            <div
              style={{
                width: '100%',
                backgroundColor: 'rgba(30, 41, 59, 0.88)',
                backdropFilter: 'blur(12px)',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => setShowHistoryToggle((prev) => !prev)}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  backgroundColor: '#334155',
                  color: '#f8fafc',
                  border: 'none',
                  fontSize: '15px',
                  fontWeight: 'bold',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <span>📋 최근 스캔 기록 (실제 참석: {uniqueAttendeeCount} 명 / 총 {scanHistory.length} 건)</span>
                <span>{showHistoryToggle ? '▲ 접기' : '▼ 펼치기'}</span>
              </button>

              {showHistoryToggle && (
                <div style={{ padding: '16px', maxHeight: '300px', overflowY: 'auto' }}>
                  {scanHistory.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                      스캔된 기록이 아직 없습니다.
                    </div>
                  ) : (
                    scanHistory.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '12px',
                          backgroundColor: '#0f172a',
                          borderRadius: '8px',
                          marginBottom: '8px',
                          borderLeft: item.isDuplicate ? '4px solid #eab308' : '4px solid #10b981',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '15px' }}>
                            {item.name} <span style={{ fontSize: '12px', color: '#94a3b8' }}>({item.affiliation} {item.title}{item.tshirtSize ? ` · ${item.tshirtSize}` : ''})</span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                            {item.managementNumber ? `관리번호: ${item.managementNumber} | ` : ''}스캔시각: {item.scannedAt}
                          </div>
                        </div>
                        {item.isDuplicate && (
                          <span style={{ backgroundColor: '#854d0e', color: '#fef08a', fontSize: '11px', padding: '2px 6px', borderRadius: '4px' }}>
                            중복
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ======================================================== */}
      {/* 📊 구글 스프레드시트 실시간 연동 관리 모달 */}
      {/* ======================================================== */}
      {showGoogleModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.82)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10005,
            padding: '24px',
            backdropFilter: 'blur(6px)',
          }}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              padding: '32px',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '640px',
              border: '1px solid #475569',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
              maxHeight: '90vh',
              overflowY: 'auto',
              color: '#f8fafc',
            }}
          >
            {/* 상단 모달 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '14px', borderBottom: '1px solid #334155' }}>
              <h2 style={{ margin: 0, fontSize: '20px', color: '#38bdf8', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📊 구글 스프레드시트 실시간 연동
              </h2>
              <button
                onClick={() => setShowGoogleModal(false)}
                style={{
                  backgroundColor: '#334155',
                  color: '#f8fafc',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                ✖ 닫기
              </button>
            </div>

            {/* 안내 메시지 */}
            {sheetActionMsg && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  backgroundColor: sheetActionMsg.startsWith('❌') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                  border: sheetActionMsg.startsWith('❌') ? '1px solid #ef4444' : '1px solid #38bdf8',
                  color: sheetActionMsg.startsWith('❌') ? '#fca5a5' : '#7dd3fc',
                  fontSize: '13px',
                  marginBottom: '16px',
                  lineHeight: 1.4,
                }}
              >
                {sheetActionMsg}
              </div>
            )}

            {/* 1. 구글 계정 인증 섹션 */}
            <div style={{ backgroundColor: '#0f172a', padding: '18px', borderRadius: '12px', marginBottom: '16px', border: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#38bdf8' }}>1. 조직 계정 로그인</span>
                <span style={{ fontSize: '12px', color: googleAuth.isAuthenticated ? '#34d399' : '#94a3b8' }}>
                  {googleAuth.isAuthenticated ? '🟢 로그인 완료' : '⚪ 미인증 상태'}
                </span>
              </div>

              {!googleAuth.isAuthenticated ? (
                <div>
                  <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#94a3b8', lineHeight: 1.4 }}>
                    회사 구글 계정으로 로그인하여 스프레드시트 쓰기 권한을 승인합니다.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={handleGoogleLogin}
                      style={{
                        padding: '10px 18px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: '#0284c7',
                        color: 'white',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      🔑 구글 계정 로그인 (브라우저 열림)
                    </button>
                    {!googleAuth.hasCredentialsFile && (
                      <button
                        onClick={handleSelectCredentialsFile}
                        style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          border: '1px solid #475569',
                          backgroundColor: '#1e293b',
                          color: '#cbd5e1',
                          fontSize: '13px',
                          cursor: 'pointer',
                        }}
                      >
                        📁 키 파일(JSON) 직접 선택
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#f8fafc' }}>
                      {googleAuth.userEmail || '조직 구글 계정'}
                    </div>
                    {googleAuth.userName && (
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>{googleAuth.userName}</div>
                    )}
                  </div>
                  <button
                    onClick={handleGoogleLogout}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: '1px solid #991b1b',
                      backgroundColor: 'rgba(220, 38, 38, 0.15)',
                      color: '#fca5a5',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                    }}
                  >
                    로그아웃
                  </button>
                </div>
              )}
            </div>

            {/* 2. 연동 스프레드시트 지정 섹션 */}
            {googleAuth.isAuthenticated && (
              <div style={{ backgroundColor: '#0f172a', padding: '18px', borderRadius: '12px', marginBottom: '16px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#38bdf8', marginBottom: '12px' }}>
                  2. 연동할 스프레드시트 지정
                </div>

                {/* 현재 연동된 시트 표시 */}
                {googleSyncConfig.spreadsheetId ? (
                  <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: 'rgba(16, 185, 129, 0.12)', border: '1px solid #10b981', marginBottom: '16px' }}>
                    <div style={{ fontSize: '12px', color: '#34d399', fontWeight: 'bold', marginBottom: '4px' }}>
                      ✅ 현재 연동 중인 스프레드시트
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#ffffff' }}>
                      {googleSyncConfig.spreadsheetTitle}
                    </div>
                    <div style={{ fontSize: '12px', color: '#a7f3d0', marginTop: '4px' }}>
                      기록 장소 탭: <b>[{locationName || '기본장소'}]</b> 탭에 실시간 기록됨
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                      <button
                        onClick={handleOpenSheetInBrowser}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: '#10b981',
                          color: '#064e3b',
                          fontWeight: 'bold',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        🌐 웹에서 시트 열기
                      </button>
                      <button
                        onClick={handleDisconnectSheet}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px solid #475569',
                          backgroundColor: '#1e293b',
                          color: '#f87171',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        연동 해제
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* 방식 1: 시트 링크(URL) 직접 붙여넣기 */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#cbd5e1', marginBottom: '6px' }}>
                    🔗 방법 1: 구글 시트 URL 링크 붙여넣기 (가장 확실함)
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="https://docs.google.com/spreadsheets/d/... 주소 붙여넣기"
                      value={inputSheetUrl}
                      onChange={(e) => setInputSheetUrl(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #475569',
                        backgroundColor: '#1e293b',
                        color: 'white',
                        fontSize: '13px',
                      }}
                    />
                    <button
                      onClick={handleConnectSheetByUrl}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: '#0284c7',
                        color: 'white',
                        fontWeight: 'bold',
                        fontSize: '13px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      연동하기
                    </button>
                  </div>
                </div>

                {/* 방법 2 & 3 */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '12px', borderTop: '1px solid #1e293b', paddingTop: '14px' }}>
                  <button
                    onClick={loadRecentSheets}
                    disabled={isLoadingRecent}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: '1px solid #475569',
                      backgroundColor: '#1e293b',
                      color: '#cbd5e1',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                    }}
                  >
                    {isLoadingRecent ? '조회 중...' : '📋 최근 시트 10개 불러오기'}
                  </button>

                  <button
                    onClick={handleCreateNewSpreadsheet}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: '#059669',
                      color: 'white',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                    }}
                  >
                    ➕ 새 출입기록 시트 생성
                  </button>
                </div>

                {/* 최근 시트 목록 표시 */}
                {recentSheets.length > 0 && (
                  <div style={{ marginTop: '14px', maxHeight: '180px', overflowY: 'auto', backgroundColor: '#1e293b', borderRadius: '8px', padding: '8px' }}>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px', padding: '0 4px' }}>
                      최근 수정된 상위 10개 시트 (클릭하여 연동):
                    </div>
                    {recentSheets.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => handleSelectRecentSheet(s)}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          backgroundColor: googleSyncConfig.spreadsheetId === s.id ? '#0284c7' : 'transparent',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '4px',
                        }}
                      >
                        <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{s.name}</span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                          {s.modifiedTime ? new Date(s.modifiedTime).toLocaleDateString() : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3. 실시간 동기화 상태 및 수동 전송 */}
            {googleSyncConfig.spreadsheetId && (
              <div style={{ backgroundColor: '#0f172a', padding: '18px', borderRadius: '12px', border: '1px solid #334155' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#38bdf8' }}>3. 실시간 동기화 상태</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={googleSyncConfig.autoSyncEnabled}
                      onChange={(e) =>
                        setGoogleSyncConfig((prev) => ({ ...prev, autoSyncEnabled: e.target.checked }))
                      }
                    />
                    자동 동기화 켜짐
                  </label>
                </div>

                <div style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
                  - 대기 중인 전송 건수: <b style={{ color: syncQueue.length > 0 ? '#fde047' : '#34d399' }}>{syncQueue.length} 건</b><br />
                  {lastSyncStatus && <span>- 상태: {lastSyncStatus}</span>}
                </div>

                {syncQueue.length > 0 && (
                  <button
                    onClick={processSyncQueue}
                    disabled={isSyncing}
                    style={{
                      marginTop: '10px',
                      padding: '8px 14px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                    }}
                  >
                    {isSyncing ? '전송 중...' : '지금 즉시 전송'}
                  </button>
                )}
              </div>
            )}

            <div style={{ marginTop: '24px', textAlign: 'right' }}>
              <button
                onClick={() => setShowGoogleModal(false)}
                style={{
                  padding: '10px 24px',
                  backgroundColor: '#0284c7',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                확인 및 닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 설정 팝업 모달 */}
      {showSettingsModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9990,
            padding: '24px',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              padding: '32px',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '480px',
              border: '1px solid #475569',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', paddingBottom: '12px', borderBottom: '1px solid #334155' }}>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{
                  backgroundColor: '#334155',
                  color: '#f8fafc',
                  border: 'none',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                ⬅️ 뒤로가기
              </button>
              <h2 style={{ margin: 0, fontSize: '18px', color: '#38bdf8', fontWeight: 'bold' }}>⚙️ 인식기 설정</h2>
              <div style={{ width: '80px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* 구글 스프레드시트 실시간 연동 버튼 */}
              <button
                onClick={() => {
                  setShowSettingsModal(false);
                  setShowGoogleModal(true);
                }}
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: '#0284c7',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '16px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>📊 구글 스프레드시트 실시간 연동</span>
                <span style={{ fontSize: '13px', opacity: 0.9 }}>
                  {googleSyncConfig.spreadsheetId ? '🟢 연동됨' : '설정하기'}
                </span>
              </button>

              {/* ⏱️ QR 스캔 성공 팝업 노출 시간 조절 */}
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '10px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#38bdf8' }}>
                    ⏱️ 스캔 팝업 노출 시간
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                    QR 스캔 성공 시 화면에 유지되는 시간
                  </div>
                </div>
                <select
                  value={popupDuration}
                  onChange={(e) => handlePopupDurationChange(Number(e.target.value))}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: '#1e293b',
                    color: '#f8fafc',
                    border: '1px solid #475569',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value={1}>1초</option>
                  <option value={2}>2초</option>
                  <option value={3}>3초 (기본)</option>
                  <option value={4}>4초</option>
                  <option value={5}>5초</option>
                  <option value={7}>7초</option>
                  <option value={10}>10초</option>
                </select>
              </div>

              <button
                onClick={() => setShowBgModal(true)}
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '16px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>🖼️ 배경화면 변경 & 픽셀 가이드</span>
                <span style={{ fontSize: '13px', opacity: 0.9 }}>1920×1080 PNG</span>
              </button>

              <button
                onClick={handleExportCsvClick}
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: '#10b981',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '16px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>📥 CSV 파일 내보내기</span>
                <span style={{ fontSize: '13px', opacity: 0.8 }}>({uniqueAttendeeCount} 명)</span>
              </button>

              <button
                onClick={handleResetHistoryClick}
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: '#991b1b',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '16px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>🗑️ QR 인증내역 초기화</span>
                <span style={{ fontSize: '13px', opacity: 0.8 }}>즉시 초기화</span>
              </button>

              <button
                onClick={handleLocationResetWithBackup}
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: '#0284c7',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '16px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>📍 장소 변경</span>
                <span style={{ fontSize: '13px', opacity: 0.8 }}>바탕화면 자동 백업</span>
              </button>
            </div>

            <div
              style={{
                marginTop: '24px',
                paddingTop: '16px',
                borderTop: '1px solid #334155',
                textAlign: 'center',
                fontSize: '13px',
                color: '#64748b',
                fontWeight: '500',
              }}
            >
              기아대책 QR 인식기 v{appPackageJson.version}
            </div>
          </div>
        </div>
      )}

      {/* 대형 전면 팝업 모달 */}
      {currentResult && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '24px',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              backgroundColor:
                currentResult.type === 'SUCCESS'
                  ? '#064e3b'
                  : currentResult.type === 'DUPLICATE'
                  ? '#b45309'
                  : '#7f1d1d',
              border:
                currentResult.type === 'SUCCESS'
                  ? '4px solid #34d399'
                  : currentResult.type === 'DUPLICATE'
                  ? '4px solid #fde047'
                  : '4px solid #fca5a5',
              color: 'white',
              padding: '40px 32px',
              borderRadius: '24px',
              maxWidth: '650px',
              width: '90%',
              textAlign: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            }}
          >
            <div style={{ fontSize: '32px', fontWeight: '900', lineHeight: 1.4, wordBreak: 'keep-all' }}>
              {currentResult.message}
            </div>
            {currentResult.record && (
              <div style={{ marginTop: '20px', fontSize: '18px', color: '#e2e8f0', backgroundColor: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '10px' }}>
                방문장소: {currentResult.record.location} | 시각: {currentResult.record.scannedAt}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 인식기 전용 배경화면 설정 모달 */}
      {showBgModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10010,
            padding: '24px',
            backdropFilter: 'blur(6px)',
          }}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              padding: '32px',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '680px',
              border: '1px solid #475569',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
              color: '#f8fafc',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px',
                paddingBottom: '12px',
                borderBottom: '1px solid #334155',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '20px', color: '#38bdf8', fontWeight: 'bold' }}>
                🖼️ 배경화면 변경 및 디자인 픽셀 가이드
              </h2>
              <button
                onClick={() => setShowBgModal(false)}
                style={{
                  backgroundColor: '#334155',
                  color: '#f8fafc',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                ✖ 닫기
              </button>
            </div>

            <div style={{ backgroundColor: '#0f172a', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid #334155' }}>
              <label style={{ display: 'block', fontSize: '15px', fontWeight: 700, marginBottom: '8px', color: '#38bdf8' }}>
                1. 배경화면 이미지 업로드 (PNG / JPG, 1920×1080 권장)
              </label>
              <input
                type="file"
                accept="image/png, image/jpeg"
                onChange={handleBgImageUpload}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid #475569',
                  backgroundColor: '#1e293b',
                  color: 'white',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />

              {customBg && (
                <div style={{ marginTop: '16px' }}>
                  <button
                    onClick={handleResetBg}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#991b1b',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 'bold',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    🗑️ 배경 초기화 (기본 다크 네이비)
                  </button>
                </div>
              )}
            </div>

            <div style={{ backgroundColor: '#0f172a', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#38bdf8', fontWeight: 'bold' }}>
                📐 1920×1080 인식기 전용 배경 디자인 픽셀 가이드
              </h3>
              <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
                QR 인식기 화면 중앙에는 웹캠 스캔 뷰어가 위치합니다. 행사명, 후원사 로고, 메인 비주얼 등은 좌측/우측 사이드 영역에 배치해 주세요.
              </p>
            </div>

            <div style={{ marginTop: '24px', textAlign: 'right' }}>
              <button
                onClick={() => setShowBgModal(false)}
                style={{
                  padding: '10px 24px',
                  backgroundColor: '#0284c7',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                확인 및 닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
