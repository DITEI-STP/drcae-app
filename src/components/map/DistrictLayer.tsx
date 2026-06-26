import { useMemo } from 'react';
import { GeoJSON } from 'react-leaflet';
import * as topojson from 'topojson-client';
import districtsData from '../../assets/districts.json';

const DISTRICT_COLORS: Record<string, string> = {
  'Água Grande': '#3b82f6',
  'Mé-Zóchi': '#10b981',
  'Mé-zóxi': '#10b981',
  'Lobata': '#f59e0b',
  'Cantagalo': '#ef4444',
  'Lembá': '#8b5cf6',
  'Lemba': '#8b5cf6',
  'Caué': '#ec4899',
  'RAP': '#06b6d4',
  'Pagué': '#06b6d4',
  'Principe': '#06b6d4',
};

const NAME_FIXES: Record<string, string> = {
  'Mé-zóxi': 'Mé-Zóchi',
  'Lemba': 'Lembá',
  'Pagué': 'RAP',
  'Principe': 'RAP',
};

function getDistrictStyle(feature: any, fillOpacity: number) {
  const name: string = feature?.properties?.shapeName || feature?.properties?.name || '';
  const key = Object.keys(DISTRICT_COLORS).find((k) => name.includes(k));
  return {
    fillColor: key ? DISTRICT_COLORS[key] : '#94a3b8',
    weight: 1.5,
    opacity: 1,
    color: 'white',
    fillOpacity,
  };
}

export function DistrictLayer({ fillOpacity = 0.08 }: { fillOpacity?: number }) {
  const geoJson = useMemo(() => {
    const data = districtsData as any;
    if (data.type === 'Topology') {
      const key = Object.keys(data.objects)[0];
      return topojson.feature(data, data.objects[key]);
    }
    return JSON.parse(JSON.stringify(data));
  }, []);

  const onEachFeature = (feature: any, layer: any) => {
    let name: string = feature?.properties?.shapeName || feature?.properties?.name || 'Distrito';
    if (NAME_FIXES[name]) name = NAME_FIXES[name];
    layer.bindTooltip(name, { permanent: false, direction: 'center' });
    layer.on({
      mouseover: (e: any) => {
        e.target.setStyle({ fillOpacity: Math.min(fillOpacity + 0.18, 0.45), weight: 2.5, color: '#2563eb' });
      },
      mouseout: (e: any) => {
        e.target.setStyle(getDistrictStyle(feature, fillOpacity));
      },
    });
  };

  if (!geoJson) return null;

  return (
    <GeoJSON
      key="districts"
      data={geoJson as any}
      style={(feature) => getDistrictStyle(feature, fillOpacity)}
      onEachFeature={onEachFeature}
    />
  );
}
