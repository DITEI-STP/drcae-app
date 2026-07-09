import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export type ExpandMode = 'normal' | 'full';

interface MapExpandOverlayProps {
    mode: ExpandMode;
    onClose: () => void;
    onModeChange: (mode: ExpandMode) => void;
    title?: string;
    children: React.ReactNode | ((collapse: () => void) => React.ReactNode);
}

function Overlay({ mode, onClose, onModeChange, title, children }: MapExpandOverlayProps) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const id = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(id);
    }, []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleClose = () => {
        setVisible(false);
        setTimeout(onClose, 200);
    };

    const positionClass = mode === 'full' ? 'inset-0' : 'inset-0';

    return (
        <div
            className={`fixed ${positionClass} z-[9990] flex flex-col`}
            style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'scale(1)' : 'scale(0.98)',
                transition: `opacity ${visible ? '0.25s' : '0.2s'} ease-out, transform ${visible ? '0.25s' : '0.2s'} ease-out`,
            }}
        >
            <div className="h-12 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-white/10 flex items-center px-4 gap-3 shrink-0 shadow-sm z-10">
                {title && (
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate select-none">{title}</span>
                )}

                <div className="flex items-center gap-1 shrink-0 ml-auto">
                    <button
                        onClick={() => onModeChange('normal')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                            mode === 'normal' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                    >
                        Normal
                    </button>
                    <button
                        onClick={() => onModeChange('full')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                            mode === 'full' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                    >
                        Total
                    </button>
                </div>
            </div>

            <div className="flex-1 relative overflow-hidden">
                {typeof children === 'function' ? children(handleClose) : children}
            </div>
        </div>
    );
}

export function MapExpandOverlay(props: MapExpandOverlayProps) {
    return createPortal(<Overlay {...props} />, document.body);
}
