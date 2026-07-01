import { Maximize2 } from 'lucide-react';

export function MapExpandButton({ onExpand }: { onExpand: () => void }) {
    return (
        <div className="absolute top-20 left-2.5 z-[999] pointer-events-auto">
            <button
                onClick={onExpand}
                title="Expandir mapa"
                className="flex items-center gap-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border border-slate-200 dark:border-white/10 shadow-md px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
                <Maximize2 size={13} />
                Expandir
            </button>
        </div>
    );
}
