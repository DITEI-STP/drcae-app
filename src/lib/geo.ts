import { useState, useEffect } from 'react';

export type GeoCoords = { lat: number; lng: number; accuracy?: number };

// Detecta se a app está a correr dentro do React Native WebView
export function isWebviewMode(): boolean {
  return typeof window !== 'undefined' && !!(window as any).ReactNativeWebView;
}

// Lê a localização nativa armazenada pelo webview no localStorage
function readNativeLocation(): GeoCoords | null {
  try {
    const raw = localStorage.getItem('drcae_native_location');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.latitude == null || parsed.longitude == null) return null;
    return { lat: parsed.latitude, lng: parsed.longitude, accuracy: parsed.accuracy };
  } catch {
    return null;
  }
}

/**
 * Hook unificado de geolocalização.
 * - Modo webview: recebe coordenadas nativas injetadas pelo React Native via
 *   CustomEvent 'drcae-location-update' e localStorage 'drcae_native_location'.
 * - Modo browser: usa navigator.geolocation.watchPosition diretamente.
 */
export function useGeoLocation(): { location: GeoCoords | null; error: string | null; refresh: () => void } {
  const [location, setLocation] = useState<GeoCoords | null>(() => readNativeLocation());
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => setRefreshKey(k => k + 1);

  useEffect(() => {
    if (isWebviewMode()) {
      // Webview: reagir a eventos injetados pelo React Native
      const handleNativeUpdate = (e: Event) => {
        const detail = (e as CustomEvent<{ latitude: number; longitude: number; accuracy?: number }>).detail;
        if (detail?.latitude != null && detail?.longitude != null) {
          setLocation({ lat: detail.latitude, lng: detail.longitude, accuracy: detail.accuracy });
          setError(null);
        }
      };
      window.addEventListener('drcae-location-update', handleNativeUpdate);

      // Polling de fallback (para o caso do evento já ter disparado antes do listener estar registado)
      const interval = setInterval(() => {
        const loc = readNativeLocation();
        if (loc) setLocation(loc);
      }, 4000);

      return () => {
        window.removeEventListener('drcae-location-update', handleNativeUpdate);
        clearInterval(interval);
      };
    } else {
      // Browser: watchPosition contínuo
      if (!navigator.geolocation) {
        setError('Geolocalização não suportada neste navegador.');
        return;
      }
      const watchId = navigator.geolocation.watchPosition(
        pos => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? undefined });
          setError(null);
        },
        err => setError(err.message),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [refreshKey]);

  return { location, error, refresh };
}
