import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, RefreshCcw, X, ZoomIn } from 'lucide-react';
import { cn } from '../lib/utils';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

export default function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const startCamera = useCallback(async (mode: 'environment' | 'user') => {
    setReady(false);
    setError(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setReady(true);
      }
    } catch (err: any) {
      setError('Não foi possível aceder à câmara. Verifique as permissões do browser.');
    }
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [facingMode, startCamera]);

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

  const toggleCamera = () => setFacingMode(m => m === 'environment' ? 'user' : 'environment');

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
            <Camera className="w-12 h-12 text-white/40" />
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
            {/* Flash de captura */}
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
          </>
        )}
      </div>

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

      {/* Canvas oculto para captura */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
