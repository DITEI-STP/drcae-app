import { CARTO_AVAILABLE, type MapProvider } from './map-config';
export { MAP_TILE_LAYERS, MAP_ATTRIBUTIONS, type MapProvider } from './map-config';

const PROVIDERS: { id: MapProvider; label: string }[] = [
  { id: 'osm', label: 'OSM' },
  { id: 'carto', label: 'Carto' },
  { id: 'satellite', label: 'Satélite' },
  { id: 'simple', label: 'Simples' },
];

export function MapLayerSwitcher({
  value,
  onChange,
}: {
  value: MapProvider;
  onChange: (v: MapProvider) => void;
}) {
  return (
    <div className="absolute top-2 right-2 z-[999] pointer-events-auto">
      <div className="flex gap-0.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg p-1">
        {PROVIDERS.filter(({ id }) => id !== 'carto' || CARTO_AVAILABLE).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
              value === id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
