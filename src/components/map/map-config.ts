import { createMapConfig } from './map-provider.util';
export type { MapProvider } from './map-provider.util';

declare global {
  interface Window {
    __DRCAE_MAP_CONFIG__?: { cartoBasemapApiKey?: string };
  }
}

const runtimeKey = typeof window === 'undefined'
  ? undefined
  : window.__DRCAE_MAP_CONFIG__?.cartoBasemapApiKey;

export const {
  tiles: MAP_TILE_LAYERS,
  attributions: MAP_ATTRIBUTIONS,
  cartoAvailable: CARTO_AVAILABLE,
} = createMapConfig(runtimeKey, import.meta.env.VITE_CARTO_BASEMAP_API_KEY);
