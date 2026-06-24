import React, { useState, useEffect } from 'react';
import { Check, X, AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import { cn } from '../lib/utils';

interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface AlertItem {
  title: string;
  message: string;
  type: 'warning' | 'info' | 'error';
}

export default function NotificationContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [alert, setAlert] = useState<AlertItem | null>(null);

  useEffect(() => {
    const handleToast = (e: Event) => {
      const { message, type } = (e as CustomEvent).detail;
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, message, type }]);

      // Auto dismiss after 4 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    };

    const handleAlert = (e: Event) => {
      const { title, message, type } = (e as CustomEvent).detail;
      setAlert({ title, message, type });
    };

    window.addEventListener('drcae-toast', handleToast);
    window.addEventListener('drcae-alert', handleAlert);

    return () => {
      window.removeEventListener('drcae-toast', handleToast);
      window.removeEventListener('drcae-alert', handleAlert);
    };
  }, []);

  return (
    <>
      {/* Toast Area */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-center gap-3 p-3.5 rounded-xl shadow-xl border text-xs font-bold animate-in fade-in slide-in-from-top-4 duration-300",
              t.type === 'success' ? "bg-slate-900/95 backdrop-blur-md text-white border-slate-800" :
              t.type === 'error' ? "bg-red-600/95 backdrop-blur-md text-white border-red-500" :
              "bg-indigo-600/95 backdrop-blur-md text-white border-indigo-500"
            )}
          >
            {t.type === 'success' && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
            {t.type === 'error' && <X className="w-4 h-4 text-red-200 shrink-0" />}
            {t.type === 'info' && <Info className="w-4 h-4 text-blue-200 shrink-0" />}
            <span className="flex-1 text-left leading-normal">{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
              className="p-1 rounded-md text-white/60 hover:text-white hover:bg-white/10 shrink-0 transition-colors pointer-events-auto"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Alert Modal / Dialog */}
      {alert && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-xs",
                alert.type === 'warning' ? "bg-amber-100 text-amber-600" :
                alert.type === 'error' ? "bg-red-100 text-red-600" :
                "bg-blue-100 text-blue-600"
              )}>
                {alert.type === 'warning' && <AlertTriangle className="w-6 h-6" />}
                {alert.type === 'error' && <ShieldAlert className="w-6 h-6" />}
                {alert.type === 'info' && <Info className="w-6 h-6" />}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <h3 className="font-extrabold text-slate-900 text-base leading-snug">{alert.title}</h3>
                <p className="text-xs text-slate-500 font-medium leading-relaxed mt-2 whitespace-pre-line">
                  {alert.message}
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setAlert(null)}
                className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] uppercase tracking-wider"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
