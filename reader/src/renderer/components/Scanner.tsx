import React, { useEffect, useRef, useState } from 'react';
import QrScanner from 'qr-scanner';
import { CryptoEngine, ScanRecord } from 'shared';

interface ScannerProps {
  locationName: string;
  secretKey?: string;
  onScanSuccess: (record: ScanRecord) => void;
  onScanError: (errorMessage: string) => void;
}

export const Scanner: React.FC<ScannerProps> = ({
  locationName,
  secretKey,
  onScanSuccess,
  onScanError,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<'INITIALIZING' | 'READY' | 'ERROR'>('INITIALIZING');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cryptoEngineRef = useRef(new CryptoEngine(secretKey));
  const recentScanHistory = useRef<Map<string, number>>(new Map()); // id -> timestamp (3초 Cooldown)
  const isProcessingFrame = useRef(false);

  // Web Audio API를 활용한 성공/에러 비프음 재생 유틸리티
  const playSound = (type: 'SUCCESS' | 'ERROR') => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      if (type === 'SUCCESS') {
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 (높은 삐 소리)
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
      } else {
        osc.frequency.setValueAtTime(300, audioCtx.currentTime); // 둔탁한 에러음
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
      }
    } catch {
      // AudioContext 미지원 환경 가드
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
              handleDecodedQr(result.data);
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

  const handleDecodedQr = (cipherText: string) => {
    try {
      // 콤팩트 및 기존 Hex 복호화 지원
      const payload = cryptoEngineRef.current.decryptToPayload(cipherText);
      const now = Date.now();

      // 3초 Cooldown/Debounce 검사 (동일 대상 연달아 스캔 방지)
      const lastScanned = recentScanHistory.current.get(payload.id);
      const isDuplicate = !!(lastScanned && now - lastScanned < 3000);

      // 스캔 이력 타임스탬프 갱신
      recentScanHistory.current.set(payload.id, now);

      const record: ScanRecord = {
        managementNumber: payload.id,
        name: payload.n,
        affiliation: payload.a,
        title: payload.t,
        location: locationName,
        scannedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
        isDuplicate,
      };

      playSound('SUCCESS');
      onScanSuccess(record);
    } catch (err: any) {
      playSound('ERROR');
      onScanError('위변조되거나 등록되지 않은 QR 코드입니다.');
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '500px', margin: '0 auto' }}>
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
