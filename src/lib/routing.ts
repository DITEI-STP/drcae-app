import type { GeoCoords } from './geo';

export type RouteSource = 'online' | 'cached' | 'direct';

export type RouteStep = {
  text: string;
  dist: string;
};

export type RoutePlan = {
  coordinates: GeoCoords[];
  distanceKm: number;
  durationMin: number;
  steps: RouteStep[];
  source: RouteSource;
  updatedAt: number;
};

const ROUTE_CACHE_KEY = 'drcae_route_cache_v1';

function toRad(value: number) {
  return value * Math.PI / 180;
}

export function calculateDistanceKm(a: GeoCoords, b: GeoCoords) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function calculateBearing(from: GeoCoords, to: GeoCoords) {
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function formatDistance(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

function directionLabel(bearing: number) {
  if (bearing >= 337.5 || bearing < 22.5) return 'norte';
  if (bearing < 67.5) return 'nordeste';
  if (bearing < 112.5) return 'este';
  if (bearing < 157.5) return 'sudeste';
  if (bearing < 202.5) return 'sul';
  if (bearing < 247.5) return 'sudoeste';
  if (bearing < 292.5) return 'oeste';
  return 'noroeste';
}

function routeKey(start: GeoCoords, target: GeoCoords) {
  return [
    start.lat.toFixed(4),
    start.lng.toFixed(4),
    target.lat.toFixed(4),
    target.lng.toFixed(4),
  ].join(':');
}

function readRouteCache() {
  try {
    return JSON.parse(localStorage.getItem(ROUTE_CACHE_KEY) || '{}') as Record<string, RoutePlan>;
  } catch {
    return {};
  }
}

function writeRouteCache(cache: Record<string, RoutePlan>) {
  try {
    localStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

function directRoute(start: GeoCoords, target: GeoCoords, source: RouteSource): RoutePlan {
  const distanceKm = calculateDistanceKm(start, target);
  const bearing = calculateBearing(start, target);
  return {
    coordinates: [start, target],
    distanceKm,
    durationMin: Math.max(2, Math.round(distanceKm * 3)),
    source,
    updatedAt: Date.now(),
    steps: [
      { text: 'Partida da localização atual do agente', dist: '0 m' },
      { text: `Siga em direção ${directionLabel(bearing)} ao ponto georreferenciado`, dist: formatDistance(distanceKm) },
      { text: 'Chegada ao operador económico', dist: 'Destino' },
    ],
  };
}

function maneuverInstruction(step: any) {
  const modifier = step?.maneuver?.modifier ? ` ${step.maneuver.modifier}` : '';
  const name = step?.name ? ` em ${step.name}` : '';
  const type = step?.maneuver?.type || 'continue';
  if (type === 'arrive') return 'Chegada ao operador económico';
  if (type === 'depart') return `Partida${name}`;
  if (type === 'turn') return `Vire${modifier}${name}`;
  if (type === 'roundabout') return `Entre na rotunda${name}`;
  if (type === 'new name') return `Continue${name}`;
  return `Siga${name}`;
}

async function fetchOnlineRoute(start: GeoCoords, target: GeoCoords): Promise<RoutePlan | null> {
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${target.lng},${target.lat}`);
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('steps', 'true');

  const response = await fetch(url.toString());
  if (!response.ok) return null;
  const payload = await response.json();
  const route = payload?.routes?.[0];
  if (!route?.geometry?.coordinates?.length) return null;

  const coordinates = route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng }));
  const rawSteps = route.legs?.flatMap((leg: any) => leg.steps || []) || [];
  const steps = rawSteps.slice(0, 8).map((step: any) => ({
    text: maneuverInstruction(step),
    dist: formatDistance((Number(step.distance) || 0) / 1000),
  }));

  if (!steps.length) {
    steps.push(...directRoute(start, target, 'online').steps);
  }

  return {
    coordinates,
    distanceKm: Number(route.distance || 0) / 1000,
    durationMin: Math.max(1, Math.round(Number(route.duration || 0) / 60)),
    steps,
    source: 'online',
    updatedAt: Date.now(),
  };
}

export async function buildRoutePlan(start: GeoCoords | null, target: GeoCoords | null): Promise<RoutePlan | null> {
  if (!start || !target) return null;
  const key = routeKey(start, target);
  const cache = readRouteCache();

  if (navigator.onLine) {
    try {
      const online = await fetchOnlineRoute(start, target);
      if (online) {
        cache[key] = online;
        writeRouteCache(cache);
        return online;
      }
    } catch {}
  }

  if (cache[key]) {
    return { ...cache[key], source: 'cached' };
  }

  return directRoute(start, target, 'direct');
}

