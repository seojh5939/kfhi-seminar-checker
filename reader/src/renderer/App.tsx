import React, { useState, useEffect, useRef } from 'react';
import { Scanner } from './components/Scanner';
import { ScanRecord } from 'shared';

declare global {
  interface Window {
    electronAPI?: {
      selectOutputDir: () => Promise<string | null>;
      exportCsv: (records: any[], targetPath: string) => Promise<{ success: boolean; count?: number; error?: string }>;
      exportDesktopBackup: (records: any[], locationName: string) => Promise<{ success: boolean; filePath: string; fileName: string; count: number; error?: string }>;
      decryptPayload: (cipherText: string, secretKey?: string) => Promise<{ success: boolean; payload?: any; error?: string }>;
      openFolder: (folderPath: string) => Promise<void>;
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

  const [scanHistory, setScanHistory] = useState<ScanRecord[]>(() => {
    const saved = localStorage.getItem('kfhi_scan_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [showHistoryToggle, setShowHistoryToggle] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  // 비밀번호 인증 모달 전용 상태 (CSV 내보내기 vs 인증내역 초기화)
  const [showPasswordModal, setShowPasswordModal] = useState<boolean>(false);
  const [authPurpose, setAuthPurpose] = useState<'CSV' | 'RESET'>('CSV');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string>('');

  // 유니크 참석 인원 카운트 (중복 스캔 제외)
  const uniqueAttendeeCount = scanHistory.filter((r) => !r.isDuplicate).length;

  const [currentResult, setCurrentResult] = useState<{
    type: 'SUCCESS' | 'DUPLICATE' | 'ERROR';
    message: string;
    record?: ScanRecord;
  } | null>(null);

  useEffect(() => {
    localStorage.setItem('kfhi_scan_history', JSON.stringify(scanHistory));
  }, [scanHistory]);

  const handleLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputLocation.trim()) return;
    const loc = inputLocation.trim();
    setLocationName(loc);
    localStorage.setItem('kfhi_reader_location', loc);
    setIsLocationSet(true);
  };

  // 장소 변경 처리 (1차 팝업 ➡️ 바탕화면에 자동 저장 ➡️ 저장위치 팝업 ➡️ 장소입력창 이동)
  const handleLocationResetWithBackup = async () => {
    if (!confirm('장소 변경을 진행하시겠습니까?')) {
      return;
    }

    // 바탕화면에 QR출입기록_장소명_날짜.csv 자동 저장
    if (window.electronAPI?.exportDesktopBackup) {
      const res = await window.electronAPI.exportDesktopBackup(scanHistory, locationName);
      if (res.success) {
        alert(`방문 기록이 바탕화면에 정상 저장되었습니다.\n\n저장 위치: ${res.filePath}`);
      } else {
        alert(`바탕화면 자동 저장 중 오류가 발생했습니다: ${res.error}`);
      }
    } else {
      // 웹 테스트 fallback
      alert(`[테스트] 방문 기록이 바탕화면에 저장되었습니다. (저장 파일명: QR출입기록_${locationName}_${new Date().toISOString().substring(0, 10)}.csv)`);
    }

    setShowSettingsModal(false);
    setIsLocationSet(false);
  };

  // QR 인증 내역 초기화 처리 (1차 경고 팝업 ➡️ 2차 2026-NDS 비밀번호 검증 ➡️ 초기화)
  const handleResetHistoryClick = () => {
    if (!confirm('정말 초기화하시겠습니까? 그동안의 인증기록이 모두 사라집니다.')) {
      return;
    }
    setAuthPurpose('RESET');
    setPasswordInput('');
    setPasswordError('');
    setShowPasswordModal(true);
  };

  const popupTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleScanSuccess = (record: ScanRecord) => {
    setScanHistory((prev) => [record, ...prev]);

    // 기존 팝업 타이머가 있으면 즉시 취소하고 새 팝업으로 3초 갱신
    if (popupTimerRef.current) {
      clearTimeout(popupTimerRef.current);
    }

    if (record.isDuplicate) {
      setCurrentResult({
        type: 'DUPLICATE',
        message: `😊 또 오셨네요! 환영합니다! (이미 출입 완료 - ${record.name} ${record.title})`,
        record,
      });
    } else {
      setCurrentResult({
        type: 'SUCCESS',
        message: `🎉 [입장 완료] ${record.name} (${record.affiliation} ${record.title}) 님 환영합니다!`,
        record,
      });
    }

    // 새로운 QR이 인식되면 그 시점부터 3초 동안 팝업 띄우기
    popupTimerRef.current = setTimeout(() => {
      setCurrentResult(null);
    }, 3000);
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
    }, 3000);
  };

  const handleExportCsvClick = () => {
    if (scanHistory.length === 0) {
      alert('내보낼 방문 기록이 없습니다.');
      return;
    }
    setAuthPurpose('CSV');
    setPasswordInput('');
    setPasswordError('');
    setShowPasswordModal(true);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput !== '2026-NDS') {
      setPasswordError('비밀번호가 올바르지 않습니다.');
      return;
    }

    setShowPasswordModal(false);

    if (authPurpose === 'RESET') {
      // 1. QR 인증내역 초기화 실행
      setScanHistory([]);
      localStorage.removeItem('kfhi_scan_history');
      setShowSettingsModal(false);
      alert('인증 내역이 성공적으로 초기화되었습니다.');
    } else {
      // 2. CSV 내보내기 다운로드 실행
      if (window.electronAPI) {
        const filePath = await window.electronAPI.selectOutputDir();
        if (filePath) {
          const result = await window.electronAPI.exportCsv(scanHistory, filePath);
          if (result.success) {
            alert(`총 ${result.count}건의 방문 기록이 CSV로 정상 내보내기 되었습니다.`);
          } else {
            alert(`CSV 내보내기 실패: ${result.error}`);
          }
        }
      } else {
        // 웹 브라우저 테스트 fallback
        const header = '관리번호,성명,소속,직함,방문장소,방문시각,중복방문여부\n';
        const rows = scanHistory
          .map(
            (r) =>
              `"${r.managementNumber}","${r.name}","${r.affiliation}","${r.title}","${r.location}","${r.scannedAt}","${r.isDuplicate ? '중복' : '정상'}"`
          )
          .join('\n');
        const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `방문기록_${locationName}_${new Date().toISOString().substring(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: '24px', backgroundColor: '#0f172a', color: '#f8fafc', minHeight: '100vh', position: 'relative' }}>
      {/* 헤더 */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #334155' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: '#38bdf8' }}>기아대책 출입관리 QR 인식기</h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
            {isLocationSet ? `현재 장소: [ ${locationName} ]` : '스캔 시작 전 장소를 먼저 등록해주세요'}
          </p>
        </div>
        {isLocationSet && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setShowSettingsModal(true)}
              style={{
                backgroundColor: '#334155',
                color: '#f8fafc',
                border: '1px solid #475569',
                padding: '8px 16px',
                borderRadius: '6px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              ⚙️ 설정
            </button>
          </div>
        )}
      </header>

      {/* 장소 미설정 폼 */}
      {!isLocationSet ? (
        <div style={{ maxWidth: '400px', margin: '60px auto', backgroundColor: '#1e293b', padding: '32px', borderRadius: '12px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '16px', color: '#f8fafc' }}>스캔 장소 등록</h2>
          <form onSubmit={handleLocationSubmit}>
            <input
              type="text"
              placeholder="예: 메인홀 입구, 부스 A"
              value={inputLocation}
              onChange={(e) => setInputLocation(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid #475569',
                backgroundColor: '#0f172a',
                color: 'white',
                marginBottom: '16px',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#0284c7',
                color: 'white',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              스캔 시작하기
            </button>
          </form>
        </div>
      ) : (
        <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* QR 스캔 영역 (가운데 정렬) */}
          <div style={{ width: '100%', backgroundColor: '#1e293b', padding: '24px', borderRadius: '16px', boxSizing: 'border-box', marginBottom: '20px', textAlign: 'center' }}>
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

          {/* 최근 스캔기록 하단 배치 + Toggle 버튼 */}
          <div style={{ width: '100%', backgroundColor: '#1e293b', borderRadius: '12px', overflow: 'hidden' }}>
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
                          {item.name} <span style={{ fontSize: '12px', color: '#94a3b8' }}>({item.affiliation} {item.title})</span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                          관리번호: {item.managementNumber} | {item.scannedAt}
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
            {/* 좌상단 뒤로가기 버튼 */}
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

            {/* 설정 메뉴 버튼 3종 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                <span style={{ fontSize: '13px', opacity: 0.8 }}>비밀번호 필요</span>
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
          </div>
        </div>
      )}

      {/* 관리자 비밀번호 검증 모달 */}
      {showPasswordModal && (
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
            zIndex: 10000,
            padding: '20px',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              padding: '32px',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '420px',
              textAlign: 'center',
              border: '1px solid #475569',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            }}
          >
            <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', color: '#38bdf8' }}>🔒 관리자 인증</h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#94a3b8' }}>
              비밀번호는 관리자에게 문의하시기 바랍니다
            </p>

            <form onSubmit={handlePasswordSubmit}>
              <input
                type="password"
                placeholder="비밀번호 입력"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                autoFocus
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: passwordError ? '2px solid #f87171' : '1px solid #475569',
                  backgroundColor: '#0f172a',
                  color: 'white',
                  fontSize: '16px',
                  marginBottom: '12px',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
              {passwordError && (
                <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '16px', textAlign: 'left' }}>
                  {passwordError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#475569',
                    color: 'white',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: authPurpose === 'RESET' ? '#dc2626' : '#10b981',
                    color: 'white',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  {authPurpose === 'RESET' ? '인증 및 초기화' : '인증 및 다운로드'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 대형 전면 팝업 모달 (화면 중앙 정렬, 큼직한 글씨) */}
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
    </div>
  );
};

export default App;
