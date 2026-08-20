import React, { useState, useEffect } from 'react';
import { AttendeeInput, ValidationErrorItem, ColumnMapping, ExcelHeaderInfo } from 'shared';
import kfhiLogo from '../assets/kfhi-logo.png';
import appPackageJson from '../../package.json';

export function App() {
  const [activeTab, setActiveTab] = useState<'batch' | 'single'>('batch');

  // Step 1: 엑셀 파일 상태
  const [filePath, setFilePath] = useState<string | null>(null);
  const [headerInfo, setHeaderInfo] = useState<ExcelHeaderInfo | null>(null);
  const [isReadingHeaders, setIsReadingHeaders] = useState(false);

  // Step 2: 컬럼 매핑 상태
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1); // 1: 파일선택, 2: 헤더매핑, 3: 명단미리보기&폴더, 4: 생성완료
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    affiliationCol: '',
    titleCol: '',
    nameCol: '',
    tshirtSizeCol: '',
    spouseNameCol: '',
    spouseTshirtSizeCol: '',
    spouseAccompanyCol: '',
  });

  // Step 3: 검증 결과 및 생성 옵션
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    attendees: AttendeeInput[];
    errors: ValidationErrorItem[];
  } | null>(null);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [useEncryption, setUseEncryption] = useState<boolean>(false);

  // Step 4: 진행 상태
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    attendeeName: string;
    affiliation: string;
    title: string;
  } | null>(null);

  // 완료 결과
  const [completedResult, setCompletedResult] = useState<{
    count: number;
    manifestPath: string;
    outputDir: string;
    attendees?: AttendeeInput[];
  } | null>(null);

  // 검증 상태
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationSummary, setVerificationSummary] = useState<{
    total: number;
    successCount: number;
    failCount: number;
    items: Array<{
      affiliation: string;
      title: string;
      name: string;
      tshirtSize?: string;
      fileName: string;
      status: 'success' | 'fail';
      decryptedPayload?: any;
      failReason?: string;
    }>;
  } | null>(null);

  // 배경화면 및 모달
  const [customBg, setCustomBg] = useState<string>(() => {
    return localStorage.getItem('kfhi_generator_bg') || '';
  });
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showBgModal, setShowBgModal] = useState<boolean>(false);

  // 긴급 수동 입력 탭 상태 (v1.1: 관리번호 제거, 티셔츠 추가)
  const [manualRows, setManualRows] = useState<
    Array<{ id: string; affiliation: string; title: string; name: string; tshirtSize: string }>
  >([{ id: '1', affiliation: '', title: '', name: '', tshirtSize: '' }]);
  const [singleOutputDir, setSingleOutputDir] = useState<string | null>(null);
  const [singleEncrypted, setSingleEncrypted] = useState<boolean>(false);
  const [singleGenerating, setSingleGenerating] = useState<boolean>(false);

  useEffect(() => {
    if (window.electron?.onProgress) {
      const cleanup = window.electron.onProgress((data) => {
        setProgress(data);
      });
      return cleanup;
    }
  }, []);

  // 1. 엑셀 파일 선택 및 헤더 분석
  const handleSelectExcel = async () => {
    let selectedFile: string | null = null;
    if (window.electron) {
      selectedFile = await window.electron.selectExcelFile();
    } else {
      selectedFile = 'C:\\mock\\sample_attendees.xlsx';
    }

    if (!selectedFile) return;

    setFilePath(selectedFile);
    setIsReadingHeaders(true);

    if (window.electron) {
      const res = await window.electron.getExcelHeaders(selectedFile);
      if (res.success && res.headerInfo) {
        setHeaderInfo(res.headerInfo);
        setColumnMapping(res.headerInfo.suggestedMapping);
        setStep(2); // 헤더 매핑 화면으로 이동
      } else {
        alert(res.error || '엑셀 파일의 헤더를 읽지 못했습니다.');
      }
    } else {
      // Mock for web preview
      const mockHeaders = ['이사회명', '직책', '성명', '티셔츠사이즈', '사모님 성함', '사모님T셔츠사이즈(M/L/XL/2XL/3XL)', '사모님동행'];
      const mockHeaderInfo: ExcelHeaderInfo = {
        headers: mockHeaders,
        sampleRows: [
          { '이사회명': '서울후원이사회', '직책': '회장', '성명': '홍길동', '티셔츠사이즈': '105', '사모님 성함': '김영희', '사모님T셔츠사이즈(M/L/XL/2XL/3XL)': '95', '사모님동행': '동행' },
          { '이사회명': '경기후원이사회', '직책': '총무', '성명': '이순신', '티셔츠사이즈': '100', '사모님 성함': '', '사모님T셔츠사이즈(M/L/XL/2XL/3XL)': '', '사모님동행': '' },
        ],
        suggestedMapping: {
          affiliationCol: '이사회명',
          titleCol: '직책',
          nameCol: '성명',
          tshirtSizeCol: '티셔츠사이즈',
          spouseNameCol: '사모님 성함',
          spouseTshirtSizeCol: '사모님T셔츠사이즈(M/L/XL/2XL/3XL)',
          spouseAccompanyCol: '사모님동행',
        },
      };
      setHeaderInfo(mockHeaderInfo);
      setColumnMapping(mockHeaderInfo.suggestedMapping);
      setStep(2);
    }
    setIsReadingHeaders(false);
  };

  // 2. 매핑 정보 기반 명단 파싱 및 검증
  const handleValidateMapping = async () => {
    if (!filePath) return;
    if (!columnMapping.affiliationCol || !columnMapping.titleCol || !columnMapping.nameCol) {
      alert('이사회명, 직책, 성명 매핑 열은 필수 항목입니다.');
      return;
    }

    setIsValidating(true);

    if (window.electron) {
      const result = await window.electron.parseExcelWithMapping({
        filePath,
        mapping: columnMapping,
      });
      setValidationResult(result);
      if (result.isValid) {
        setStep(3); // 명단 미리보기 및 생성 폴더 지정 화면으로 이동
      }
    } else {
      // Mock for web preview
      const mockAttendees: AttendeeInput[] = [
        { affiliation: '서울후원이사회', title: '회장', name: '홍길동', tshirtSize: '105', isSpouse: false },
        { affiliation: '서울후원이사회', title: '사모', name: '김영희', tshirtSize: '95', isSpouse: true },
        { affiliation: '경기후원이사회', title: '총무', name: '이순신', tshirtSize: '100', isSpouse: false },
      ];
      setValidationResult({
        isValid: true,
        attendees: mockAttendees,
        errors: [],
      });
      setStep(3);
    }

    setIsValidating(false);
  };

  // 3. 폴더 선택
  const handleSelectOutputDir = async () => {
    if (window.electron) {
      const selected = await window.electron.selectOutputDir();
      if (selected) setOutputDir(selected);
    } else {
      setOutputDir('C:\\Exported_QRCodes');
    }
  };

  // 4. 대량 QR 생성 실행
  const handleStartGenerate = async () => {
    if (!validationResult || !validationResult.isValid || !outputDir) return;

    setIsGenerating(true);
    setVerificationSummary(null);
    setProgress({
      current: 0,
      total: validationResult.attendees.length,
      attendeeName: '',
      affiliation: '',
      title: '',
    });

    if (window.electron) {
      const res = await window.electron.generateQRCodes({
        attendees: validationResult.attendees,
        outputDir,
        encrypted: useEncryption,
      });

      if (res.success) {
        setCompletedResult({
          count: res.count,
          manifestPath: res.manifestPath,
          outputDir,
          attendees: validationResult.attendees,
        });
        setStep(4);
      } else {
        alert(`생성 실패: ${res.error}`);
      }
    } else {
      for (let i = 1; i <= validationResult.attendees.length; i++) {
        await new Promise((r) => setTimeout(r, 60));
        const att = validationResult.attendees[i - 1];
        setProgress({
          current: i,
          total: validationResult.attendees.length,
          attendeeName: att.name,
          affiliation: att.affiliation,
          title: att.title,
        });
      }
      setCompletedResult({
        count: validationResult.attendees.length,
        manifestPath: `${outputDir}\\manifest.txt`,
        outputDir,
        attendees: validationResult.attendees,
      });
      setStep(4);
    }

    setIsGenerating(false);
  };

  // 생성물 검증
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
      // Mock verification
      setVerificationSummary({
        total: completedResult.count,
        successCount: completedResult.count,
        failCount: 0,
        items: (completedResult.attendees || []).map((a) => ({
          affiliation: a.affiliation,
          title: a.title,
          name: a.name,
          tshirtSize: a.tshirtSize,
          fileName: `${a.affiliation}_${a.title}_${a.name}.png`,
          status: 'success' as const,
          decryptedPayload: {
            v: 2,
            a: a.affiliation,
            t: a.title,
            n: a.name,
            s: a.tshirtSize || '',
            ts: Date.now(),
          },
        })),
      });
    }
    setIsVerifying(false);
  };

  // 수동 입력 핸들러
  const handleAddManualRow = () => {
    setManualRows((prev) => [
      ...prev,
      { id: String(Date.now() + Math.random()), affiliation: '', title: '', name: '', tshirtSize: '' },
    ]);
  };

  const handleRemoveManualRow = (id: string) => {
    if (manualRows.length <= 1) {
      alert('최소 1명의 참석자 정보는 입력되어야 합니다.');
      return;
    }
    setManualRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleManualRowChange = (
    id: string,
    field: 'affiliation' | 'title' | 'name' | 'tshirtSize',
    value: string
  ) => {
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

    const attendeesToGenerate: AttendeeInput[] = [];
    for (let i = 0; i < manualRows.length; i++) {
      const row = manualRows[i];
      const affiliation = row.affiliation.trim();
      const title = row.title.trim();
      const name = row.name.trim();
      const tshirtSize = row.tshirtSize.trim();

      if (!affiliation || !title || !name) {
        alert(`${i + 1}번째 행의 필수 필드(이사회명, 직책, 성명)를 모두 작성해 주세요.`);
        return;
      }

      attendeesToGenerate.push({
        affiliation,
        title,
        name,
        tshirtSize,
        isSpouse: title === '사모',
      });
    }

    setSingleGenerating(true);

    if (window.electron) {
      const res = await window.electron.generateQRCodes({
        attendees: attendeesToGenerate,
        outputDir: singleOutputDir,
        encrypted: singleEncrypted,
      });

      if (res.success) {
        setCompletedResult({
          count: attendeesToGenerate.length,
          outputDir: singleOutputDir,
          manifestPath: res.manifestPath,
          attendees: attendeesToGenerate,
        });
        setStep(4);
      } else {
        alert(`수동 입력 생성 실패: ${res.error}`);
      }
    } else {
      setCompletedResult({
        count: attendeesToGenerate.length,
        outputDir: singleOutputDir,
        manifestPath: `${singleOutputDir}\\manifest.txt`,
        attendees: attendeesToGenerate,
      });
      setStep(4);
    }

    setSingleGenerating(false);
  };

  const handleReset = () => {
    setFilePath(null);
    setHeaderInfo(null);
    setStep(1);
    setValidationResult(null);
    setOutputDir(null);
    setProgress(null);
    setCompletedResult(null);
    setVerificationSummary(null);
    setManualRows([{ id: '1', affiliation: '', title: '', name: '', tshirtSize: '' }]);
    setSingleOutputDir(null);
  };

  const handleOpenFolder = (folderPath: string) => {
    if (window.electron) {
      window.electron.openFolder(folderPath);
    }
  };

  const spouseCount = validationResult?.attendees.filter((a) => a.isSpouse).length || 0;
  const primaryCount = (validationResult?.attendees.length || 0) - spouseCount;
  const uniqueAffiliations = new Set(validationResult?.attendees.map((a) => a.affiliation) || []).size;

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', width: '100%', backgroundColor: customBg ? 'transparent' : '#0f172a' }}>
      {/* 고정 배경 레이어 */}
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
            style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
          />
        </div>
      )}

      {/* 100% Full Width 상단 Header Bar */}
      <header
        style={{
          width: '100%',
          padding: '16px 0',
          backgroundColor: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          boxSizing: 'border-box',
          marginBottom: '20px',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <img src={kfhiLogo} alt="희망친구 기아대책" style={{ height: '42px', objectFit: 'contain' }} />
            <div>
              <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: '#38bdf8' }}>
                행사 출입관리 QR코드 생성기
              </h1>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#cbd5e1' }}>
                동적 헤더 인식 · 사모님 분리 생성 · InDesign Data Merge 지원 (v1.1)
              </p>
            </div>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => setShowSettingsModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            ⚙️ 설정
          </button>
        </div>
      </header>

      {/* 메인 컨텐츠 영역 */}
      <main className="app-container" style={{ paddingTop: 0, marginTop: 0 }}>
        {/* 결과 화면 (Step 4 / completedResult) */}
        {completedResult ? (
          <section className="glass-card" style={{ textAlign: 'center', padding: '36px 24px' }}>
            <div style={{ fontSize: '44px', marginBottom: '8px' }}>🎉</div>
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--success-color)', marginBottom: '8px' }}>
              QR코드 생성 완료!
            </h2>
            <p className="subtitle" style={{ marginBottom: '20px' }}>
              총 {completedResult.count}건의 QR 이미지(PNG) 및 InDesign 매니페스트(manifest.txt)가 정상 저장되었습니다.
            </p>

            <div className="stat-grid" style={{ marginBottom: '20px' }}>
              <div className="stat-item">
                <div className="stat-label">저장 완료 항목</div>
                <div className="stat-value">{completedResult.count} 건</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">매니페스트 파일</div>
                <div className="stat-value" style={{ fontSize: '14px', wordBreak: 'break-all' }}>
                  manifest.txt (InDesign Data Merge)
                </div>
              </div>
            </div>

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
                🔄 새 작업하기
              </button>
            </div>

            {isVerifying && (
              <div style={{ textAlign: 'center', margin: '20px 0', color: 'var(--accent-cyan)' }}>
                생성된 QR PNG 디코딩 및 매니페스트 대조 검증 수행 중...
              </div>
            )}

            {verificationSummary && (
              <div style={{ marginTop: '24px', textAlign: 'left', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {verificationSummary.failCount === 0 ? (
                      <span className="badge badge-success">검증 완료 (100% 정상)</span>
                    ) : (
                      <span className="badge badge-error">검증 주의 ({verificationSummary.failCount}건 실패)</span>
                    )}
                    <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
                      QR 디코딩 및 매니페스트 대조 검증 리포트
                    </h3>
                  </div>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    성공: <strong style={{ color: 'var(--success-color)' }}>{verificationSummary.successCount}</strong> / 전체: {verificationSummary.total}건
                  </span>
                </div>

                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>이사회명</th>
                        <th>직책</th>
                        <th>성명</th>
                        <th>티셔츠</th>
                        <th>파일명</th>
                        <th>상태</th>
                        <th>스캔 복원 내용</th>
                      </tr>
                    </thead>
                    <tbody>
                      {verificationSummary.items.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600 }}>{item.affiliation}</td>
                          <td>{item.title}</td>
                          <td>{item.name}</td>
                          <td>{item.tshirtSize || '-'}</td>
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
                                {`[${item.decryptedPayload.a}] ${item.decryptedPayload.t} ${item.decryptedPayload.n} (사이즈: ${item.decryptedPayload.s || '미지정'})`}
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
        ) : (
          /* 생성 전 메인 작업 탭 */
          <>
            {/* 상단 탭 선택 바 */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
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
                }}
              >
                ✍️ 2. 개별 수동 입력 QR 생성 (긴급)
              </button>
            </div>

            {/* 탭 1: 엑셀 대량 생성 */}
            {activeTab === 'batch' && (
              <>
                {/* 진행 중 프로그레스 바 */}
                {isGenerating && progress && (
                  <section className="glass-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>
                      QR 코드 생성 진행 중...
                    </h2>
                    <p className="subtitle" style={{ marginBottom: '24px' }}>
                      지정한 폴더에 이미지(PNG) 저장 및 InDesign 매니페스트를 작성하고 있습니다.
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
                          처리 중: [{progress.affiliation}] {progress.title} {progress.attendeeName}
                        </span>
                        <span style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>
                          {progress.current} / {progress.total} ({Math.round((progress.current / progress.total) * 100)}%)
                        </span>
                      </div>
                    </div>
                  </section>
                )}

                {/* Step 1: 파일 업로드 */}
                {!isGenerating && step === 1 && (
                  <section className="glass-card">
                    <h2 style={{ fontSize: '16px', marginBottom: '16px', fontWeight: 600 }}>
                      1. 참석자 명단 엑셀 파일 선택 (.xlsx)
                    </h2>
                    <div className="dropzone" onClick={handleSelectExcel}>
                      <div className="dropzone-icon">📁</div>
                      <p style={{ fontWeight: 500, fontSize: '15px', marginBottom: '4px' }}>
                        {filePath ? filePath : '클릭하여 참석자 명단 엑셀(.xlsx) 파일 업로드'}
                      </p>
                      <p className="subtitle">엑셀 1행의 최상단 Header 항목을 자동으로 인식합니다</p>
                    </div>

                    {isReadingHeaders && (
                      <div style={{ textAlign: 'center', marginTop: '16px', color: 'var(--accent-cyan)' }}>
                        엑셀 헤더 및 샘플 데이터 분석 중...
                      </div>
                    )}
                  </section>
                )}

                {/* Step 2: 헤더 매핑 화면 (신규) */}
                {!isGenerating && step === 2 && headerInfo && (
                  <section className="glass-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <div>
                        <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#38bdf8' }}>
                          2. 엑셀 Header 매핑 및 항목 선택
                        </h2>
                        <p className="subtitle" style={{ margin: '4px 0 0 0' }}>
                          인식된 엑셀 열 중 QR코드 및 매니페스트에 매핑할 항목을 확인하세요. (스마트 자동 매칭 적용)
                        </p>
                      </div>
                      <button className="btn btn-secondary" onClick={() => setStep(1)} style={{ fontSize: '13px' }}>
                        ⬅️ 다른 파일 선택
                      </button>
                    </div>

                    {/* 감지된 전체 헤더 태그 뱃지 */}
                    <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #334155' }}>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>
                        📋 엑셀 1행에서 감지된 열 목록 ({headerInfo.headers.length}개):
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {headerInfo.headers.map((h, i) => (
                          <span
                            key={i}
                            style={{
                              backgroundColor: '#1e293b',
                              color: '#38bdf8',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              border: '1px solid #475569',
                            }}
                          >
                            {h}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* 매핑 드롭다운 폼 */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                      {/* 필수 본인 필드 */}
                      <div style={{ backgroundColor: '#0f172a', padding: '16px', borderRadius: '10px', border: '1px solid #334155' }}>
                        <h3 style={{ fontSize: '14px', margin: '0 0 12px 0', color: '#38bdf8', fontWeight: 'bold' }}>
                          👤 본인 기본 정보 (필수)
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                              이사회명 (소속) *
                            </label>
                            <select
                              value={columnMapping.affiliationCol}
                              onChange={(e) => setColumnMapping((prev) => ({ ...prev, affiliationCol: e.target.value }))}
                              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', backgroundColor: '#1e293b', color: 'white', border: '1px solid #475569' }}
                            >
                              <option value="">-- 선택하세요 --</option>
                              {headerInfo.headers.map((h, i) => (
                                <option key={i} value={h}>{h}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                              직책 (직함) *
                            </label>
                            <select
                              value={columnMapping.titleCol}
                              onChange={(e) => setColumnMapping((prev) => ({ ...prev, titleCol: e.target.value }))}
                              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', backgroundColor: '#1e293b', color: 'white', border: '1px solid #475569' }}
                            >
                              <option value="">-- 선택하세요 --</option>
                              {headerInfo.headers.map((h, i) => (
                                <option key={i} value={h}>{h}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                              성명 (본인) *
                            </label>
                            <select
                              value={columnMapping.nameCol}
                              onChange={(e) => setColumnMapping((prev) => ({ ...prev, nameCol: e.target.value }))}
                              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', backgroundColor: '#1e293b', color: 'white', border: '1px solid #475569' }}
                            >
                              <option value="">-- 선택하세요 --</option>
                              {headerInfo.headers.map((h, i) => (
                                <option key={i} value={h}>{h}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                              본인 티셔츠 사이즈 (선택)
                            </label>
                            <select
                              value={columnMapping.tshirtSizeCol || ''}
                              onChange={(e) => setColumnMapping((prev) => ({ ...prev, tshirtSizeCol: e.target.value }))}
                              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', backgroundColor: '#1e293b', color: 'white', border: '1px solid #475569' }}
                            >
                              <option value="">(티셔츠 사이즈 컬럼 없음/미사용)</option>
                              {headerInfo.headers.map((h, i) => (
                                <option key={i} value={h}>{h}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* 사모님 동행 정보 */}
                      <div style={{ backgroundColor: '#0f172a', padding: '16px', borderRadius: '10px', border: '1px solid #334155' }}>
                        <h3 style={{ fontSize: '14px', margin: '0 0 12px 0', color: '#ec4899', fontWeight: 'bold' }}>
                          🌸 사모님 동행 정보 (자동 분리 생성)
                        </h3>
                        <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 12px 0' }}>
                          사모님 성함이 존재하는 행은 직함 '사모'로 독립된 QR이 자동 분리 생성됩니다.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                              사모님 성함 열
                            </label>
                            <select
                              value={columnMapping.spouseNameCol || ''}
                              onChange={(e) => setColumnMapping((prev) => ({ ...prev, spouseNameCol: e.target.value }))}
                              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', backgroundColor: '#1e293b', color: 'white', border: '1px solid #475569' }}
                            >
                              <option value="">(사모님 성함 컬럼 없음/미사용)</option>
                              {headerInfo.headers.map((h, i) => (
                                <option key={i} value={h}>{h}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                              사모님 티셔츠 사이즈 열
                            </label>
                            <select
                              value={columnMapping.spouseTshirtSizeCol || ''}
                              onChange={(e) => setColumnMapping((prev) => ({ ...prev, spouseTshirtSizeCol: e.target.value }))}
                              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', backgroundColor: '#1e293b', color: 'white', border: '1px solid #475569' }}
                            >
                              <option value="">(사모님 티셔츠 컬럼 없음/미사용)</option>
                              {headerInfo.headers.map((h, i) => (
                                <option key={i} value={h}>{h}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                              사모님 동행 여부 열 (선택)
                            </label>
                            <select
                              value={columnMapping.spouseAccompanyCol || ''}
                              onChange={(e) => setColumnMapping((prev) => ({ ...prev, spouseAccompanyCol: e.target.value }))}
                              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', backgroundColor: '#1e293b', color: 'white', border: '1px solid #475569' }}
                            >
                              <option value="">(동행 여부 컬럼 없음/미사용)</option>
                              {headerInfo.headers.map((h, i) => (
                                <option key={i} value={h}>{h}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 검증 오류 표시 */}
                    {validationResult && !validationResult.isValid && (
                      <div style={{ marginBottom: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <span className="badge badge-error">검증 오류</span>
                          <span style={{ fontSize: '13px', color: 'var(--error-color)' }}>
                            총 {validationResult.errors.length}건의 입력 오류가 발견되었습니다.
                          </span>
                        </div>
                        <div className="table-container">
                          <table>
                            <thead>
                              <tr>
                                <th>행번호</th>
                                <th>이사회</th>
                                <th>성명</th>
                                <th>오류 사유</th>
                              </tr>
                            </thead>
                            <tbody>
                              {validationResult.errors.map((err, idx) => (
                                <tr key={idx}>
                                  <td>{err.rowNumber}행</td>
                                  <td>{err.affiliation || '-'}</td>
                                  <td>{err.name || '-'}</td>
                                  <td className="reason">{err.reason}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* 다음 버튼 */}
                    <div style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-primary"
                        onClick={handleValidateMapping}
                        disabled={isValidating || !columnMapping.affiliationCol || !columnMapping.titleCol || !columnMapping.nameCol}
                        style={{ padding: '12px 28px', fontSize: '15px' }}
                      >
                        {isValidating ? '명단 분석 중...' : '➡️ 다음: 명단 확인 및 저장 폴더 지정'}
                      </button>
                    </div>
                  </section>
                )}

                {/* Step 3: 명단 확인 & 저장 폴더 & 옵션 */}
                {!isGenerating && step === 3 && validationResult && validationResult.isValid && (
                  <section className="glass-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <div>
                        <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#38bdf8' }}>
                          3. 생성 대상 명단 확인 및 옵션 설정
                        </h2>
                        <p className="subtitle" style={{ margin: '4px 0 0 0' }}>
                          본인 및 사모님 분리 생성된 명단을 확인하고 저장 위치를 지정하세요.
                        </p>
                      </div>
                      <button className="btn btn-secondary" onClick={() => setStep(2)} style={{ fontSize: '13px' }}>
                        ⬅️ 매핑 수정
                      </button>
                    </div>

                    {/* 통계 요약 카드 */}
                    <div className="stat-grid" style={{ marginBottom: '20px' }}>
                      <div className="stat-item">
                        <div className="stat-label">총 QR 생성 대상</div>
                        <div className="stat-value">{validationResult.attendees.length} 건</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-label">본인 / 사모님 참석</div>
                        <div className="stat-value" style={{ fontSize: '18px' }}>
                          본인 {primaryCount}명 + 사모 {spouseCount}명
                        </div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-label">소속 이사회 수</div>
                        <div className="stat-value">{uniqueAffiliations} 개</div>
                      </div>
                    </div>

                    {/* 참석자 목록 미리보기 테이블 */}
                    <div className="table-container" style={{ maxHeight: '260px', overflowY: 'auto', marginBottom: '24px' }}>
                      <table>
                        <thead>
                          <tr>
                            <th>구분</th>
                            <th>이사회명</th>
                            <th>직책</th>
                            <th>성명</th>
                            <th>티셔츠사이즈</th>
                            <th>생성 파일명 규칙</th>
                          </tr>
                        </thead>
                        <tbody>
                          {validationResult.attendees.map((att, idx) => (
                            <tr key={idx}>
                              <td>
                                {att.isSpouse ? (
                                  <span style={{ backgroundColor: '#be185d', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                                    사모
                                  </span>
                                ) : (
                                  <span style={{ backgroundColor: '#0284c7', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                                    본인
                                  </span>
                                )}
                              </td>
                              <td style={{ fontWeight: 600 }}>{att.affiliation}</td>
                              <td>{att.title}</td>
                              <td>{att.name}</td>
                              <td>{att.tshirtSize || '-'}</td>
                              <td style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace' }}>
                                {`${att.affiliation}_${att.title}_${att.name}.png`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* 옵션 및 저장 폴더 지정 */}
                    <div style={{ backgroundColor: '#0f172a', padding: '20px', borderRadius: '12px', border: '1px solid #334155', marginBottom: '24px' }}>
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={useEncryption}
                            onChange={(e) => setUseEncryption(e.target.checked)}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
                            🔒 AES-256-GCM 암호화 적용
                          </span>
                        </label>
                        <p style={{ margin: '4px 0 0 26px', fontSize: '12px', color: '#94a3b8' }}>
                          체크 해제 시 초경량 평문(Plaintext) QR 코드로 생성되어 <strong>카메라 인식 속도 및 인식률이 극대화</strong>됩니다. (권장)
                        </p>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#cbd5e1' }}>
                          📂 QR 이미지 및 매니페스트 저장 폴더 지정 *
                        </label>
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <input
                            type="text"
                            readOnly
                            value={outputDir || ''}
                            placeholder="저장 폴더를 선택해주세요"
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
                    </div>

                    {/* 생성 버튼 */}
                    <div style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-primary"
                        style={{ padding: '14px 32px', fontSize: '16px', fontWeight: 'bold' }}
                        disabled={!outputDir}
                        onClick={handleStartGenerate}
                      >
                        ⚡ 총 {validationResult.attendees.length}건 QR 코드 대량 생성 시작
                      </button>
                    </div>
                  </section>
                )}
              </>
            )}

            {/* 탭 2: 긴급 수동 입력 (v1.1) */}
            {activeTab === 'single' && !completedResult && (
              <section className="glass-card">
                <div style={{ marginBottom: '16px' }}>
                  <h2 style={{ fontSize: '18px', margin: 0, fontWeight: 700, color: '#38bdf8' }}>
                    ✍️ 긴급 참석자 수동 입력 QR 생성
                  </h2>
                  <p className="subtitle" style={{ margin: '4px 0 0 0' }}>
                    엑셀 파일 없이 현장에서 수동으로 참석자 정보(이사회명, 직책, 성명, 티셔츠)를 입력하여 즉시 QR 이미지(PNG)를 만듭니다.
                  </p>
                </div>

                <form onSubmit={handleSingleGenerate} style={{ marginTop: '20px' }}>
                  {manualRows.map((row, idx) => (
                    <div
                      key={row.id}
                      style={{
                        backgroundColor: '#0f172a',
                        padding: '18px',
                        borderRadius: '12px',
                        border: '1px solid #334155',
                        marginBottom: '16px',
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

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: '#cbd5e1' }}>
                            이사회명 (소속) *
                          </label>
                          <input
                            type="text"
                            placeholder="예: 서울후원이사회"
                            value={row.affiliation}
                            onChange={(e) => handleManualRowChange(row.id, 'affiliation', e.target.value)}
                            style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #475569', backgroundColor: '#1e293b', color: 'white', boxSizing: 'border-box' }}
                            required
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: '#cbd5e1' }}>
                            직책 (직함) *
                          </label>
                          <input
                            type="text"
                            placeholder="예: 회장, 총무, 사모"
                            value={row.title}
                            onChange={(e) => handleManualRowChange(row.id, 'title', e.target.value)}
                            style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #475569', backgroundColor: '#1e293b', color: 'white', boxSizing: 'border-box' }}
                            required
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: '#cbd5e1' }}>
                            성명 *
                          </label>
                          <input
                            type="text"
                            placeholder="예: 홍길동"
                            value={row.name}
                            onChange={(e) => handleManualRowChange(row.id, 'name', e.target.value)}
                            style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #475569', backgroundColor: '#1e293b', color: 'white', boxSizing: 'border-box' }}
                            required
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: '#cbd5e1' }}>
                            티셔츠 사이즈 (선택)
                          </label>
                          <input
                            type="text"
                            placeholder="예: 100, XL, L"
                            value={row.tshirtSize}
                            onChange={(e) => handleManualRowChange(row.id, 'tshirtSize', e.target.value)}
                            style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #475569', backgroundColor: '#1e293b', color: 'white', boxSizing: 'border-box' }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                    <button
                      type="button"
                      onClick={handleAddManualRow}
                      style={{
                        padding: '10px 18px',
                        borderRadius: '8px',
                        border: '1px dashed #38bdf8',
                        backgroundColor: 'rgba(56, 189, 248, 0.1)',
                        color: '#38bdf8',
                        fontWeight: 'bold',
                        fontSize: '13px',
                        cursor: 'pointer',
                      }}
                    >
                      ➕ 참석자 1명 추가
                    </button>
                  </div>

                  <div style={{ backgroundColor: '#0f172a', padding: '18px', borderRadius: '12px', border: '1px solid #334155', marginBottom: '20px' }}>
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={singleEncrypted}
                          onChange={(e) => setSingleEncrypted(e.target.checked)}
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
                          🔒 AES-256-GCM 암호화 적용 (미체크 시 초고속 평문 QR)
                        </span>
                      </label>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#cbd5e1' }}>
                        저장 폴더 지정 *
                      </label>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <input
                          type="text"
                          readOnly
                          value={singleOutputDir || ''}
                          placeholder="QR 이미지를 저장할 폴더를 선택하세요"
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
                        <button type="button" className="btn btn-secondary" onClick={handleSingleSelectOutputDir}>
                          폴더 선택
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ padding: '14px 32px', fontSize: '15px' }}
                      disabled={singleGenerating || !singleOutputDir}
                    >
                      {singleGenerating ? 'QR 생성 중...' : `⚡ 수동 입력 ${manualRows.length}건 QR 생성`}
                    </button>
                  </div>
                </form>
              </section>
            )}
          </>
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
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', borderBottom: '1px solid #334155', paddingBottom: '12px' }}>
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
              <div style={{ width: '60px' }} />
            </div>

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
                  fontSize: '15px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>🖼️ 배경화면 변경</span>
                <span style={{ fontSize: '12px', opacity: 0.9 }}>1920×1080 PNG</span>
              </button>
            </div>

            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #334155', textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
              기아대책 QR 생성기 v{appPackageJson.version} (v1.1)
            </div>
          </div>
        </div>
      )}

      {/* 배경화면 변경 모달 */}
      {showBgModal && (
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
            zIndex: 9995,
            padding: '24px',
          }}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              padding: '28px',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '460px',
              border: '1px solid #475569',
            }}
          >
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#38bdf8' }}>🖼️ 프로그램 배경화면 변경</h3>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px' }}>
              1920×1080 해상도의 행사 포스터/배경 이미지를 등록할 수 있습니다.
            </p>
            <input type="file" accept="image/*" onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (event) => {
                const base64 = event.target?.result as string;
                if (base64) {
                  setCustomBg(base64);
                  localStorage.setItem('kfhi_generator_bg', base64);
                  alert('배경화면이 적용되었습니다!');
                  setShowBgModal(false);
                }
              };
              reader.readAsDataURL(file);
            }} style={{ marginBottom: '16px', color: 'white' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setCustomBg('');
                  localStorage.removeItem('kfhi_generator_bg');
                  alert('기본 배경으로 초기화되었습니다.');
                  setShowBgModal(false);
                }}
                style={{ flex: 1 }}
              >
                기본 배경으로 초기화
              </button>
              <button className="btn btn-secondary" onClick={() => setShowBgModal(false)} style={{ flex: 1 }}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
