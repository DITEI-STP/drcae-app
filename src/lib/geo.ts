import { useState, useEffect } from 'react';

export type GeoProvider = 'gps' | 'network' | 'fused' | 'passive' | 'browser' | 'cache';

export type GeoCoords = {
  lat: number;
  lng: number;
  accuracy?: number;
  altitude?: number | null;
  speed?: number | null;
  heading?: number | null;
  provider?: GeoProvider | string;
  timestamp?: number;
  source?: 'native' | 'browser' | 'cache';
};

const NATIVE_LOCATION_KEY = 'drcae_native_location';
const BEST_LOCATION_KEY = 'drcae_best_location';
const LOCATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function isWebviewMode(): boolean {
  return typeof window !== 'undefined' && !!(window as any).ReactNativeWebView;
}

function normalizeLocation(raw: any, source: GeoCoords['source']): GeoCoords | null {
  const lat = Number(raw?.lat ?? raw?.latitude);
  const lng = Number(raw?.lng ?? raw?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const timestamp = Number(raw?.timestamp ?? Date.now());
  return {
    lat,
    lng,
    accuracy: Number.isFinite(Number(raw?.accuracy)) ? Number(raw.accuracy) : undefined,
    altitude: raw?.altitude ?? null,
    speed: raw?.speed ?? null,
    heading: raw?.heading ?? raw?.bearing ?? null,
    provider: raw?.provider,
    timestamp,
    source,
  };
}

function readStoredLocation(key: string, source: GeoCoords['source']): GeoCoords | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const loc = normalizeLocation(JSON.parse(raw), source);
    if (!loc) return null;
    if (loc.timestamp && Date.now() - loc.timestamp > LOCATION_MAX_AGE_MS) return null;
    return loc;
  } catch {
    return null;
  }
}

function readBestLocation(): GeoCoords | null {
  return readStoredLocation(NATIVE_LOCATION_KEY, 'native') || readStoredLocation(BEST_LOCATION_KEY, 'cache');
}

function scoreLocation(loc: GeoCoords): number {
  const accuracy = loc.accuracy ?? 5000;
  const ageMs = loc.timestamp ? Math.max(0, Date.now() - loc.timestamp) : LOCATION_MAX_AGE_MS;
  const providerBonus = loc.provider === 'gps' ? 1000 : loc.provider === 'fused' ? 500 : 0;
  return providerBonus - accuracy - ageMs / 1000;
}

function chooseBetterLocation(current: GeoCoords | null, next: GeoCoords): GeoCoords {
  if (!current) return next;
  return scoreLocation(next) >= scoreLocation(current) - 50 ? next : current;
}

function persistBestLocation(loc: GeoCoords) {
  try {
    localStorage.setItem(BEST_LOCATION_KEY, JSON.stringify(loc));
  } catch {}
}

export function useGeoLocation(): { location: GeoCoords | null; error: string | null; refresh: () => void } {
  const [location, setLocation] = useState<GeoCoords | null>(() => readBestLocation());
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => setRefreshKey(k => k + 1);

  useEffect(() => {
    const applyLocation = (loc: GeoCoords) => {
      setLocation(prev => {
        const best = chooseBetterLocation(prev, loc);
        persistBestLocation(best);
        return best;
      });
      setError(null);
    };

    const nativeLoc = readStoredLocation(NATIVE_LOCATION_KEY, 'native');
    if (nativeLoc) applyLocation(nativeLoc);

    const handleNativeUpdate = (e: Event) => {
      const loc = normalizeLocation((e as CustomEvent<any>).detail, 'native');
      if (loc) applyLocation(loc);
    };
    window.addEventListener('drcae-location-update', handleNativeUpdate);

    const interval = setInterval(() => {
      const loc = readStoredLocation(NATIVE_LOCATION_KEY, 'native');
      if (loc) applyLocation(loc);
    }, 3000);

    let highAccuracyWatchId: number | null = null;
    let lowAccuracyWatchId: number | null = null;
    let cancelled = false;

    if (navigator.geolocation) {
      const onPosition = (pos: GeolocationPosition) => {
        applyLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? undefined,
          altitude: pos.coords.altitude,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          timestamp: pos.timestamp,
          provider: 'browser',
          source: 'browser',
        });
      };

      const onError = (err: GeolocationPositionError) => {
        if (!cancelled && !readBestLocation()) {
          setError(err.message);
        }
      };

      navigator.geolocation.getCurrentPosition(onPosition, onError, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
      navigator.geolocation.getCurrentPosition(onPosition, () => {}, {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 30 * 60 * 1000,
      });

      highAccuracyWatchId = navigator.geolocation.watchPosition(
        onPosition,
        onError,
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 2000 },
      );
      lowAccuracyWatchId = navigator.geolocation.watchPosition(
        onPosition,
        () => {},
        { enableHighAccuracy: false, timeout: 30000, maximumAge: 10 * 60 * 1000 },
      );
    } else if (!readBestLocation()) {
      setError('Geolocalização não suportada neste navegador.');
    }

    return () => {
      cancelled = true;
      window.removeEventListener('drcae-location-update', handleNativeUpdate);
      clearInterval(interval);
      if (highAccuracyWatchId != null) navigator.geolocation.clearWatch(highAccuracyWatchId);
      if (lowAccuracyWatchId != null) navigator.geolocation.clearWatch(lowAccuracyWatchId);
    };
  }, [refreshKey]);

  return { location, error, refresh };
}
