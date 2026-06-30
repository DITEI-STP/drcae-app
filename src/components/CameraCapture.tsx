import React, { useRef, useState, useEffect, useCallback } from 'react';
import { RefreshCcw, X, ZoomIn, ZoomOut, Zap, Square, Circle } from 'lucide-react';
import { cn } from '../lib/utils';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
  mode?: 'photo' | 'video';
}

function getVideoMimeType(): string {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return 'video/webm';
}

function formatElapsed(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function CameraCapture({ onCapture, onClose, mode = 'photo' }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraIndex, setCameraIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [zoomCaps, setZoomCaps] = useState<{ min: number; max: number } | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  // Video recording state
  const [recording, setRecording] = useState(false);
  const [elapsedSecs, setElapsedSecs] = useState(0);

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

  const startCamera = useCallback(async (facing: 'environment' | 'user', devIndex: number | null) => {
    setReady(false);
    setError(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    trackRef.current = null;

    try {
      const constraints: MediaStreamConstraints =
        devIndex !== null && cameras[devIndex]
          ? { video: { deviceId: { exact: cameras[devIndex].deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: mode === 'video' }
          : { video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: mode === 'video' };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      applyTrackCapabilities(track);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setReady(true);
      }

      if (cameras.length === 0) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter(d => d.kind === 'videoinput');
        setCameras(cams);
      }
    } catch {
      setError('Não foi possível aceder à câmara. Verifique as permissões do browser.');
    }
  }, [cameras, applyTrackCapabilities, mode]);

  useEffect(() => {
    startCamera(facingMode, cameraIndex);
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [facingMode, cameraIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePhotoCapture = () => {
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

  const startRecording = () => {
    if (!streamRef.current || !ready) return;
    const mimeType = getVideoMimeType();
    const mr = new MediaRecorder(streamRef.current, { mimeType });
    mediaRecorderRef.current = mr;
    chunksRef.current = [];

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `video_${Date.now()}.${ext}`, { type: mimeType.split(';')[0] });
      onCapture(file);
      onClose();
    };

    mr.start(1000); // collect data every 1s
    setRecording(true);
    setElapsedSecs(0);
    timerRef.current = setInterval(() => setElapsedSecs(s => s + 1), 1000);
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const toggleCamera = () => {
    if (recording) return;
    if (cameras.length > 1) {
      setCameraIndex(i => ((i ?? 0) + 1) % cameras.length);
    } else {
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

  const isVideo = mode === 'video';

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Barra superior */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/60 shrink-0">
        <button onClick={onClose} disabled={recording} className="p-2 text-white/80 hover:text-white disabled:opacity-40 rounded-lg transition-colors">
          <X className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2">
          {recording && (
            <span className="flex items-center gap-1.5 text-red-400 text-sm font-semibold">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {formatElapsed(elapsedSecs)}
            </span>
          )}
          {!recording && (
            <span className="text-white text-sm font-semibold">{isVideo ? 'Vídeo' : 'Câmara'}</span>
          )}
        </div>
        <button onClick={toggleCamera} disabled={recording} className="p-2 text-white/80 hover:text-white disabled:opacity-40 rounded-lg transition-colors">
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
            {!recording && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className={cn('border-2 border-white/30 rounded-2xl', isVideo ? 'w-64 h-48' : 'w-48 h-48')} />
              </div>
            )}

            {/* Controlos de lanterna no canto inferior */}
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-auto">
              <span className="text-white/50 text-xs">
                {cameras.length > 1
                  ? `Câm. ${((cameraIndex ?? 0) + 1)} / ${cameras.length}`
                  : facingMode === 'environment' ? 'Traseira' : 'Frontal'}
              </span>
              {torchSupported && !recording && (
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
      {zoomCaps && !recording && (
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
        {isVideo ? (
          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={!ready || !!error}
            className={cn(
              'w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all',
              recording
                ? 'border-red-500 bg-red-500/20 hover:bg-red-500/30 active:scale-95'
                : ready && !error
                ? 'border-red-400 bg-black/30 hover:bg-red-500/20 active:scale-95'
                : 'border-white/30 opacity-40 cursor-not-allowed'
            )}
          >
            {recording
              ? <Square className="w-8 h-8 text-red-400 fill-red-400" />
              : <Circle className="w-10 h-10 text-red-400 fill-red-400" />
            }
          </button>
        ) : (
          <button
            onClick={handlePhotoCapture}
            disabled={!ready || !!error}
            className={cn(
              'w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-all',
              ready && !error ? 'bg-white/20 hover:bg-white/30 active:scale-95' : 'opacity-40 cursor-not-allowed'
            )}
          >
            <div className="w-14 h-14 rounded-full bg-white" />
          </button>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
