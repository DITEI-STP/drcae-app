export type MapProvider = 'osm' | 'carto' | 'satellite' | 'simple';

const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function createMapConfig(runtimeKey?: string, developmentKey?: string) {
  const key = (runtimeKey ?? developmentKey ?? '').trim();
  const cartoAvailable = key.length > 0;
  const tiles: Record<MapProvider, string> = {
    osm: OSM_URL,
    carto: cartoAvailable
      ? `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(key)}`
      : OSM_URL,
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    simple: '',
  };
  const attributions: Record<MapProvider, string> = {
    osm: OSM_ATTRIBUTION,
    carto: cartoAvailable
      ? `${OSM_ATTRIBUTION}, &copy; <a href="https://carto.com/attributions">CARTO</a>`
      : OSM_ATTRIBUTION,
    satellite: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    simple: '',
  };
  return { tiles, attributions, cartoAvailable };
}
