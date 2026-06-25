import React, { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import { Camera, Keyboard, AlertCircle, Loader2, QrCode, RefreshCw, Zap, ZoomIn, ZoomOut } from 'lucide-react';
import * as api from '../lib/api';
import {
  collectBrowserDeviceInfo,
  generateDeviceAlias,
  storePairingCredentials,
} from '../lib/pairing';

interface QRPayload {
  v: number;
  code: string;
  endpoint?: string;
}

interface Props {
  onRegistered: (autoApproved: boolean) => void;
}

type Mode = 'scan' | 'manual';

export default function PairingScreen({ onRegistered }: Props) {
  const [mode, setMode] = useState<Mode>('scan');
  const [cameraError, setCameraError] = useState('');

  const [manualCode, setManualCode] = useState('');
  const [manualEndpoint, setManualEndpoint] = useState(window.location.origin);
  const [alias, setAlias] = useState(() => generateDeviceAlias());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Camera controls
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraIndex, setCameraIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [zoomCaps, setZoomCaps] = useState<{ min: number; max: number } | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const scannedRef = useRef(false);

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

  // Inicia câmara quando em modo scan ou quando cameraIndex muda
  useEffect(() => {
    if (mode !== 'scan') {
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      trackRef.current = null;
      return;
    }

    scannedRef.current = false;
    setCameraError('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Câmara não suportada neste browser ou contexto (HTTPS necessário).');
      return;
    }

    let cancelled = false;

    const startCamera = async () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        trackRef.current = null;
      }

      try {
        // Se já temos câmaras enumeradas, usar deviceId para selecção precisa
        const constraints: MediaStreamConstraints =
          cameras.length > 0 && cameras[cameraIndex]
            ? { video: { deviceId: { exact: cameras[cameraIndex].deviceId } } }
            : { video: { facingMode: 'environment' } };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        applyTrackCapabilities(track);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }

        // Enumerar câmaras após permissão concedida (labels ficam disponíveis)
        if (cameras.length === 0) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const cams = devices.filter(d => d.kind === 'videoinput');
          if (!cancelled) setCameras(cams);
        }
      } catch {
        if (!cancelled) setCameraError('Permissão de câmara negada. Use a introdução manual.');
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      trackRef.current = null;
    };
  }, [mode, cameraIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Loop de scan de QR
  useEffect(() => {
    if (mode !== 'scan') return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < video.HAVE_ENOUGH_DATA) return;
      if (scannedRef.current) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(imageData.data, imageData.width, imageData.height);

      if (result?.data) {
        try {
          const payload: QRPayload = JSON.parse(result.data);
          if (payload.v === 2 && payload.code) {
            scannedRef.current = true;
            handleSubmit(payload.code, payload.endpoint || window.location.origin);
          }
        } catch {
          // QR de outro formato, ignorar
        }
      }
    }, 200);

    return () => clearInterval(interval);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const cycleCamera = () => {
    if (cameras.length <= 1) return;
    setCameraIndex(i => (i + 1) % cameras.length);
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

  async function handleSubmit(code: string, endpoint: string) {
    const deviceId = api.getDeviceId();
    const deviceAlias = alias.trim() || generateDeviceAlias();
    const deviceInfo = collectBrowserDeviceInfo(deviceId);

    setLoading(true);
    setError('');

    try {
      const result = await api.registerDeviceFull(code, deviceAlias, deviceInfo);
      storePairingCredentials({
        device_id: deviceId,
        webview_signature: result.webview_signature,
        session_id: result.session_id,
        device_code: result.device_code,
        endpoint,
        paired_at: new Date().toISOString(),
      });
      let autoApproved = false;
      try {
        const status = await api.checkDeviceStatus();
        autoApproved = status.paired;
      } catch {}
      onRegistered(autoApproved);
    } catch (err: any) {
      setError(err.message || 'Falha ao emparelhar. Verifique o código e tente novamente.');
      scannedRef.current = false;
    } finally {
      setLoading(false);
    }
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualCode.trim() || manualCode.trim().length < 4) {
      setError('Introduza o código de emparelhamento completo.');
      return;
    }
    handleSubmit(manualCode.trim(), manualEndpoint.trim() || window.location.origin);
  }

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Cabeçalho */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <QrCode className="w-7 h-7 text-blue-400" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-widest">DRCAE</h1>
          <p className="text-slate-400 text-sm mt-2">Emparelhar Dispositivo</p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl bg-slate-800/60 p-1 mb-6 gap-1">
          <button
            onClick={() => { setMode('scan'); setError(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              mode === 'scan'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Camera className="w-4 h-4" />
            QR Code
          </button>
          <button
            onClick={() => { setMode('manual'); setError(''); scannedRef.current = false; }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              mode === 'manual'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Keyboard className="w-4 h-4" />
            Manual
          </button>
        </div>

        {/* Conteúdo */}
        {mode === 'scan' ? (
          <div className="space-y-3">
            {cameraError ? (
              <div className="bg-amber-900/30 border border-amber-700/40 rounded-2xl p-4 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                <p className="text-amber-300 text-sm">{cameraError}</p>
                <button
                  onClick={() => setMode('manual')}
                  className="text-blue-400 text-sm underline underline-offset-2"
                >
                  Introduzir código manualmente
                </button>
              </div>
            ) : (
              <>
                <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-square">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    playsInline
                    muted
                  />
                  {/* Viewfinder */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-52 h-52 relative">
                      <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-400 rounded-tl-lg" />
                      <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-400 rounded-tr-lg" />
                      <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-400 rounded-bl-lg" />
                      <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-400 rounded-br-lg" />
                    </div>
                  </div>

                  {/* Controlos sobrepostos */}
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-auto">
                    {cameras.length > 1 ? (
                      <button
                        onClick={cycleCamera}
                        title={`Câmara ${cameraIndex + 1} de ${cameras.length}`}
                        className="p-2 bg-slate-900/75 hover:bg-slate-800/90 rounded-full text-white transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    ) : <span />}

                    {torchSupported && (
                      <button
                        onClick={toggleTorch}
                        title={torchOn ? 'Desligar lanterna' : 'Ligar lanterna'}
                        className={`p-2 rounded-full transition-colors ${
                          torchOn
                            ? 'bg-yellow-500 text-slate-900'
                            : 'bg-slate-900/75 hover:bg-slate-800/90 text-white'
                        }`}
                      >
                        <Zap className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {loading && (
                    <div className="absolute inset-0 bg-slate-900/70 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                    </div>
                  )}
                </div>

                {/* Controlo de zoom */}
                {zoomCaps && (
                  <div className="flex items-center gap-2 px-1">
                    <button
                      onClick={() => applyZoom(zoom - 0.5)}
                      disabled={zoom <= zoomCaps.min}
                      className="p-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 rounded-lg text-white transition-colors"
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
                      className="flex-1 accent-blue-500"
                    />
                    <button
                      onClick={() => applyZoom(zoom + 0.5)}
                      disabled={zoom >= zoomCaps.max}
                      className="p-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 rounded-lg text-white transition-colors"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <span className="text-slate-400 text-xs w-9 text-right">{zoom.toFixed(1)}x</span>
                  </div>
                )}

                <canvas ref={canvasRef} className="hidden" />
                <p className="text-slate-500 text-xs text-center">
                  Aponte a câmara para o QR code gerado no painel de administração
                </p>
              </>
            )}

            {/* Campo alias (scan) */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                Nome do dispositivo
              </label>
              <input
                type="text"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                placeholder="Ex: Falcao Dourado"
                value={alias}
                onChange={e => setAlias(e.target.value)}
                maxLength={60}
              />
            </div>
          </div>
        ) : (
          <form onSubmit={handleManualSubmit} className="space-y-4">
            {/* Código */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                Código de Emparelhamento
              </label>
              <input
                type="text"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 text-sm font-mono tracking-[0.3em] placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                placeholder="ABC123"
                value={manualCode}
                onChange={e => {
                  setManualCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                  setError('');
                }}
                maxLength={10}
                autoCapitalize="characters"
                spellCheck={false}
              />
            </div>

            {/* Endpoint */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                Endereço do Servidor
              </label>
              <input
                type="url"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                placeholder="https://app.exemplo.gov"
                value={manualEndpoint}
                onChange={e => { setManualEndpoint(e.target.value); setError(''); }}
              />
              <p className="text-slate-600 text-xs mt-1">Visível no painel de administração ao gerar o QR</p>
            </div>

            {/* Alias */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                Nome do dispositivo
              </label>
              <input
                type="text"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                placeholder="Ex: Falcao Dourado"
                value={alias}
                onChange={e => setAlias(e.target.value)}
                maxLength={60}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !manualCode.trim()}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> A emparelhar...</>
              ) : (
                <><RefreshCw className="w-4 h-4" /> Emparelhar</>
              )}
            </button>
          </form>
        )}

        {/* Erro */}
        {error && (
          <div className="mt-4 flex items-start gap-2 bg-red-900/30 border border-red-700/40 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Instrução */}
        <p className="text-slate-600 text-xs text-center mt-6">
          O código QR é gerado no painel admin em <strong className="text-slate-500">Sincronização Móvel</strong>
        </p>
      </div>
    </div>
  );
}
