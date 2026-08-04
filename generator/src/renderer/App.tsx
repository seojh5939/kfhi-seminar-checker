import React, { useState, useEffect } from 'react';
import { AttendeeInput, ValidationErrorItem } from 'shared';

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
  } | null>(null);

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
        manifestPath: `${outputDir}\\manifest.csv`,
        outputDir,
      });
    }

    setIsGenerating(false);
  };

  const handleReset = () => {
    setFilePath(null);
    setOutputDir(null);
    setValidationResult(null);
    setProgress(null);
    setCompletedResult(null);
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
    <div className="app-container">
      <header>
        <div className="logo-group">
          <div className="logo-badge">KFHI</div>
          <div>
            <h1>행사 출입관리 QR코드 생성기</h1>
            <p className="subtitle">기아대책 오프라인 행사 전용 암호화 QR 대량 인코더</p>
          </div>
        </div>
      </header>

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
                  <div className="stat-label">분류될 소속 폴더 수</div>
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
            소속별 폴더에 이미지(PNG) 저장 및 매니페스트 레코드를 작성 중입니다.
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
        <section className="glass-card" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--success-color)', marginBottom: '8px' }}>
            QR코드 대량 생성 완료!
          </h2>
          <p className="subtitle" style={{ marginBottom: '24px' }}>
            총 {completedResult.count}건의 암호화 QR 이미지 및 매니페스트 CSV가 정상 저장되었습니다.
          </p>

          <div className="stat-grid" style={{ marginBottom: '24px' }}>
            <div className="stat-item">
              <div className="stat-label">저장 완료 항목</div>
              <div className="stat-value">{completedResult.count} 건</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">매니페스트 파일</div>
              <div className="stat-value" style={{ fontSize: '14px', wordBreak: 'break-all' }}>
                manifest.csv (UTF-8 BOM)
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => handleOpenFolder(completedResult.outputDir)}>
              📂 생성 폴더 열기
            </button>
            <button className="btn btn-secondary" onClick={handleReset}>
              🔄 새 엑셀 작업하기
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
