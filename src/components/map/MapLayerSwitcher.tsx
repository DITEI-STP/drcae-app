export type MapProvider = 'osm' | 'carto' | 'satellite' | 'simple';

export const MAP_TILE_LAYERS: Record<Exclude<MapProvider, 'simple'>, string> = {
  osm: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  carto: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
};

export const MAP_ATTRIBUTIONS: Record<MapProvider, string> = {
  osm: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  carto: '&copy; <a href="https://carto.com/attributions">CARTO</a>',
  satellite: 'Tiles &copy; Esri',
  simple: '',
};

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
        {PROVIDERS.map(({ id, label }) => (
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
