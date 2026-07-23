import React from 'react';
import { Download, X } from 'lucide-react';
import { usePwaInstall } from '../hooks/usePwaInstall';

// Actualizações do service worker são automáticas e silenciosas
// (vite.config.ts: registerType: 'autoUpdate') — o dispositivo em kiosk não
// tem ninguém para clicar num banner "Actualizar", por isso não há um aqui.
export default function PwaBanners() {
  const { canInstall, install, dismiss } = usePwaInstall();

  if (!canInstall) return null;

  return (
    <div className="flex flex-col gap-1 shrink-0">
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
