import React, { useState, useEffect } from 'react';
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

  const handleScanSuccess = (record: ScanRecord) => {
    setScanHistory((prev) => [record, ...prev]);

    if (record.isDuplicate) {
      setCurrentResult({
        type: 'DUPLICATE',
        message: `[중복 입장] ${record.name} (${record.affiliation}) 님은 이미 출입 처리되었습니다.`,
        record,
      });
    } else {
      setCurrentResult({
        type: 'SUCCESS',
        message: `[입장 완료] ${record.name} (${record.affiliation} ${record.title}) 환영합니다!`,
        record,
      });
    }

    // 2.5초 후 팝업 자동 닫기
    setTimeout(() => {
      setCurrentResult(null);
    }, 2500);
  };

  const handleScanError = (msg: string) => {
    setCurrentResult({
      type: 'ERROR',
      message: msg,
    });

    setTimeout(() => {
      setCurrentResult(null);
    }, 2500);
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
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: '24px', backgroundColor: '#0f172a', color: '#f8fafc', minHeight: '100vh' }}>
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

      {/* 장소 미설정 모달/폼 */}
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* 좌측: 실시간 카메라 ROI 스캐너 */}
          <div>
            <div style={{ backgroundColor: '#1e293b', padding: '16px', borderRadius: '12px', marginBottom: '16px' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#cbd5e1' }}>초고속 QR 라이브 스캔</h3>
              <Scanner
                locationName={locationName}
                onScanSuccess={handleScanSuccess}
                onScanError={handleScanError}
              />
            </div>

            {/* 결과 팝업 배너 */}
            {currentResult && (
              <div
                style={{
                  padding: '16px 20px',
                  borderRadius: '10px',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  backgroundColor:
                    currentResult.type === 'SUCCESS'
                      ? '#065f46'
                      : currentResult.type === 'DUPLICATE'
                      ? '#854d0e'
                      : '#991b1b',
                  color: 'white',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
                  transition: 'all 0.3s ease',
                }}
              >
                {currentResult.message}
              </div>
            )}
          </div>

          {/* 우측: 방금 인식된 리스트 이력 */}
          <div style={{ backgroundColor: '#1e293b', padding: '16px', borderRadius: '12px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#cbd5e1', display: 'flex', justifyContent: 'space-between' }}>
              <span>최근 스캔 기록</span>
              <span style={{ color: '#38bdf8' }}>총 {scanHistory.length} 명</span>
            </h3>

            <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
              {scanHistory.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
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
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
