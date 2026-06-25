import React, { useRef, useState, useEffect, useCallback } from 'react';
import { RefreshCcw, X, ZoomIn, ZoomOut, Zap } from 'lucide-react';
import { cn } from '../lib/utils';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

export default function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  // Camera controls
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraIndex, setCameraIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [zoomCaps, setZoomCaps] = useState<{ min: number; max: number } | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  const applyTrackCapabilities = useCallback((track: MediaStreamTrack) => {
    trackRef.current = track;
    const caps = track.getCapabilities() as any;
    if (caps.zoom) {
      setZoomCaps({ min: caps.zoom.min, max: caps.zoom.max });
      setZoom(caps.zoom.min || 1);
    } else {
      setZoomCaps(null);
    }
    setTorchSupported(!!caps.torch);
    setTorchOn(false);
  }, []);

  const startCamera = useCallback(async (mode: 'environment' | 'user', devIndex: number | null) => {
    setReady(false);
    setError(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    trackRef.current = null;

    try {
      // Use deviceId when available (evita câmaras IR/profundidade)
      const constraints: MediaStreamConstraints =
        devIndex !== null && cameras[devIndex]
          ? { video: { deviceId: { exact: cameras[devIndex].deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }
          : { video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      applyTrackCapabilities(track);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setReady(true);
      }

      // Enumerar câmaras depois de ter permissão
      if (cameras.length === 0) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter(d => d.kind === 'videoinput');
        setCameras(cams);
      }
    } catch {
      setError('Não foi possível aceder à câmara. Verifique as permissões do browser.');
    }
  }, [cameras, applyTrackCapabilities]);

  useEffect(() => {
    startCamera(facingMode, cameraIndex);
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [facingMode, cameraIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current || !ready) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setFlash(true);
    setTimeout(() => setFlash(false), 200);
    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], `foto_${Date.now()}.jpg`, { type: 'image/jpeg' });
      onCapture(file);
      onClose();
    }, 'image/jpeg', 0.92);
  };

  const toggleCamera = () => {
    if (cameras.length > 1) {
      // Cicla por todas as câmaras disponíveis
      setCameraIndex(i => ((i ?? 0) + 1) % cameras.length);
    } else {
      // Fallback: toggle frente/trás por facingMode
      setCameraIndex(null);
      setFacingMode(m => m === 'environment' ? 'user' : 'environment');
    }
  };

  const toggleTorch = async () => {
    if (!trackRef.current || !torchSupported) return;
    const next = !torchOn;
    try {
      await trackRef.current.applyConstraints({ advanced: [{ torch: next } as any] });
      setTorchOn(next);
    } catch {}
  };

  const applyZoom = async (value: number) => {
    if (!trackRef.current || !zoomCaps) return;
    const clamped = Math.max(zoomCaps.min, Math.min(zoomCaps.max, value));
    try {
      await trackRef.current.applyConstraints({ advanced: [{ zoom: clamped } as any] });
      setZoom(clamped);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Barra superior */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/60 shrink-0">
        <button onClick={onClose} className="p-2 text-white/80 hover:text-white rounded-lg transition-colors">
          <X className="w-6 h-6" />
        </button>
        <span className="text-white text-sm font-semibold">Câmara</span>
        <button onClick={toggleCamera} className="p-2 text-white/80 hover:text-white rounded-lg transition-colors">
          <RefreshCcw className="w-5 h-5" />
        </button>
      </div>

      {/* Viewfinder */}
      <div className="relative flex-1 overflow-hidden">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full text-white gap-3 px-6 text-center">
            <X className="w-12 h-12 text-white/40" />
            <p className="text-sm text-white/70">{error}</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={cn('w-full h-full object-cover', !ready && 'opacity-0')}
            />
            {flash && <div className="absolute inset-0 bg-white animate-ping opacity-80 pointer-events-none" />}
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              </div>
            )}
            {/* Guia de foco */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-48 h-48 border-2 border-white/30 rounded-2xl" />
            </div>

            {/* Controlos de lanterna + câmara no canto inferior */}
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-auto">
              <span className="text-white/50 text-xs">
                {cameras.length > 1
                  ? `Câm. ${((cameraIndex ?? 0) + 1)} / ${cameras.length}`
                  : facingMode === 'environment' ? 'Traseira' : 'Frontal'}
              </span>
              {torchSupported && (
                <button
                  onClick={toggleTorch}
                  className={cn(
                    'p-2.5 rounded-full transition-colors',
                    torchOn ? 'bg-yellow-500 text-slate-900' : 'bg-black/50 text-white hover:bg-black/70'
                  )}
                >
                  <Zap className="w-5 h-5" />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Controlo de zoom */}
      {zoomCaps && (
        <div className="flex items-center gap-3 px-4 py-2 bg-black/60 shrink-0">
          <button
            onClick={() => applyZoom(zoom - 0.5)}
            disabled={zoom <= zoomCaps.min}
            className="p-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-30 rounded-lg text-white transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <input
            type="range"
            min={zoomCaps.min}
            max={zoomCaps.max}
            step={0.1}
            value={zoom}
            onChange={e => applyZoom(Number(e.target.value))}
            className="flex-1 accent-white"
          />
          <button
            onClick={() => applyZoom(zoom + 0.5)}
            disabled={zoom >= zoomCaps.max}
            className="p-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-30 rounded-lg text-white transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <span className="text-white/60 text-xs w-9 text-right">{zoom.toFixed(1)}x</span>
        </div>
      )}

      {/* Botão de captura */}
      <div className="flex items-center justify-center pb-10 pt-6 bg-black/60 shrink-0">
        <button
          onClick={handleCapture}
          disabled={!ready || !!error}
          className={cn(
            'w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-all',
            ready && !error ? 'bg-white/20 hover:bg-white/30 active:scale-95' : 'opacity-40 cursor-not-allowed'
          )}
        >
          <div className="w-14 h-14 rounded-full bg-white" />
        </button>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
