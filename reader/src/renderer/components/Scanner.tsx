import React, { useEffect, useRef, useState } from 'react';
import QrScanner from 'qr-scanner';
import { ScanRecord, formatKSTDateTime } from 'shared';

interface ScannerProps {
  locationName: string;
  secretKey?: string;
  scanHistory: ScanRecord[];
  onScanSuccess: (record: ScanRecord) => void;
  onScanError: (errorMessage: string) => void;
}

export const Scanner: React.FC<ScannerProps> = ({
  locationName,
  secretKey,
  scanHistory,
  onScanSuccess,
  onScanError,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<'INITIALIZING' | 'READY' | 'OFF' | 'ERROR'>('INITIALIZING');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 카메라 ON/OFF 및 장치 선택 상태
  const [isCameraOn, setIsCameraOn] = useState<boolean>(true);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(() => {
    return localStorage.getItem('kfhi_selected_camera_id') || '';
  });

  const scanHistoryRef = useRef<ScanRecord[]>(scanHistory);
  useEffect(() => {
    scanHistoryRef.current = scanHistory;
  }, [scanHistory]);

  const recentScanHistory = useRef<Map<string, number>>(new Map());
  const isProcessingFrame = useRef(false);

  // Web Audio API를 활용한 성공(띵동)/중복(따뜻한 환영음)/실패(경고 삐삐) 효과음 유틸리티
  const playSound = (type: 'SUCCESS' | 'DUPLICATE' | 'ERROR') => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = audioCtx.currentTime;

      if (type === 'SUCCESS') {
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(783.99, now);
        gain1.gain.setValueAtTime(0.25, now);
        gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.start(now);
        osc1.stop(now + 0.12);

        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1046.5, now + 0.08);
        gain2.gain.setValueAtTime(0.3, now + 0.08);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.33);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.33);
      } else if (type === 'DUPLICATE') {
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(698.46, now); // F5
        gain1.gain.setValueAtTime(0.2, now);
        gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.start(now);
        osc1.stop(now + 0.15);

        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880.0, now + 0.1); // A5
        gain2.gain.setValueAtTime(0.25, now + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start(now + 0.1);
        osc2.stop(now + 0.3);
      } else {
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(330, now);
        gain1.gain.setValueAtTime(0.25, now);
        gain1.gain.linearRampToValueAtTime(0.01, now + 0.12);
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.start(now);
        osc1.stop(now + 0.12);

        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(220, now + 0.14);
        gain2.gain.setValueAtTime(0.25, now + 0.14);
        gain2.gain.linearRampToValueAtTime(0.01, now + 0.32);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start(now + 0.14);
        osc2.stop(now + 0.32);
      }
    } catch {
      // AudioContext 미지원 가드
    }
  };

  // 카메라 장치 목록 로드 (videoinput)
  const updateCameraDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((device) => device.kind === 'videoinput');
      setCameraDevices(videoInputs);

      // 선택된 deviceId가 없거나 목록에 없으면 첫 번째 장치 자동 선택
      if (videoInputs.length > 0) {
        const exists = videoInputs.some((d) => d.deviceId === selectedDeviceId);
        if (!selectedDeviceId || !exists) {
          setSelectedDeviceId(videoInputs[0].deviceId);
        }
      }
    } catch {
      // 장치 열람 오류 가드
    }
  };

  useEffect(() => {
    let animationFrameId: number;
    let stream: MediaStream | null = null;

    if (!isCameraOn) {
      setCameraStatus('OFF');
      setIsScanning(false);
      return;
    }

    const startCamera = async () => {
      try {
        setCameraStatus('INITIALIZING');

        // 720p HD 고밀도 스트림 캡처 (소형 20mm QR 픽셀 분해능 확보, 480p 안전 Fallback)
        const videoConstraints: MediaTrackConstraints = {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          frameRate: { ideal: 30, max: 30 },
        };

        if (selectedDeviceId) {
          videoConstraints.deviceId = { exact: selectedDeviceId };
        } else {
          videoConstraints.facingMode = 'user';
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraStatus('READY');
          setIsScanning(true);

          // 카메라 정상 시작 후 사용 가능한 카메라 목록 업데이트
          await updateCameraDevices();
          scanFrameLoop();
        }
      } catch (err: any) {
        setCameraStatus('ERROR');
        setErrorMessage('선택하신 카메라를 연결할 수 없습니다. 연결 상태 및 권한을 확인해주세요.');
        onScanError('카메라 초기화 실패');
      }
    };

    // 중앙 ROI (안전한 영역) 초고속 프레임 루프 (100ms 디바운스)
    let lastScanTime = 0;

    const scanFrameLoop = async () => {
      const now = Date.now();
      if (now - lastScanTime >= 100 && videoRef.current && canvasRef.current && !isProcessingFrame.current) {
        lastScanTime = now;
        isProcessingFrame.current = true;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
          const videoWidth = video.videoWidth;
          const videoHeight = video.videoHeight;

          // 안정적인 중앙 ROI 크롭 (충분한 영역 확보로 QR 모서리 잘림 방지)
          const cropSize = Math.floor(Math.min(420, videoWidth, videoHeight));
          const cropX = Math.floor((videoWidth - cropSize) / 2);
          const cropY = Math.floor((videoHeight - cropSize) / 2);

          canvas.width = cropSize;
          canvas.height = cropSize;

          // 카메라 원본 픽셀 무손실 드로잉 (WASM 네이티브 이진화 엔진 활용)
          ctx.drawImage(video, cropX, cropY, cropSize, cropSize, 0, 0, cropSize, cropSize);

          try {
            // qr-scanner WASM 디코더 호출
            const result = await QrScanner.scanImage(canvas, {
              returnDetailedScanResult: true,
            });

            if (result && result.data) {
              await handleDecodedQr(result.data);
            }
          } catch {
            // 디코딩 실패(QR 미포착)는 루프 내에서 자연스럽게 무시
          }
        }
        isProcessingFrame.current = false;
      }

      animationFrameId = requestAnimationFrame(scanFrameLoop);
    };

    startCamera();

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isCameraOn, selectedDeviceId]);

  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newDeviceId = e.target.value;
    setSelectedDeviceId(newDeviceId);
    localStorage.setItem('kfhi_selected_camera_id', newDeviceId);
  };

  const lastScannedCipherRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);

  const handleDecodedQr = async (cipherText: string) => {
    const now = Date.now();
    const isSameCipher = lastScannedCipherRef.current === cipherText;
    const timeDiff = now - lastScannedTimeRef.current;

    // 1. [동일 QR (성공/실패 공통)] 3초 이내에 연속으로 대어진 경우 ➡️ 반응 무시 (소리/팝업 안남)
    if (isSameCipher && timeDiff < 3000) {
      return;
    }

    // 암호문 및 시각 갱신 (다른 QR이면 즉시 시도)
    lastScannedCipherRef.current = cipherText;
    lastScannedTimeRef.current = now;

    try {
      let payload: any = null;

      if ((window as any).electronAPI?.decryptPayload) {
        const res = await (window as any).electronAPI.decryptPayload(cipherText, secretKey);
        if (!res.success) throw new Error(res.error);
        payload = res.payload;
      } else {
        // 웹 순수 테스트 Fallback (구분자 형태 단축 파싱 시도)
        if (cipherText.includes('|')) {
          const parts = cipherText.split('|');
          payload = { v: 1, id: parts[1] || '00001', n: parts[2] || '테스트', a: parts[3] || '기아대책', t: parts[4] || '참석자' };
        } else {
          throw new Error('Electron 환경에서 구동해주세요.');
        }
      }

      // 2. [중복 판정] 과거/당일 누적 기록(scanHistory) 중 동일 참석자(이사회명+직함+성명 또는 관리번호) 체크
      const alreadyRegistered = scanHistoryRef.current.some((r) => {
        if (payload.id && r.managementNumber) {
          return r.managementNumber === payload.id;
        }
        return r.affiliation === payload.a && r.name === payload.n && r.title === payload.t;
      });

      const record: ScanRecord = {
        name: payload.n,
        affiliation: payload.a,
        title: payload.t,
        tshirtSize: payload.s || '',
        managementNumber: payload.id || '',
        location: locationName,
        scannedAt: formatKSTDateTime(),
        isDuplicate: alreadyRegistered,
      };

      if (alreadyRegistered) {
        playSound('DUPLICATE'); // 이미 등록된 중복 입장은 부드럽고 따스한 환영음 재생
      } else {
        playSound('SUCCESS'); // 최초 입장은 띵-동 성공음 재생
      }

      onScanSuccess(record);
    } catch (err: any) {
      playSound('ERROR');
      onScanError('등록되지 않은 QR입니다. 안내데스크에 방문 부탁드립니다.');
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '500px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* 카메라 제어 바: ON/OFF 버튼 & 카메라 선택 드롭다운 */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0f172a', padding: '8px 12px', borderRadius: '8px', border: '1px solid #334155' }}>
        {/* 카메라 ON/OFF 버튼 */}
        <button
          onClick={() => setIsCameraOn((prev) => !prev)}
          style={{
            backgroundColor: isCameraOn ? '#15803d' : '#991b1b',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '6px',
            fontWeight: 'bold',
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap',
          }}
        >
          {isCameraOn ? '🟢 카메라 ON' : '🔴 카메라 OFF'}
        </button>

        {/* 카메라 선택 드롭다운 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, maxWidth: '280px' }}>
          <span style={{ fontSize: '13px', color: '#94a3b8', whiteSpace: 'nowrap' }}>📷</span>
          <select
            value={selectedDeviceId}
            onChange={handleDeviceChange}
            disabled={!isCameraOn || cameraDevices.length === 0}
            style={{
              width: '100%',
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid #475569',
              backgroundColor: '#1e293b',
              color: isCameraOn ? 'white' : '#64748b',
              fontSize: '12px',
              outline: 'none',
              cursor: isCameraOn ? 'pointer' : 'not-allowed',
            }}
          >
            {cameraDevices.length === 0 ? (
              <option value="">카메라 찾는 중...</option>
            ) : (
              cameraDevices.map((device, idx) => (
                <option key={device.deviceId || idx} value={device.deviceId}>
                  {device.label || `카메라 ${idx + 1}`}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* 비디오 뷰포트 컨테이너 */}
      <div style={{ position: 'relative', width: '100%', borderRadius: '12px', overflow: 'hidden' }}>
        <video
          ref={videoRef}
          muted
          playsInline
          style={{
            width: '100%',
            borderRadius: '12px',
            backgroundColor: '#1e293b',
            display: isCameraOn && cameraStatus === 'READY' ? 'block' : 'none',
          }}
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* 중앙 ROI 가이드 Overlay (20mm 소형 QR 초점 스위트스팟 레티클 박스) */}
        {isCameraOn && cameraStatus === 'READY' && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '220px',
                height: '220px',
                border: '2px solid rgba(16, 185, 129, 0.7)',
                borderRadius: '16px',
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                position: 'relative',
              }}
            >
              {/* 4개 코너 엣지 강조 */}
              <div style={{ position: 'absolute', top: -2, left: -2, width: '22px', height: '22px', borderTop: '4px solid #34d399', borderLeft: '4px solid #34d399', borderTopLeftRadius: '16px' }} />
              <div style={{ position: 'absolute', top: -2, right: -2, width: '22px', height: '22px', borderTop: '4px solid #34d399', borderRight: '4px solid #34d399', borderTopRightRadius: '16px' }} />
              <div style={{ position: 'absolute', bottom: -2, left: -2, width: '22px', height: '22px', borderBottom: '4px solid #34d399', borderLeft: '4px solid #34d399', borderBottomLeftRadius: '16px' }} />
              <div style={{ position: 'absolute', bottom: -2, right: -2, width: '22px', height: '22px', borderBottom: '4px solid #34d399', borderRight: '4px solid #34d399', borderBottomRightRadius: '16px' }} />
            </div>
            <span
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                color: '#34d399',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 'bold',
                border: '1px solid rgba(52, 211, 153, 0.4)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
              }}
            >
              QR코드를 사각형 안에 비춰주세요
            </span>
          </div>
        )}

        {!isCameraOn && (
          <div style={{ padding: '70px 20px', textAlign: 'center', backgroundColor: '#1e293b', borderRadius: '12px', color: '#94a3b8' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📷</div>
            <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#f8fafc' }}>카메라가 꺼져 있습니다</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>상단의 '카메라 ON' 버튼을 눌러 스캔을 재개하세요.</div>
          </div>
        )}

        {isCameraOn && cameraStatus === 'INITIALIZING' && (
          <div style={{ padding: '60px', textAlign: 'center', backgroundColor: '#1e293b', borderRadius: '12px', color: '#94a3b8' }}>
            카메라를 연결하는 중입니다...
          </div>
        )}

        {isCameraOn && cameraStatus === 'ERROR' && (
          <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#451a1a', borderRadius: '12px', color: '#fca5a5' }}>
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  );
};
