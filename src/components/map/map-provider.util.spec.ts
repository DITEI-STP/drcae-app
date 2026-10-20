import { describe, expect, it } from 'vitest';
import { createMapConfig } from './map-provider.util';

describe('createMapConfig', () => {
  it('authenticates CARTO tiles without losing Leaflet placeholders', () => {
    const config = createMapConfig(' cb1_fixture ');
    expect(config.tiles.carto).toBe('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=cb1_fixture');
    expect(config.cartoAvailable).toBe(true);
  });
  it('encodes the key as one query parameter', () => {
    expect(createMapConfig('a&b=1').tiles.carto).toContain('?key=a%26b%3D1');
  });
  it('uses OSM and its attribution when no key is configured', () => {
    const config = createMapConfig(' ');
    expect(config.cartoAvailable).toBe(false);
    expect(config.tiles.carto).toBe(config.tiles.osm);
    expect(config.attributions.carto).toBe(config.attributions.osm);
  });
  it('credits both CARTO and OpenStreetMap', () => {
    expect(createMapConfig('fixture').attributions.carto).toMatch(/CARTO/);
    expect(createMapConfig('fixture').attributions.carto).toMatch(/OpenStreetMap/);
  });
  it('prefers runtime configuration and accepts the development fallback', () => {
    expect(createMapConfig('runtime', 'build').tiles.carto).toContain('?key=runtime');
    expect(createMapConfig(undefined, 'development').tiles.carto).toContain('?key=development');
    expect(createMapConfig('', 'old-build-key').cartoAvailable).toBe(false);
  });
  it('preserves satellite and simple modes', () => {
    const config = createMapConfig('fixture');
    expect(config.tiles.satellite).toContain('World_Imagery/MapServer/tile/{z}/{y}/{x}');
    expect(config.tiles.simple).toBe('');
  });
});
