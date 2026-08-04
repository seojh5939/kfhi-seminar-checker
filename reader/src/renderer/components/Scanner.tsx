import React, { useEffect, useRef, useState } from 'react';
import QrScanner from 'qr-scanner';
import { ScanRecord } from 'shared';

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
  const [cameraStatus, setCameraStatus] = useState<'INITIALIZING' | 'READY' | 'ERROR'>('INITIALIZING');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const scanHistoryRef = useRef<ScanRecord[]>(scanHistory);
  useEffect(() => {
    scanHistoryRef.current = scanHistory;
  }, [scanHistory]);

  const recentScanHistory = useRef<Map<string, number>>(new Map());
  const isProcessingFrame = useRef(false);

  // Web Audio API를 활용한 성공(하이패스 띵동)/실패(경고 삐삐) 효과음 유틸리티
  const playSound = (type: 'SUCCESS' | 'ERROR') => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = audioCtx.currentTime;

      if (type === 'SUCCESS') {
        // [하이패스 띵-동 2음계 사운드]
        // 1음 (띵): G5 (784Hz), 0.12초
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

        // 2음 (동!): C6 (1046Hz), 0.25초 (0.08초 시점에 겹쳐서 재생)
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
      } else {
        // [실패 음: 묵직한 2단 삐-삐 경고음 (추천)]
        // 1음: E4 (330Hz), 톱니파
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

        // 2음: A3 (220Hz), 톱니파 (0.14초 시점)
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

  useEffect(() => {
    let animationFrameId: number;
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        setCameraStatus('INITIALIZING');
        // 640x480 다운샘플링 캡처 (저사양 카메라 최적화)
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraStatus('READY');
          setIsScanning(true);
          scanFrameLoop();
        }
      } catch (err: any) {
        setCameraStatus('ERROR');
        setErrorMessage('카메라를 연결할 수 없습니다. 웹캠 권한 및 연결 상태를 확인해주세요.');
        onScanError('카메라 초기화 실패');
      }
    };

    // 중앙 ROI (250x250) 잘라내기 초고속 프레임 루프 (100ms 디바운스, 200ms 타겟)
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

          // 중앙 250x250 ROI 계산
          const cropSize = Math.min(250, videoWidth, videoHeight);
          const cropX = (videoWidth - cropSize) / 2;
          const cropY = (videoHeight - cropSize) / 2;

          canvas.width = cropSize;
          canvas.height = cropSize;

          // ROI 영역만 잘라내어 Canvas에 드로잉
          ctx.drawImage(video, cropX, cropY, cropSize, cropSize, 0, 0, cropSize, cropSize);

          try {
            // qr-scanner WASM 디코더 호출 (ROI Canvas 대상)
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
  }, []);

  const lastScannedIdRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);

  const handleDecodedQr = async (cipherText: string) => {
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

      const now = Date.now();
      const isSameQr = lastScannedIdRef.current === payload.id;
      const timeDiff = now - lastScannedTimeRef.current;

      // 1. [동일 QR] 3초 이내에 또 대어진 경우 ➡️ 연속 스캔 반응 무시 (소리/팝업 안남)
      if (isSameQr && timeDiff < 3000) {
        return;
      }

      // 2. [중복 판정] 과거/당일 누적 기록(scanHistory) 중 동일 관리번호가 단 한 번이라도 존재하는지 체크
      const alreadyRegistered = scanHistoryRef.current.some(
        (r) => r.managementNumber === payload.id
      );

      // 스캔 이력 타임스탬프 및 ID 갱신
      lastScannedIdRef.current = payload.id;
      lastScannedTimeRef.current = now;

      const record: ScanRecord = {
        managementNumber: payload.id,
        name: payload.n,
        affiliation: payload.a,
        title: payload.t,
        location: locationName,
        scannedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
        isDuplicate: alreadyRegistered,
      };

      if (alreadyRegistered) {
        playSound('ERROR'); // 이미 등록된 중복 입장은 경고음 재생
      } else {
        playSound('SUCCESS'); // 최초 입장은 띵-동 성공음 재생
      }

      onScanSuccess(record);
    } catch (err: any) {
      playSound('ERROR');
      onScanError('위변조되거나 등록되지 않은 QR 코드입니다.');
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '500px', margin: '0 auto', borderRadius: '12px', overflow: 'hidden' }}>
      <video
        ref={videoRef}
        muted
        playsInline
        style={{
          width: '100%',
          borderRadius: '12px',
          backgroundColor: '#1e293b',
          display: cameraStatus === 'READY' ? 'block' : 'none',
        }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* 중앙 ROI 가이드 Overlay (250x250 레티클 박스) */}
      {cameraStatus === 'READY' && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: '220px',
              height: '220px',
              border: '3px solid #10b981',
              borderRadius: '16px',
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981',
              fontWeight: 'bold',
              fontSize: '14px',
            }}
          >
            <span style={{ backgroundColor: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: '4px' }}>
              QR을 사각형 안에 맞추세요
            </span>
          </div>
        </div>
      )}

      {cameraStatus === 'INITIALIZING' && (
        <div style={{ padding: '60px', textAlign: 'center', backgroundColor: '#1e293b', borderRadius: '12px', color: '#94a3b8' }}>
          카메라를 초기화하는 중입니다...
        </div>
      )}

      {cameraStatus === 'ERROR' && (
        <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#451a1a', borderRadius: '12px', color: '#fca5a5' }}>
          {errorMessage}
        </div>
      )}
    </div>
  );
};
