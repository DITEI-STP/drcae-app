import type { GeoCoords } from './geo';
import { MAP_TILE_LAYERS, type MapProvider } from '../components/map/MapLayerSwitcher';

const OFFLINE_TILE_CACHE = 'drcae-map-tiles-v1';
const OFFLINE_TILE_PREFETCH_KEY = 'drcae_offline_tile_prefetch';
const MAX_PREFETCH_TILES = 160;

type Tile = { z: number; x: number; y: number };

function lngToTileX(lng: number, zoom: number) {
  return Math.floor(((lng + 180) / 360) * 2 ** zoom);
}

function latToTileY(lat: number, zoom: number) {
  const rad = lat * Math.PI / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom);
}

function tileUrl(provider: Exclude<MapProvider, 'simple'>, tile: Tile) {
  const subdomain = ['a', 'b', 'c'][Math.abs(tile.x + tile.y) % 3];
  return MAP_TILE_LAYERS[provider]
    .replace('{s}', subdomain)
    .replace('{z}', String(tile.z))
    .replace('{x}', String(tile.x))
    .replace('{y}', String(tile.y))
    .replace('{r}', '');
}

function tilesAround(point: GeoCoords, zoom: number, radius: number): Tile[] {
  const centerX = lngToTileX(point.lng, zoom);
  const centerY = latToTileY(point.lat, zoom);
  const tiles: Tile[] = [];

  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      tiles.push({ z: zoom, x: centerX + dx, y: centerY + dy });
    }
  }

  return tiles;
}

function uniquePoints(points: GeoCoords[]) {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getPrefetchMarker() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_TILE_PREFETCH_KEY) || '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function setPrefetchMarker(marker: Record<string, number>) {
  try {
    localStorage.setItem(OFFLINE_TILE_PREFETCH_KEY, JSON.stringify(marker));
  } catch {}
}

export async function prefetchOfflineMapTiles(points: GeoCoords[], provider: Exclude<MapProvider, 'simple'> = 'osm') {
  if (!navigator.onLine || !('caches' in window) || points.length === 0) return { cached: 0 };

  const marker = getPrefetchMarker();
  const today = new Date().toISOString().slice(0, 10);
  const prioritizedPoints = uniquePoints(points).slice(0, 30);
  const requested = new Map<string, string>();

  for (const point of prioritizedPoints) {
    for (const zoom of [13, 14, 15]) {
      const radius = zoom >= 15 ? 1 : 0;
      for (const tile of tilesAround(point, zoom, radius)) {
        const url = tileUrl(provider, tile);
        if (marker[url] === Date.parse(today)) continue;
        requested.set(url, url);
        if (requested.size >= MAX_PREFETCH_TILES) break;
      }
      if (requested.size >= MAX_PREFETCH_TILES) break;
    }
    if (requested.size >= MAX_PREFETCH_TILES) break;
  }

  const cache = await caches.open(OFFLINE_TILE_CACHE);
  let cached = 0;
  for (const url of requested.values()) {
    try {
      const existing = await cache.match(url);
      if (existing) continue;
      const response = await fetch(url, { mode: 'no-cors', credentials: 'omit' });
      await cache.put(url, response);
      marker[url] = Date.parse(today);
      cached += 1;
    } catch {}
  }

  setPrefetchMarker(marker);
  return { cached };
}

