import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ExpandMode = 'normal' | 'full';

export interface MapOriginRect {
    top: number;
    left: number;
    width: number;
    height: number;
}

interface MapExpandOverlayProps {
    mode: ExpandMode;
    onClose: () => void;
    onModeChange: (mode: ExpandMode) => void;
    title?: string;
    /** Posição/tamanho do cartão de mapa de origem, usada para animar o "crescimento" até ao ecrã cheio e o "regresso" ao encolher. */
    originRect?: MapOriginRect | null;
    children: React.ReactNode | ((collapse: () => void) => React.ReactNode);
}

const TRANSITION_MS = 320;

function originTransform(rect: MapOriginRect | null | undefined): string {
    if (!rect || typeof window === 'undefined' || !window.innerWidth || !window.innerHeight) {
        return 'translate(0px, 0px) scale(1, 1)';
    }
    const scaleX = rect.width / window.innerWidth;
    const scaleY = rect.height / window.innerHeight;
    return `translate(${rect.left}px, ${rect.top}px) scale(${scaleX}, ${scaleY})`;
}

function Overlay({ mode, onClose, onModeChange, title, originRect, children }: MapExpandOverlayProps) {
    const [open, setOpen] = useState(false);
    const shrunkTransform = useMemo(() => originTransform(originRect), [originRect]);
    const nodeRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Força o browser a pintar o estado inicial (encolhido, na posição de
        // origem) antes de mudar para o estado aberto — sem este reflow
        // síncrono as duas mudanças de "transform" podem ser fundidas no
        // mesmo frame e a transição de zoom não chega a ser vista (só o
        // fade do "opacity" fica percetível).
        nodeRef.current?.getBoundingClientRect();
        let raf2 = 0;
        const raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(() => setOpen(true));
        });
        return () => {
            cancelAnimationFrame(raf1);
            cancelAnimationFrame(raf2);
        };
    }, []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleClose = () => {
        setOpen(false);
        setTimeout(onClose, TRANSITION_MS);
    };

    return (
        <div
            ref={nodeRef}
            className="fixed inset-0 z-[9990] flex flex-col"
            style={{
                transform: open ? 'translate(0px, 0px) scale(1, 1)' : shrunkTransform,
                transformOrigin: 'top left',
                opacity: open ? 1 : 0.6,
                transition: `transform ${TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${TRANSITION_MS}ms ease-out`,
                willChange: 'transform, opacity',
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
