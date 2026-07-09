import { Maximize2, Minimize2, Minus, Plus } from 'lucide-react';
import { useMap } from 'react-leaflet';

export function MapExpandButton({ onExpand, mode = 'expand' }: { onExpand: () => void; mode?: 'expand' | 'collapse' }) {
    const map = useMap();
    const ToggleIcon = mode === 'collapse' ? Minimize2 : Maximize2;
    const toggleLabel = mode === 'collapse' ? 'Encolher mapa' : 'Expandir mapa';

    return (
        <div className="absolute top-2.5 left-2.5 z-[999] pointer-events-auto flex flex-col rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-md">
            <button
                onClick={() => map.zoomIn()}
                title="Aumentar zoom"
                aria-label="Aumentar zoom"
                className="flex items-center justify-center p-2 border-b border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
                <Plus size={15} />
            </button>
            <button
                onClick={() => map.zoomOut()}
                title="Diminuir zoom"
                aria-label="Diminuir zoom"
                className="flex items-center justify-center p-2 border-b border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
                <Minus size={15} />
            </button>
            <button
                onClick={onExpand}
                title={toggleLabel}
                aria-label={toggleLabel}
                className="flex items-center justify-center p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
                <ToggleIcon size={15} />
            </button>
        </div>
    );
}
