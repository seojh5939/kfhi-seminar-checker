import React, { useState, useEffect, useRef } from 'react';
import { Scanner } from './components/Scanner';
import { ScanRecord } from 'shared';

declare global {
  interface Window {
    electronAPI?: {
      selectOutputDir: () => Promise<string | null>;
      exportCsv: (records: any[], targetPath: string) => Promise<{ success: boolean; count?: number; error?: string }>;
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

  const handleLocationReset = () => {
    if (confirm('장소를 변경하시겠습니까? 기존 스캔 기록은 유지됩니다.')) {
      setIsLocationSet(false);
    }
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
        message: `[중복 입장] ${record.name} (${record.affiliation}) 님은 이미 처리되었습니다.`,
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

  const handleExportCsv = async () => {
    if (scanHistory.length === 0) {
      alert('내보낼 방문 기록이 없습니다.');
      return;
    }

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
              onClick={handleExportCsv}
              style={{
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '6px',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              CSV 내보내기 ({scanHistory.length}건)
            </button>
            <button
              onClick={handleLocationReset}
              style={{
                backgroundColor: '#475569',
                color: 'white',
                border: 'none',
                padding: '8px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              장소 변경
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
              <span>📋 최근 스캔 기록 ({scanHistory.length} 명)</span>
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
                  ? '#713f12'
                  : '#7f1d1d',
              border:
                currentResult.type === 'SUCCESS'
                  ? '4px solid #34d399'
                  : currentResult.type === 'DUPLICATE'
                  ? '4px solid #facc15'
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
