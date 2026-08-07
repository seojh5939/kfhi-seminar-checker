import React, { useState, useEffect } from 'react';
import { AttendeeInput, ValidationErrorItem } from 'shared';
import kfhiLogo from '../assets/kfhi-logo.png';
import appPackageJson from '../../package.json';

export function App() {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    attendees: AttendeeInput[];
    errors: ValidationErrorItem[];
  } | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    attendeeName: string;
    managementNumber: string;
  } | null>(null);

  const [completedResult, setCompletedResult] = useState<{
    count: number;
    manifestPath: string;
    outputDir: string;
    attendees?: AttendeeInput[];
  } | null>(null);

  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationSummary, setVerificationSummary] = useState<{
    total: number;
    successCount: number;
    failCount: number;
    items: Array<{
      managementNumber: string;
      name: string;
      affiliation: string;
      title: string;
      fileName: string;
      status: 'success' | 'fail';
      decryptedPayload?: any;
      failReason?: string;
    }>;
  } | null>(null);

  const [customBg, setCustomBg] = useState<string>(() => {
    return localStorage.getItem('kfhi_generator_bg') || '';
  });
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showBgModal, setShowBgModal] = useState<boolean>(false);

  // 동적 수동 입력 탭 State (N명 입력 지원)
  const [activeTab, setActiveTab] = useState<'batch' | 'single'>('batch');
  const [manualRows, setManualRows] = useState<
    Array<{ id: string; managementNumber: string; name: string; affiliation: string; title: string }>
  >([{ id: '1', managementNumber: '', name: '', affiliation: '', title: '' }]);
  const [singleOutputDir, setSingleOutputDir] = useState<string | null>(null);
  const [singleGenerating, setSingleGenerating] = useState<boolean>(false);
  const [singleResult, setSingleResult] = useState<{
    success: boolean;
    count: number;
    outputDir: string;
    manifestPath: string;
  } | null>(null);

  const handleAddManualRow = () => {
    setManualRows((prev) => [
      ...prev,
      { id: String(Date.now() + Math.random()), managementNumber: '', name: '', affiliation: '', title: '' },
    ]);
  };

  const handleRemoveManualRow = (id: string) => {
    if (manualRows.length <= 1) {
      alert('최소 1명의 참석자 정보는 입력되어야 합니다.');
      return;
    }
    setManualRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleManualRowChange = (id: string, field: 'managementNumber' | 'name' | 'affiliation' | 'title', value: string) => {
    setManualRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const handleSingleSelectOutputDir = async () => {
    if (window.electron) {
      const selected = await window.electron.selectOutputDir();
      if (selected) setSingleOutputDir(selected);
    } else {
      setSingleOutputDir('C:\\Exported_QRCodes');
    }
  };

  const handleSingleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleOutputDir) {
      alert('QR 이미지를 저장할 폴더를 지정해 주세요.');
      return;
    }

    // 모든 행 입력 및 규칙 검증
    const attendeesToGenerate: AttendeeInput[] = [];
    const mgmtNoSet = new Set<string>();

    for (let i = 0; i < manualRows.length; i++) {
      const row = manualRows[i];
      const mgmtNo = row.managementNumber.trim();
      const name = row.name.trim();
      const affiliation = row.affiliation.trim();
      const title = row.title.trim();

      if (!mgmtNo || !name || !affiliation || !title) {
        alert(`${i + 1}번째 행의 모든 필드(관리번호, 성명, 소속, 직함)를 작성해 주세요.`);
        return;
      }
      if (!/^\d{5}$/.test(mgmtNo)) {
        alert(`${i + 1}번째 행의 관리번호[${mgmtNo}]는 5자리 숫자(예: 00001 ~ 99999)이어야 합니다.`);
        return;
      }
      if (mgmtNoSet.has(mgmtNo)) {
        alert(`중복된 관리번호가 발견되었습니다: [${mgmtNo}]. 각 입력건의 관리번호는 유일해야 합니다.`);
        return;
      }
      mgmtNoSet.add(mgmtNo);

      attendeesToGenerate.push({
        managementNumber: mgmtNo,
        name,
        affiliation,
        title,
      });
    }

    setSingleGenerating(true);

    if (window.electron) {
      const res = await window.electron.generateQRCodes({
        attendees: attendeesToGenerate,
        outputDir: singleOutputDir,
      });

      if (res.success) {
        setCompletedResult({
          count: attendeesToGenerate.length,
          outputDir: singleOutputDir,
          manifestPath: res.manifestPath,
          attendees: attendeesToGenerate,
        });
      } else {
        alert(`수동 입력 생성 실패: ${res.error}`);
      }
    } else {
      // Mock fallback for web
      setCompletedResult({
        count: attendeesToGenerate.length,
        outputDir: singleOutputDir,
        manifestPath: `${singleOutputDir}\\manifest.txt`,
        attendees: attendeesToGenerate,
      });
    }

    setSingleGenerating(false);
  };

  const handleBgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setCustomBg(base64);
        localStorage.setItem('kfhi_generator_bg', base64);
        alert('배경화면이 성공적으로 변경되었습니다!');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetBg = () => {
    setCustomBg('');
    localStorage.removeItem('kfhi_generator_bg');
    alert('기본 배경(다크 네이비)으로 초기화되었습니다.');
  };

  useEffect(() => {
    if (window.electron?.onProgress) {
      const cleanup = window.electron.onProgress((data) => {
        setProgress(data);
      });
      return cleanup;
    }
  }, []);

  const handleSelectExcel = async () => {
    let selectedFile: string | null = null;
    if (window.electron) {
      selectedFile = await window.electron.selectExcelFile();
    } else {
      selectedFile = 'C:\\mock\\sample_attendees.xlsx';
    }

    if (!selectedFile) return;

    setFilePath(selectedFile);
    setValidationResult(null);
    setCompletedResult(null);
    setVerificationSummary(null);
    setIsValidating(true);

    if (window.electron) {
      const result = await window.electron.validateExcel(selectedFile);
      setValidationResult(result);
    } else {
      setValidationResult({
        isValid: true,
        attendees: Array.from({ length: 800 }, (_, i) => ({
          managementNumber: String(i + 1).padStart(5, '0'),
          name: `참석자_${i + 1}`,
          affiliation: i % 2 === 0 ? '서울후원이사회' : '경기후원이사회',
          title: '스탭',
        })),
        errors: [],
      });
    }
    setIsValidating(false);
  };

  const handleSelectOutputDir = async () => {
    if (window.electron) {
      const selected = await window.electron.selectOutputDir();
      if (selected) setOutputDir(selected);
    } else {
      setOutputDir('C:\\Exported_QRCodes');
    }
  };

  const handleStartGenerate = async () => {
    if (!validationResult || !validationResult.isValid || !outputDir) return;

    setIsGenerating(true);
    setVerificationSummary(null);
    setProgress({ current: 0, total: validationResult.attendees.length, attendeeName: '', managementNumber: '' });

    if (window.electron) {
      const res = await window.electron.generateQRCodes({
        attendees: validationResult.attendees,
        outputDir,
      });

      if (res.success) {
        setCompletedResult({
          count: res.count,
          manifestPath: res.manifestPath,
          outputDir,
        });
      } else {
        alert(`생성 실패: ${res.error}`);
      }
    } else {
      for (let i = 1; i <= validationResult.attendees.length; i += 50) {
        await new Promise((r) => setTimeout(r, 100));
        setProgress({
          current: Math.min(i, validationResult.attendees.length),
          total: validationResult.attendees.length,
          attendeeName: `참석자_${i}`,
          managementNumber: String(i).padStart(5, '0'),
        });
      }
      setCompletedResult({
        count: validationResult.attendees.length,
        manifestPath: `${outputDir}\\manifest.txt`,
        outputDir,
      });
    }

    setIsGenerating(false);
  };

  const handleVerifyOutput = async () => {
    if (!completedResult) return;

    setIsVerifying(true);
    if (window.electron) {
      const res = await window.electron.verifyOutput({
        outputDir: completedResult.outputDir,
        manifestPath: completedResult.manifestPath,
      });

      if (res.success && res.summary) {
        setVerificationSummary(res.summary);
      } else {
        alert(`검증 오류: ${res.error || '검증을 완료하지 못했습니다.'}`);
      }
    } else {
      // Mock verification data
      setVerificationSummary({
        total: completedResult.count,
        successCount: completedResult.count,
        failCount: 0,
        items: (completedResult?.attendees || validationResult?.attendees || []).map((a) => ({
          managementNumber: a.managementNumber,
          name: a.name,
          affiliation: a.affiliation,
          title: a.title,
          fileName: `${a.managementNumber}.png`,
          status: 'success' as const,
          decryptedPayload: {
            v: 1,
            id: a.managementNumber,
            n: a.name,
            a: a.affiliation,
            t: a.title,
            ts: Date.now(),
          },
        })) || [],
      });
    }
    setIsVerifying(false);
  };

  const handleReset = () => {
    setFilePath(null);
    setOutputDir(null);
    setValidationResult(null);
    setProgress(null);
    setCompletedResult(null);
    setVerificationSummary(null);
    setManualRows([{ id: '1', managementNumber: '', name: '', affiliation: '', title: '' }]);
    setSingleOutputDir(null);
  };

  const handleOpenFolder = (path: string) => {
    if (window.electron) {
      window.electron.openFolder(path);
    }
  };

  const getUniqueAffiliationCount = (attendees: AttendeeInput[]) => {
    const set = new Set(attendees.map((a) => a.affiliation));
    return set.size;
  };

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', width: '100%', backgroundColor: customBg ? 'transparent' : '#0f172a' }}>
      {/* 1920x1080 고정 배경 레이어 (상단 Bar 가림 방지를 위해 Y 80px 기준점 적용, 하단까지 100% 핏) */}
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
          marginBottom: '20px',
          padding: '16px 0',
          backgroundColor: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(12px)',
          borderRadius: 0,
          borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            maxWidth: '1280px',
            width: '100%',
            margin: '0 auto',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxSizing: 'border-box',
          }}
        >
          <div className="logo-group" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <img
              src={kfhiLogo}
              alt="희망친구 기아대책"
              style={{ height: '42px', objectFit: 'contain', display: 'block' }}
            />
            <div>
              <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: '#38bdf8' }}>
                행사 출입관리 QR코드 생성기
              </h1>
              <p className="subtitle" style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#cbd5e1' }}>
                기아대책 오프라인 행사 전용 암호화 QR 인코더
              </p>
            </div>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => setShowSettingsModal(true)}
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            ⚙️ 설정
          </button>
        </div>
      </header>

      {/* 메인 컨텐츠 영역 */}
      <main className="app-container" style={{ paddingTop: 0, marginTop: 0 }}>

      {/* 대량 / 개별 생성 탭 버튼 바 */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
        <button
          onClick={() => setActiveTab('batch')}
          style={{
            flex: 1,
            padding: '14px 20px',
            borderRadius: '10px',
            border: activeTab === 'batch' ? '2px solid #38bdf8' : '1px solid #334155',
            backgroundColor: activeTab === 'batch' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(30, 41, 59, 0.88)',
            color: activeTab === 'batch' ? '#38bdf8' : '#94a3b8',
            fontWeight: 'bold',
            fontSize: '15px',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            transition: 'all 0.2s ease',
          }}
        >
          📁 1. 엑셀 명단 대량 QR 생성
        </button>
        <button
          onClick={() => setActiveTab('single')}
          style={{
            flex: 1,
            padding: '14px 20px',
            borderRadius: '10px',
            border: activeTab === 'single' ? '2px solid #38bdf8' : '1px solid #334155',
            backgroundColor: activeTab === 'single' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(30, 41, 59, 0.88)',
            color: activeTab === 'single' ? '#38bdf8' : '#94a3b8',
            fontWeight: 'bold',
            fontSize: '15px',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            transition: 'all 0.2s ease',
          }}
        >
          ✍️ 2. 개별 1줄 수동 입력 QR 생성 (긴급)
        </button>
      </div>

      {/* 탭 1: 엑셀 명단 대량 생성 */}
      {activeTab === 'batch' && (
        <>
          {/* STEP 1 & 2: 파일 업로드 및 검증 */}
      {!completedResult && !isGenerating && (
        <section className="glass-card">
          <h2 style={{ fontSize: '16px', marginBottom: '16px', fontWeight: 600 }}>
            1. 참석자 명단 엑셀 파일 선택 (.xlsx)
          </h2>

          <div className="dropzone" onClick={handleSelectExcel}>
            <div className="dropzone-icon">📁</div>
            <p style={{ fontWeight: 500, fontSize: '15px', marginBottom: '4px' }}>
              {filePath ? filePath : '클릭하여 참석자 명단 엑셀(.xlsx) 파일 업로드'}
            </p>
            <p className="subtitle">5자리 관리번호, 성명, 소속, 직함 헤더 항목 자동 인식</p>
          </div>

          {isValidating && (
            <div style={{ textAlign: 'center', marginTop: '16px', color: 'var(--accent-cyan)' }}>
              엑셀 입력 데이터 정밀 검증 중...
            </div>
          )}

          {/* 검증 오류 시 */}
          {validationResult && !validationResult.isValid && (
            <div style={{ marginTop: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <span className="badge badge-error">검증 실패</span>
                <span style={{ fontSize: '13px', color: 'var(--error-color)' }}>
                  총 {validationResult.errors.length}건의 입력 오류가 발견되었습니다. 엑셀을 수정 후 다시 업로드하세요.
                </span>
              </div>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>행번호</th>
                      <th>관리번호</th>
                      <th>성명</th>
                      <th>오류 사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validationResult.errors.map((err, idx) => (
                      <tr key={idx}>
                        <td>{err.rowNumber}행</td>
                        <td>{err.managementNumber || '-'}</td>
                        <td>{err.name || '-'}</td>
                        <td className="reason">{err.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 검증 성공 시 */}
          {validationResult && validationResult.isValid && (
            <div style={{ marginTop: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <span className="badge badge-success">검증 성공</span>
                <span style={{ fontSize: '14px', fontWeight: 500 }}>
                  총 {validationResult.attendees.length}명의 정상 참석자가 확인되었습니다.
                </span>
              </div>

              <div className="stat-grid">
                <div className="stat-item">
                  <div className="stat-label">총 생성 대상자</div>
                  <div className="stat-value">{validationResult.attendees.length} 명</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">소속 이사회 수</div>
                  <div className="stat-value">{getUniqueAffiliationCount(validationResult.attendees)} 개</div>
                </div>
              </div>

              {/* 저장 폴더 선택 */}
              <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '14px', marginBottom: '12px', fontWeight: 600 }}>
                  2. QR 이미지 및 매니페스트 저장 폴더 지정
                </h3>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <input
                    type="text"
                    readOnly
                    value={outputDir || ''}
                    placeholder="저장 폴더 경로를 선택하세요"
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      background: 'rgba(15, 23, 42, 0.6)',
                      color: 'var(--text-main)',
                      fontSize: '13px',
                    }}
                  />
                  <button className="btn btn-secondary" onClick={handleSelectOutputDir}>
                    폴더 선택
                  </button>
                </div>
              </div>

              {/* 생성 시작 버튼 */}
              <div style={{ marginTop: '24px', textAlign: 'right' }}>
                <button
                  className="btn btn-primary"
                  style={{ padding: '12px 28px', fontSize: '15px' }}
                  disabled={!outputDir}
                  onClick={handleStartGenerate}
                >
                  ⚡ 암호화 QR 코드 대량 생성 시작
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* STEP 3: 진행 중 */}
      {isGenerating && progress && (
        <section className="glass-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>
            AES-256-GCM 암호화 QR 생성 진행 중...
          </h2>
          <p className="subtitle" style={{ marginBottom: '24px' }}>
            지정한 폴더에 이미지(PNG) 저장 및 매니페스트 레코드를 작성 중입니다.
          </p>

          <div className="progress-container">
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)' }}>
              <span>
                처리 중: {progress.managementNumber} - {progress.attendeeName}
              </span>
              <span style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>
                {progress.current} / {progress.total} ({Math.round((progress.current / progress.total) * 100)}%)
              </span>
            </div>
          </div>
        </section>
      )}

      {/* STEP 4: 완료 리포트 */}
      {completedResult && (
        <section className="glass-card" style={{ textAlign: 'center', padding: '36px 24px' }}>
          <div style={{ fontSize: '44px', marginBottom: '8px' }}>🎉</div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--success-color)', marginBottom: '8px' }}>
            QR코드 대량 생성 완료!
          </h2>
          <p className="subtitle" style={{ marginBottom: '20px' }}>
            총 {completedResult.count}건의 암호화 QR 이미지 및 매니페스트 TXT가 정상 저장되었습니다.
          </p>

          <div className="stat-grid" style={{ marginBottom: '20px' }}>
            <div className="stat-item">
              <div className="stat-label">저장 완료 항목</div>
              <div className="stat-value">{completedResult.count} 건</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">매니페스트 파일</div>
              <div className="stat-value" style={{ fontSize: '14px', wordBreak: 'break-all' }}>
                manifest.txt (UTF-16 LE)
              </div>
            </div>
          </div>

          {/* 3개 버튼 구성 (반응형 btn-group) */}
          <div className="btn-group" style={{ marginBottom: '24px' }}>
            <button className="btn btn-primary" onClick={() => handleOpenFolder(completedResult.outputDir)}>
              📂 생성 폴더 열기
            </button>
            <button
              className="btn btn-secondary"
              style={{ background: 'rgba(56, 189, 248, 0.15)', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }}
              onClick={handleVerifyOutput}
              disabled={isVerifying}
            >
              {isVerifying ? '🔍 검증 진행 중...' : '🔍 생성물 검증하기'}
            </button>
            <button className="btn btn-secondary" onClick={handleReset}>
              🔄 새 엑셀 작업하기
            </button>
          </div>

          {/* 검증 진행 상태 */}
          {isVerifying && (
            <div style={{ textAlign: 'center', margin: '20px 0', color: 'var(--accent-cyan)' }}>
              생성된 QR PNG 복호화 및 매니페스트 엑셀 대조 검증 작업 수행 중...
            </div>
          )}

          {/* 검증 결과 리포트 */}
          {verificationSummary && (
            <div style={{ marginTop: '24px', textAlign: 'left', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  {verificationSummary.failCount === 0 ? (
                    <span className="badge badge-success">검증 완료 (100% 정상)</span>
                  ) : (
                    <span className="badge badge-error">검증 주의 ({verificationSummary.failCount}건 실패)</span>
                  )}
                  <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, whiteSpace: 'nowrap' }}>
                    QR 복호화 및 매니페스트 대조 검증 리포트
                  </h3>
                </div>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  성공: <strong style={{ color: 'var(--success-color)' }}>{verificationSummary.successCount}</strong> / 전체: {verificationSummary.total}건
                </span>
              </div>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>관리번호</th>
                      <th>성명</th>
                      <th>소속</th>
                      <th>직함</th>
                      <th>파일명</th>
                      <th>상태</th>
                      <th>복호화 평문 내용 (QR 스캔 원문)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {verificationSummary.items.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{item.managementNumber}</td>
                        <td>{item.name}</td>
                        <td>{item.affiliation}</td>
                        <td>{item.title}</td>
                        <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.fileName}</td>
                        <td>
                          {item.status === 'success' ? (
                            <span className="badge badge-success" style={{ padding: '2px 8px', fontSize: '11px' }}>
                              성공
                            </span>
                          ) : (
                            <span className="badge badge-error" style={{ padding: '2px 8px', fontSize: '11px' }}>
                              실패
                            </span>
                          )}
                        </td>
                        <td className="allow-wrap" style={{ fontSize: '12px', fontFamily: 'monospace' }}>
                          {item.status === 'success' && item.decryptedPayload ? (
                            <span style={{ color: '#a5f3fc' }}>
                              {`[${item.decryptedPayload.id}] ${item.decryptedPayload.n} / ${item.decryptedPayload.a} / ${item.decryptedPayload.t} (v${item.decryptedPayload.v})`}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--error-color)' }}>{item.failReason}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  )}

      {/* 탭 2: 긴급 수동 입력 (1명 ~ N명 동적 입력 지원) */}
      {activeTab === 'single' && !completedResult && (
        <section className="glass-card">
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', margin: 0, fontWeight: 700, color: '#38bdf8' }}>
              ✍️ 긴급 참석자 수동 입력 암호화 QR 생성
            </h2>
            <p className="subtitle" style={{ margin: '4px 0 0 0' }}>
              엑셀 파일 없이 현장에서 수동으로 직접 참석자 정보(관리번호, 성명, 소속, 직함)를 입력하여 즉시 암호화 QR 이미지(PNG)를 만듭니다.
            </p>
          </div>

          <form onSubmit={handleSingleGenerate} style={{ marginTop: '20px' }}>
            {manualRows.map((row, idx) => (
              <div
                key={row.id}
                style={{
                  backgroundColor: '#0f172a',
                  padding: '20px',
                  borderRadius: '12px',
                  border: '1px solid #334155',
                  marginBottom: '16px',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#38bdf8' }}>
                    👤 참석자 #{idx + 1}
                  </span>
                  {manualRows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveManualRow(row.id)}
                      style={{
                        backgroundColor: '#991b1b',
                        color: 'white',
                        border: 'none',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                      }}
                    >
                      🗑️ 행 삭제
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#cbd5e1' }}>
                      관리번호 (5자리 숫자) *
                    </label>
                    <input
                      type="text"
                      placeholder="예: 90001"
                      maxLength={5}
                      value={row.managementNumber}
                      onChange={(e) => handleManualRowChange(row.id, 'managementNumber', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #475569',
                        backgroundColor: '#1e293b',
                        color: 'white',
                        fontSize: '14px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#cbd5e1' }}>
                      성명 *
                    </label>
                    <input
                      type="text"
                      placeholder="예: 홍길동"
                      value={row.name}
                      onChange={(e) => handleManualRowChange(row.id, 'name', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #475569',
                        backgroundColor: '#1e293b',
                        color: 'white',
                        fontSize: '14px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#cbd5e1' }}>
                      소속 / 이사회명 *
                    </label>
                    <input
                      type="text"
                      placeholder="예: 서울후원이사회 / 본부"
                      value={row.affiliation}
                      onChange={(e) => handleManualRowChange(row.id, 'affiliation', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #475569',
                        backgroundColor: '#1e293b',
                        color: 'white',
                        fontSize: '14px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#cbd5e1' }}>
                      직함 *
                    </label>
                    <input
                      type="text"
                      placeholder="예: 이사 / 목사 / 스탭"
                      value={row.title}
                      onChange={(e) => handleManualRowChange(row.id, 'title', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #475569',
                        backgroundColor: '#1e293b',
                        color: 'white',
                        fontSize: '14px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}

            {/* 행 추가 버튼 하단 재배치 */}
            <div style={{ marginBottom: '24px' }}>
              <button
                type="button"
                onClick={handleAddManualRow}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  border: '2px dashed #0284c7',
                  backgroundColor: 'rgba(2, 132, 199, 0.1)',
                  color: '#38bdf8',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                ➕ 참석자 1명 더 추가하기 (+ 버튼)
              </button>
            </div>

            {/* 저장 폴더 지정 */}
            <div style={{ padding: '16px', backgroundColor: '#0f172a', borderRadius: '10px', border: '1px solid #334155', marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: '#38bdf8' }}>
                📂 QR 이미지 저장 폴더 지정 *
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <input
                  type="text"
                  readOnly
                  value={singleOutputDir || ''}
                  placeholder="저장 폴더를 선택해 주세요"
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #475569',
                    backgroundColor: '#1e293b',
                    color: 'white',
                    fontSize: '13px',
                  }}
                />
                <button type="button" className="btn btn-secondary" onClick={handleSingleSelectOutputDir}>
                  폴더 선택
                </button>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ padding: '12px 28px', fontSize: '15px' }}
                disabled={singleGenerating}
              >
                {singleGenerating ? '⚡ 암호화 QR 생성 중...' : `⚡ 수동 입력된 ${manualRows.length}명 암호화 QR 코드 생성하기`}
              </button>
            </div>
          </form>
        </section>
      )}
      </main>

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
              <h2 style={{ margin: 0, fontSize: '18px', color: '#38bdf8', fontWeight: 'bold' }}>⚙️ 생성기 설정</h2>
              <div style={{ width: '80px' }} />
            </div>

            {/* 설정 메뉴 버튼 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
            </div>

            {/* 설정 모달 최하단 버전 명시 (package.json 연동) */}
            <div
              style={{
                marginTop: '32px',
                paddingTop: '16px',
                borderTop: '1px solid #334155',
                textAlign: 'center',
                fontSize: '13px',
                color: '#64748b',
                fontWeight: '500',
              }}
            >
              기아대책 명찰 QR 생성기 v{appPackageJson.version}
            </div>
          </div>
        </div>
      )}

      {/* 배경화면 변경 및 1920x1080 픽셀 가이드 모달 */}
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

            {/* 배경 이미지 선택 섹션 */}
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

            {/* 1920x1080 배경 디자인 가이드 섹션 */}
            <div style={{ backgroundColor: '#0f172a', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#38bdf8', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📐 1920×1080 생성기 전용 배경 디자인 픽셀 가이드
              </h3>
              <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
                생성기 화면 중앙에는 엑셀 업로드 카드 및 매니페스트 검증 리포트가 위치합니다. 메인 비주얼, 키 비주얼 등은 <strong>상단/좌우 사이드 영역</strong>에 배치해 주세요.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                <div style={{ backgroundColor: '#1e293b', padding: '12px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ color: '#38bdf8', fontWeight: 'bold', fontSize: '13px' }}>🎯 1. 캔버스 기준 규격</div>
                  <div style={{ color: '#f8fafc', fontWeight: 'bold', marginTop: '2px' }}>1920 × 1080 px (16:9)</div>
                  <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>풀HD 표준 모니터 지원</div>
                </div>

                <div style={{ backgroundColor: '#1e293b', padding: '12px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ color: '#38bdf8', fontWeight: 'bold', fontSize: '13px' }}>🏷️ 2. 상단 헤더 바 영역</div>
                  <div style={{ color: '#f8fafc', fontWeight: 'bold', marginTop: '2px' }}>Y: 0 ~ 90 px</div>
                  <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>로고, 앱 제목, 설정 버튼</div>
                </div>

                <div style={{ backgroundColor: '#1e293b', padding: '12px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ color: '#38bdf8', fontWeight: 'bold', fontSize: '13px' }}>📁 3. 중앙 엑셀 업로드 구역</div>
                  <div style={{ color: '#f8fafc', fontWeight: 'bold', marginTop: '2px' }}>1200 × 600 px (중앙)</div>
                  <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>X: 360~1560px / Y: 120~720px</div>
                </div>
              </div>
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
}
