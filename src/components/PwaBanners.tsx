import React from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { useSwUpdate } from '../hooks/useSwUpdate';

export default function PwaBanners() {
  const { canInstall, install, dismiss } = usePwaInstall();
  const { needRefresh, updateServiceWorker } = useSwUpdate();

  if (!canInstall && !needRefresh) return null;

  return (
    <div className="flex flex-col gap-1 shrink-0">
      {needRefresh && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-indigo-700 text-white text-xs font-medium">
          <span>Nova versão disponível</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateServiceWorker(true)}
              className="flex items-center gap-1.5 px-3 py-1 bg-white text-indigo-700 rounded-full font-semibold hover:bg-indigo-50 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Actualizar
            </button>
          </div>
        </div>
      )}
      {canInstall && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-emerald-700 text-white text-xs font-medium">
          <span>Instale o app para acesso offline completo</span>
          <div className="flex items-center gap-2">
            <button
              onClick={install}
              className="flex items-center gap-1.5 px-3 py-1 bg-white text-emerald-700 rounded-full font-semibold hover:bg-emerald-50 transition-colors"
            >
              <Download className="w-3 h-3" />
              Instalar
            </button>
            <button
              onClick={dismiss}
              className="p-1 rounded-full hover:bg-emerald-600 transition-colors"
              aria-label="Dispensar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
